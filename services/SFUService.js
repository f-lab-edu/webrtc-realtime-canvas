/**
 * SFU 서비스
 * mediasoup-client를 래핑하여 SFU 서버와의 미디어 송수신 관리
 *
 * 설계 의도:
 * - mediasoup-client Device 인스턴스 관리
 * - Transport (Send/Recv) 생성 및 연결
 * - Producer/Consumer 생명주기 관리
 * - SocketService를 통한 시그널링
 *
 * @see design/client-architecture.md 섹션 3.1
 */
import { Device } from "mediasoup-client";

/**
 * Simulcast 인코딩 설정
 * 서버 설정(mediasoupConfig.js)과 동일한 값 사용
 */
const SIMULCAST_ENCODINGS = [
  { rid: "r0", maxBitrate: 100000, scaleResolutionDownBy: 4 }, // Low
  { rid: "r1", maxBitrate: 300000, scaleResolutionDownBy: 2 }, // Medium
  { rid: "r2", maxBitrate: 900000, scaleResolutionDownBy: 1 }, // High
];

/**
 * ICE 연결 재시도 설정
 */
const ICE_RETRY_CONFIG = {
  maxRetries: 3,
  retryDelayMs: 1000,
};

class SFUService {
  constructor() {
    /** @type {Device|null} mediasoup-client Device 인스턴스 */
    this.device = null;

    /** @type {Object|null} 송신용 Transport */
    this.sendTransport = null;

    /** @type {Object|null} 수신용 Transport */
    this.recvTransport = null;

    /** @type {Map<string, Object>} producerId → Producer 인스턴스 */
    this.producers = new Map();

    /** @type {Map<string, Object>} consumerId → Consumer 인스턴스 */
    this.consumers = new Map();

    /** @type {Object|null} SocketService 인스턴스 참조 */
    this.socketService = null;

    /** @type {string|null} 현재 방 ID */
    this.roomId = null;

    /** @type {boolean} Device 로드 완료 여부 */
    this.isDeviceLoaded = false;

    /**
     * 이벤트 핸들러
     * 직접 할당 방식 (기존 WebRTCService 패턴)
     */
    this.handlers = {
      /** @type {Function|null} 새 Producer 생성 시 */
      onProducerCreated: null,
      /** @type {Function|null} 새 Consumer 생성 시 */
      onConsumerCreated: null,
      /** @type {Function|null} Transport 연결 상태 변경 시 */
      onConnectionStateChange: null,
      /** @type {Function|null} 에러 발생 시 */
      onError: null,
    };

    console.log("[SFUService] 인스턴스 생성");
  }

  /**
   * SocketService 설정
   * @param {Object} socketService - SocketService 인스턴스
   */
  setSocketService(socketService) {
    if (!socketService) {
      throw new Error("[SFUService] socketService는 필수입니다");
    }
    this.socketService = socketService;
    console.log("[SFUService] SocketService 설정 완료");
  }

  /**
   * Device 초기화
   * 서버에서 Router RTP Capabilities를 받아 Device 로드
   *
   * @param {string} roomId - 방 ID
   * @returns {Promise<Object>} rtpCapabilities
   */
  async loadDevice(roomId) {
    if (!roomId) {
      throw new Error("[SFUService] roomId는 필수입니다");
    }

    if (!this.socketService) {
      throw new Error("[SFUService] socketService가 설정되지 않았습니다");
    }

    this.roomId = roomId;

    try {
      // 서버에서 Router RTP Capabilities 요청
      const response = await this._emitWithAck("sfu:get-router-rtp-capabilities", { roomId });

      if (response.error) {
        throw new Error(response.error);
      }

      const { rtpCapabilities } = response;

      // Device 생성 및 로드
      this.device = new Device();
      await this.device.load({ routerRtpCapabilities: rtpCapabilities });

      this.isDeviceLoaded = true;

      console.log("[SFUService] Device 로드 완료", {
        canProduce: {
          video: this.device.canProduce("video"),
          audio: this.device.canProduce("audio"),
        },
      });

      return rtpCapabilities;
    } catch (error) {
      console.error("[SFUService] Device 로드 실패:", error);
      this._handleError(error);
      throw error;
    }
  }

  /**
   * 송신용 Transport 생성
   * @returns {Promise<Object>} Transport 파라미터
   */
  async createSendTransport() {
    if (!this.isDeviceLoaded) {
      throw new Error("[SFUService] Device가 로드되지 않았습니다");
    }

    try {
      const response = await this._emitWithAck("sfu:create-send-transport", {
        roomId: this.roomId,
      });

      if (response.error) {
        throw new Error(response.error);
      }

      const { id, iceParameters, iceCandidates, dtlsParameters } = response;

      // Send Transport 생성
      this.sendTransport = this.device.createSendTransport({
        id,
        iceParameters,
        iceCandidates,
        dtlsParameters,
      });

      // Transport 이벤트 핸들러 등록
      this._setupTransportEvents(this.sendTransport, "send");

      console.log("[SFUService] Send Transport 생성 완료:", id);

      return response;
    } catch (error) {
      console.error("[SFUService] Send Transport 생성 실패:", error);
      this._handleError(error);
      throw error;
    }
  }

  /**
   * 수신용 Transport 생성
   * @returns {Promise<Object>} Transport 파라미터
   */
  async createRecvTransport() {
    if (!this.isDeviceLoaded) {
      throw new Error("[SFUService] Device가 로드되지 않았습니다");
    }

    try {
      const response = await this._emitWithAck("sfu:create-recv-transport", {
        roomId: this.roomId,
      });

      if (response.error) {
        throw new Error(response.error);
      }

      const { id, iceParameters, iceCandidates, dtlsParameters } = response;

      // Recv Transport 생성
      this.recvTransport = this.device.createRecvTransport({
        id,
        iceParameters,
        iceCandidates,
        dtlsParameters,
      });

      // Transport 이벤트 핸들러 등록
      this._setupTransportEvents(this.recvTransport, "recv");

      console.log("[SFUService] Recv Transport 생성 완료:", id);

      return response;
    } catch (error) {
      console.error("[SFUService] Recv Transport 생성 실패:", error);
      this._handleError(error);
      throw error;
    }
  }

  /**
   * Transport 이벤트 핸들러 설정
   * @param {Object} transport - Transport 인스턴스
   * @param {string} type - 'send' | 'recv'
   * @private
   */
  _setupTransportEvents(transport, type) {
    // connect 이벤트: DTLS 핸드셰이크 (수명 주기 동안 한 번만 발생)
    transport.on("connect", async ({ dtlsParameters }, callback, errback) => {
      console.log(`[SFUService] ${type} Transport connect 이벤트`);

      try {
        const response = await this._emitWithAckRetry(
          "sfu:connect-transport",
          {
            transportId: transport.id,
            dtlsParameters,
          },
          ICE_RETRY_CONFIG.maxRetries
        );

        if (response.error) {
          throw new Error(response.error);
        }

        callback();
        console.log(`[SFUService] ${type} Transport 연결 완료`);
      } catch (error) {
        console.error(`[SFUService] ${type} Transport 연결 실패:`, error);
        errback(error);
      }
    });

    // produce 이벤트: Send Transport에서만 발생
    if (type === "send") {
      transport.on("produce", async ({ kind, rtpParameters, appData }, callback, errback) => {
        console.log(`[SFUService] produce 이벤트: kind=${kind}`);

        try {
          const response = await this._emitWithAck("sfu:produce", {
            transportId: transport.id,
            kind,
            rtpParameters,
            appData,
          });

          if (response.error) {
            throw new Error(response.error);
          }

          callback({ id: response.id });
          console.log(`[SFUService] Producer 생성 완료: ${response.id}`);
        } catch (error) {
          console.error("[SFUService] produce 실패:", error);
          errback(error);
        }
      });
    }

    // connectionstatechange 이벤트
    transport.on("connectionstatechange", (state) => {
      console.log(`[SFUService] ${type} Transport 상태 변경: ${state}`);

      if (this.handlers.onConnectionStateChange) {
        this.handlers.onConnectionStateChange(type, state);
      }

      if (state === "failed") {
        console.error(`[SFUService] ${type} Transport 연결 실패`);
        this._handleError(new Error(`${type} Transport connection failed`));
      }
    });
  }

  /**
   * Producer 생성 (미디어 송신)
   * @param {MediaStreamTrack} track - 비디오 또는 오디오 트랙
   * @param {Object} appData - 추가 메타데이터 (예: screenShare 여부)
   * @returns {Promise<Object>} Producer 인스턴스
   */
  async produce(track, appData = {}) {
    if (!track) {
      throw new Error("[SFUService] track은 필수입니다");
    }

    if (!this.sendTransport) {
      throw new Error("[SFUService] Send Transport가 생성되지 않았습니다");
    }

    const kind = track.kind;

    // 동일 kind의 기존 Producer 확인
    const existingProducer = this._getProducerByKind(kind);
    if (existingProducer) {
      console.warn(`[SFUService] 기존 ${kind} Producer 존재, 교체 진행`);
      await this.closeProducer(existingProducer.id);
    }

    try {
      // Producer 옵션 구성
      const produceOptions = {
        track,
        appData: { ...appData, kind },
      };

      // 비디오인 경우 Simulcast 인코딩 적용
      if (kind === "video" && !appData.screenShare) {
        produceOptions.encodings = SIMULCAST_ENCODINGS;
        produceOptions.codecOptions = {
          videoGoogleStartBitrate: 1000,
        };
        console.log("[SFUService] Simulcast 인코딩 적용");
      }

      const producer = await this.sendTransport.produce(produceOptions);

      // Producer 저장
      this.producers.set(producer.id, producer);

      // Producer 이벤트 핸들러
      producer.on("trackended", () => {
        console.log(`[SFUService] Producer 트랙 종료: ${producer.id}`);
        this.closeProducer(producer.id);
      });

      producer.on("transportclose", () => {
        console.log(`[SFUService] Producer Transport 종료: ${producer.id}`);
        this.producers.delete(producer.id);
      });

      // 핸들러 호출
      if (this.handlers.onProducerCreated) {
        this.handlers.onProducerCreated(producer);
      }

      console.log(`[SFUService] ${kind} Producer 생성 완료:`, producer.id);

      return producer;
    } catch (error) {
      console.error("[SFUService] Producer 생성 실패:", error);
      this._handleError(error);
      throw error;
    }
  }

  /**
   * Consumer 생성 (미디어 수신)
   * @param {string} producerId - 구독할 Producer ID
   * @param {string} producerSocketId - Producer 소유자의 Socket ID
   * @returns {Promise<Object>} Consumer 인스턴스
   */
  async consume(producerId, producerSocketId) {
    if (!producerId) {
      throw new Error("[SFUService] producerId는 필수입니다");
    }

    if (!this.recvTransport) {
      throw new Error("[SFUService] Recv Transport가 생성되지 않았습니다");
    }

    if (!this.device) {
      throw new Error("[SFUService] Device가 로드되지 않았습니다");
    }

    try {
      const response = await this._emitWithAck("sfu:consume-with-transport", {
        roomId: this.roomId,
        transportId: this.recvTransport.id,
        producerId,
        rtpCapabilities: this.device.rtpCapabilities,
      });

      if (response.error) {
        throw new Error(response.error);
      }

      const { id, kind, rtpParameters } = response;

      // Consumer 생성
      const consumer = await this.recvTransport.consume({
        id,
        producerId,
        kind,
        rtpParameters,
      });

      // Consumer 저장 (producerSocketId 포함)
      consumer.producerSocketId = producerSocketId;
      this.consumers.set(consumer.id, consumer);

      // Consumer 이벤트 핸들러
      consumer.on("transportclose", () => {
        console.log(`[SFUService] Consumer Transport 종료: ${consumer.id}`);
        this.consumers.delete(consumer.id);
      });

      // Consumer는 기본 일시정지 상태, 재개 요청
      await this._emitWithAck("sfu:resume-consumer", { consumerId: id });

      // 핸들러 호출
      if (this.handlers.onConsumerCreated) {
        this.handlers.onConsumerCreated(consumer);
      }

      console.log(`[SFUService] ${kind} Consumer 생성 완료:`, {
        consumerId: id,
        producerId,
        producerSocketId,
      });

      return consumer;
    } catch (error) {
      console.error("[SFUService] Consumer 생성 실패:", error);
      this._handleError(error);
      throw error;
    }
  }

  /**
   * Producer 일시정지
   * @param {string} producerId - Producer ID
   */
  async pauseProducer(producerId) {
    const producer = this.producers.get(producerId);
    if (!producer) {
      console.warn(`[SFUService] Producer를 찾을 수 없음: ${producerId}`);
      return;
    }

    try {
      await producer.pause();
      await this._emitWithAck("sfu:pause-producer", { producerId });
      console.log(`[SFUService] Producer 일시정지: ${producerId}`);
    } catch (error) {
      console.error("[SFUService] Producer 일시정지 실패:", error);
      this._handleError(error);
    }
  }

  /**
   * Producer 재개
   * @param {string} producerId - Producer ID
   */
  async resumeProducer(producerId) {
    const producer = this.producers.get(producerId);
    if (!producer) {
      console.warn(`[SFUService] Producer를 찾을 수 없음: ${producerId}`);
      return;
    }

    try {
      await producer.resume();
      await this._emitWithAck("sfu:resume-producer", { producerId });
      console.log(`[SFUService] Producer 재개: ${producerId}`);
    } catch (error) {
      console.error("[SFUService] Producer 재개 실패:", error);
      this._handleError(error);
    }
  }

  /**
   * Producer 종료
   * @param {string} producerId - Producer ID
   */
  async closeProducer(producerId) {
    const producer = this.producers.get(producerId);
    if (!producer) {
      console.warn(`[SFUService] Producer를 찾을 수 없음: ${producerId}`);
      return;
    }

    try {
      producer.close();
      this.producers.delete(producerId);
      await this._emitWithAck("sfu:close-producer", { producerId });
      console.log(`[SFUService] Producer 종료: ${producerId}`);
    } catch (error) {
      console.error("[SFUService] Producer 종료 실패:", error);
      this._handleError(error);
    }
  }

  /**
   * Consumer 종료
   * @param {string} consumerId - Consumer ID
   */
  closeConsumer(consumerId) {
    const consumer = this.consumers.get(consumerId);
    if (!consumer) {
      console.warn(`[SFUService] Consumer를 찾을 수 없음: ${consumerId}`);
      return;
    }

    consumer.close();
    this.consumers.delete(consumerId);
    console.log(`[SFUService] Consumer 종료: ${consumerId}`);
  }

  /**
   * 특정 socketId의 모든 Consumer 종료
   * @param {string} socketId - Socket ID
   */
  closeConsumersBySocketId(socketId) {
    for (const [consumerId, consumer] of this.consumers.entries()) {
      if (consumer.producerSocketId === socketId) {
        this.closeConsumer(consumerId);
      }
    }
    console.log(`[SFUService] socketId=${socketId}의 Consumer 모두 종료`);
  }

  /**
   * 특정 producerId의 Consumer 조회
   * @param {string} producerId - Producer ID
   * @returns {Object|undefined} Consumer 인스턴스
   */
  getConsumerByProducerId(producerId) {
    for (const consumer of this.consumers.values()) {
      if (consumer.producerId === producerId) {
        return consumer;
      }
    }
    return undefined;
  }

  /**
   * 기존 Producer 목록 조회
   * @returns {Promise<Array>} Producer 목록
   */
  async getExistingProducers() {
    try {
      const response = await this._emitWithAck("sfu:get-producers", {
        roomId: this.roomId,
      });

      if (response.error) {
        throw new Error(response.error);
      }

      console.log(`[SFUService] 기존 Producer 조회: ${response.producers?.length || 0}개`);
      return response.producers || [];
    } catch (error) {
      console.error("[SFUService] Producer 목록 조회 실패:", error);
      this._handleError(error);
      return [];
    }
  }

  /**
   * Device RTP Capabilities 반환
   * @returns {Object|null}
   */
  getRtpCapabilities() {
    return this.device?.rtpCapabilities || null;
  }

  /**
   * 모든 리소스 정리
   */
  cleanup() {
    console.log("[SFUService] 리소스 정리 시작");

    // Producers 정리
    for (const [producerId, producer] of this.producers.entries()) {
      try {
        producer.close();
      } catch (e) {
        console.warn(`[SFUService] Producer 정리 에러: ${producerId}`, e);
      }
    }
    this.producers.clear();

    // Consumers 정리
    for (const [consumerId, consumer] of this.consumers.entries()) {
      try {
        consumer.close();
      } catch (e) {
        console.warn(`[SFUService] Consumer 정리 에러: ${consumerId}`, e);
      }
    }
    this.consumers.clear();

    // Transports 정리
    if (this.sendTransport) {
      try {
        this.sendTransport.close();
      } catch (e) {
        console.warn("[SFUService] Send Transport 정리 에러:", e);
      }
      this.sendTransport = null;
    }

    if (this.recvTransport) {
      try {
        this.recvTransport.close();
      } catch (e) {
        console.warn("[SFUService] Recv Transport 정리 에러:", e);
      }
      this.recvTransport = null;
    }

    // 상태 초기화
    this.device = null;
    this.isDeviceLoaded = false;
    this.roomId = null;

    console.log("[SFUService] 리소스 정리 완료");
  }

  // ============ 이벤트 핸들러 등록 메서드 ============

  /**
   * Producer 생성 이벤트 핸들러 등록
   * @param {Function} handler
   */
  onProducerCreated(handler) {
    this.handlers.onProducerCreated = handler;
  }

  /**
   * Consumer 생성 이벤트 핸들러 등록
   * @param {Function} handler
   */
  onConsumerCreated(handler) {
    this.handlers.onConsumerCreated = handler;
  }

  /**
   * 연결 상태 변경 이벤트 핸들러 등록
   * @param {Function} handler - (type: 'send'|'recv', state: string) => void
   */
  onConnectionStateChange(handler) {
    this.handlers.onConnectionStateChange = handler;
  }

  /**
   * 에러 이벤트 핸들러 등록
   * @param {Function} handler
   */
  onError(handler) {
    this.handlers.onError = handler;
  }

  // ============ Private 메서드 ============

  /**
   * kind로 Producer 조회
   * @param {string} kind - 'audio' | 'video'
   * @returns {Object|undefined}
   * @private
   */
  _getProducerByKind(kind) {
    for (const producer of this.producers.values()) {
      if (producer.kind === kind) {
        return producer;
      }
    }
    return undefined;
  }

  /**
   * Socket emit with acknowledgment
   * @param {string} event - 이벤트명
   * @param {Object} data - 데이터
   * @returns {Promise<Object>}
   * @private
   */
  _emitWithAck(event, data) {
    return new Promise((resolve, reject) => {
      if (!this.socketService || !this.socketService.isSocketConnected()) {
        reject(new Error("[SFUService] Socket이 연결되지 않았습니다"));
        return;
      }

      this.socketService.socket.emit(event, data, (response) => {
        resolve(response);
      });
    });
  }

  /**
   * Socket emit with acknowledgment + 재시도
   * @param {string} event - 이벤트명
   * @param {Object} data - 데이터
   * @param {number} retries - 재시도 횟수
   * @returns {Promise<Object>}
   * @private
   */
  async _emitWithAckRetry(event, data, retries = ICE_RETRY_CONFIG.maxRetries) {
    let lastError;

    for (let i = 0; i < retries; i++) {
      try {
        const response = await this._emitWithAck(event, data);
        return response;
      } catch (error) {
        lastError = error;
        console.warn(`[SFUService] ${event} 재시도 ${i + 1}/${retries}:`, error.message);

        if (i < retries - 1) {
          await new Promise((resolve) => setTimeout(resolve, ICE_RETRY_CONFIG.retryDelayMs));
        }
      }
    }

    throw lastError;
  }

  /**
   * 에러 핸들러 호출
   * @param {Error} error
   * @private
   */
  _handleError(error) {
    if (this.handlers.onError) {
      this.handlers.onError(error);
    }
  }
}

export default SFUService;
