/**
 * SFU 서비스 (Facade 패턴)
 * mediasoup-client를 래핑하여 SFU 서버와의 미디어 송수신 관리
 *
 * 설계:
 * - 기존 API 100% 호환성 유지
 * - 내부적으로 5개의 Manager로 책임 분리
 * - Manager 간 의존성을 생성자 주입으로 해결
 *
 * Manager 구조:
 * - SFUSocketAdapter: Socket 통신 추상화
 * - SFUDeviceManager: Device 로드 및 RTP Capabilities
 * - SFUTransportManager: Send/Recv Transport 생성 및 이벤트
 * - SFUProducerManager: Producer 생성/관리 (Simulcast)
 * - SFUConsumerManager: Consumer 생성/관리
 *
 * @see design/client-architecture.md 섹션 3.1
 */

import SFUSocketAdapter from "./sfu/SFUSocketAdapter.js";
import SFUDeviceManager from "./sfu/SFUDeviceManager.js";
import SFUTransportManager from "./sfu/SFUTransportManager.js";
import SFUProducerManager from "./sfu/SFUProducerManager.js";
import SFUConsumerManager from "./sfu/SFUConsumerManager.js";

class SFUService {
  constructor() {
    // ============ Manager 인스턴스 생성 및 의존성 주입 ============

    // 1. Socket 통신 어댑터
    this.socketAdapter = new SFUSocketAdapter();

    // 2. Device Manager (의존: SocketAdapter)
    this.deviceManager = new SFUDeviceManager(this.socketAdapter);

    // 3. Transport Manager (의존: DeviceManager, SocketAdapter)
    this.transportManager = new SFUTransportManager(this.deviceManager, this.socketAdapter);

    // 4. Producer Manager (의존: TransportManager)
    this.producerManager = new SFUProducerManager(this.transportManager);

    // 5. Consumer Manager (의존: DeviceManager, TransportManager, SocketAdapter)
    this.consumerManager = new SFUConsumerManager(
      this.deviceManager,
      this.transportManager,
      this.socketAdapter
    );

    // ============ 이벤트 핸들러 저장소 ============

    /**
     * 이벤트 핸들러
     * 직접 할당 방식 (기존 API 호환)
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

    // ============ 핸들러 주입 (Manager → SFUService) ============

    // Transport Manager → SFUService 연결 상태 콜백
    this.transportManager.onConnectionStateChange = (type, state) => {
      if (this.handlers.onConnectionStateChange) {
        this.handlers.onConnectionStateChange(type, state);
      }

      // failed 상태 시 에러 핸들러 호출
      if (state === "failed" && this.handlers.onError) {
        this.handlers.onError(new Error(`${type} Transport connection failed`));
      }
    };

    // Producer Manager → SFUService Producer 생성 콜백
    this.producerManager.onProducerCreated = (producer) => {
      if (this.handlers.onProducerCreated) {
        this.handlers.onProducerCreated(producer);
      }
    };

    // Consumer Manager → SFUService Consumer 생성 콜백
    this.consumerManager.onConsumerCreated = (consumer) => {
      if (this.handlers.onConsumerCreated) {
        this.handlers.onConsumerCreated(consumer);
      }
    };

    console.log("[SFUService] 인스턴스 생성 (Facade 패턴)");
  }

  // ============ 기존 API - 초기화 ============

  /**
   * SocketService 설정
   * @param {Object} socketService - SocketService 인스턴스
   */
  setSocketService(socketService) {
    this.socketAdapter.setSocketService(socketService);
  }

  /**
   * Device 초기화
   * 서버에서 Router RTP Capabilities를 받아 Device 로드
   *
   * @param {string} roomId - 방 ID
   * @returns {Promise<Object>} rtpCapabilities
   */
  async loadDevice(roomId) {
    try {
      return await this.deviceManager.loadDevice(roomId);
    } catch (error) {
      this._handleError(error);
      throw error;
    }
  }

  /**
   * 송신용 Transport 생성
   * @returns {Promise<Object>} Transport 파라미터
   */
  async createSendTransport() {
    try {
      return await this.transportManager.createSendTransport();
    } catch (error) {
      this._handleError(error);
      throw error;
    }
  }

  /**
   * 수신용 Transport 생성
   * @returns {Promise<Object>} Transport 파라미터
   */
  async createRecvTransport() {
    try {
      return await this.transportManager.createRecvTransport();
    } catch (error) {
      this._handleError(error);
      throw error;
    }
  }

  // ============ 기존 API - Producer 관리 ============

  /**
   * Producer 생성 (미디어 송신)
   * @param {MediaStreamTrack} track - 비디오 또는 오디오 트랙
   * @param {Object} appData - 추가 메타데이터 (예: screenShare 여부)
   * @returns {Promise<Object>} Producer 인스턴스
   */
  async produce(track, appData = {}) {
    try {
      return await this.producerManager.produce(track, appData);
    } catch (error) {
      this._handleError(error);
      throw error;
    }
  }

  /**
   * Producer 일시정지
   * @param {string} producerId - Producer ID
   */
  async pauseProducer(producerId) {
    try {
      await this.producerManager.pauseProducer(producerId);

      // 서버에 알림
      await this.socketAdapter.emitWithAck("sfu:pause-producer", { producerId });
      console.log(`[SFUService] Producer 일시정지 서버 알림: ${producerId}`);
    } catch (error) {
      this._handleError(error);
    }
  }

  /**
   * Producer 재개
   * @param {string} producerId - Producer ID
   */
  async resumeProducer(producerId) {
    try {
      await this.producerManager.resumeProducer(producerId);

      // 서버에 알림
      await this.socketAdapter.emitWithAck("sfu:resume-producer", { producerId });
      console.log(`[SFUService] Producer 재개 서버 알림: ${producerId}`);
    } catch (error) {
      this._handleError(error);
    }
  }

  /**
   * Producer 종료
   * @param {string} producerId - Producer ID
   */
  async closeProducer(producerId) {
    try {
      this.producerManager.closeProducer(producerId);

      // 서버에 알림
      await this.socketAdapter.emitWithAck("sfu:close-producer", { producerId });
      console.log(`[SFUService] Producer 종료 서버 알림: ${producerId}`);
    } catch (error) {
      this._handleError(error);
    }
  }

  // ============ 기존 API - Consumer 관리 ============

  /**
   * Consumer 생성 (미디어 수신)
   * @param {string} producerId - 구독할 Producer ID
   * @param {string} producerSocketId - Producer 소유자의 Socket ID
   * @returns {Promise<Object>} Consumer 인스턴스
   */
  async consume(producerId, producerSocketId) {
    try {
      return await this.consumerManager.consume(producerId, producerSocketId);
    } catch (error) {
      this._handleError(error);
      throw error;
    }
  }

  /**
   * Consumer 종료
   * @param {string} consumerId - Consumer ID
   */
  closeConsumer(consumerId) {
    this.consumerManager.closeConsumer(consumerId);
  }

  /**
   * 특정 socketId의 모든 Consumer 종료
   * @param {string} socketId - Socket ID
   */
  closeConsumersBySocketId(socketId) {
    this.consumerManager.closeConsumersBySocketId(socketId);
  }

  /**
   * 특정 producerId의 Consumer 조회
   * @param {string} producerId - Producer ID
   * @returns {Object|undefined} Consumer 인스턴스
   */
  getConsumerByProducerId(producerId) {
    return this.consumerManager.getConsumerByProducerId(producerId);
  }

  /**
   * 기존 Producer 목록 조회
   * @returns {Promise<Array>} Producer 목록
   */
  async getExistingProducers() {
    try {
      return await this.consumerManager.getExistingProducers();
    } catch (error) {
      this._handleError(error);
      return [];
    }
  }

  // ============ 기존 API - 조회 ============

  /**
   * Device RTP Capabilities 반환
   * @returns {Object|null}
   */
  getRtpCapabilities() {
    return this.deviceManager.getRtpCapabilities();
  }

  // ============ 기존 API - 정리 ============

  /**
   * 모든 리소스 정리
   */
  cleanup() {
    console.log("[SFUService] 리소스 정리 시작");

    // 역순 정리 (의존성 역방향)
    this.producerManager.cleanup();
    this.consumerManager.cleanup();
    this.transportManager.cleanup();
    this.deviceManager.cleanup();

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
