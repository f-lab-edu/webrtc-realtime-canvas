/**
 * SFUConsumerManager 클래스
 * Consumer 생성 및 관리
 *
 * 책임:
 * - Consumer 생성
 * - Consumer 종료 (ID별, SocketID별)
 * - Consumer 조회
 * - 기존 Producer 목록 조회
 *
 * 의존성:
 * - SFUDeviceManager: RTP Capabilities 필요
 * - SFUTransportManager: Recv Transport 필요
 * - SFUSocketAdapter: 서버 통신
 *
 * 핸들러 주입:
 * - onConsumerCreated(consumer): Consumer 생성 시 호출
 */

class SFUConsumerManager {
  /**
   * @param {SFUDeviceManager} deviceManager - Device Manager
   * @param {SFUTransportManager} transportManager - Transport Manager
   * @param {SFUSocketAdapter} socketAdapter - Socket 통신 어댑터
   */
  constructor(deviceManager, transportManager, socketAdapter) {
    if (!deviceManager) {
      throw new Error("[SFUConsumerManager] deviceManager는 필수입니다");
    }
    if (!transportManager) {
      throw new Error("[SFUConsumerManager] transportManager는 필수입니다");
    }
    if (!socketAdapter) {
      throw new Error("[SFUConsumerManager] socketAdapter는 필수입니다");
    }

    /** @type {SFUDeviceManager} */
    this.deviceManager = deviceManager;

    /** @type {SFUTransportManager} */
    this.transportManager = transportManager;

    /** @type {SFUSocketAdapter} */
    this.socketAdapter = socketAdapter;

    /** @type {Map<string, Object>} consumerId → Consumer 인스턴스 */
    this.consumers = new Map();

    /** @type {Function|null} Consumer 생성 핸들러 */
    this.onConsumerCreated = null;

    console.log("[SFUConsumerManager] 인스턴스 생성");
  }

  /**
   * Consumer 생성 (미디어 수신)
   * @param {string} producerId - 구독할 Producer ID
   * @param {string} producerSocketId - Producer 소유자의 Socket ID
   * @returns {Promise<Object>} Consumer 인스턴스
   */
  async consume(producerId, producerSocketId) {
    if (!producerId) {
      throw new Error("[SFUConsumerManager] producerId는 필수입니다");
    }

    const recvTransport = this.transportManager.getRecvTransport();
    if (!recvTransport) {
      throw new Error("[SFUConsumerManager] Recv Transport가 생성되지 않았습니다");
    }

    if (!this.deviceManager.isDeviceLoaded()) {
      throw new Error("[SFUConsumerManager] Device가 로드되지 않았습니다");
    }

    try {
      const response = await this.socketAdapter.emitWithAck("sfu:consume-with-transport", {
        roomId: this.deviceManager.roomId,
        transportId: recvTransport.id,
        producerId,
        rtpCapabilities: this.deviceManager.getRtpCapabilities(),
      });

      if (response.error) {
        throw new Error(response.error);
      }

      const { id, kind, rtpParameters, appData } = response;

      // Consumer 생성
      const consumer = await recvTransport.consume({
        id,
        producerId,
        kind,
        rtpParameters,
      });

      // Consumer 저장 (producerSocketId, appData 포함)
      consumer.producerSocketId = producerSocketId;
      consumer.appData = appData || {}; // 화면 공유 여부 등 Producer 메타데이터
      this.consumers.set(consumer.id, consumer);

      // Consumer 이벤트 핸들러
      this._setupConsumerEvents(consumer);

      // Consumer는 기본 일시정지 상태, 재개 요청
      await this.socketAdapter.emitWithAck("sfu:resume-consumer", { consumerId: id });

      // 핸들러 호출
      if (this.onConsumerCreated) {
        this.onConsumerCreated(consumer);
      }

      console.log(`[SFUConsumerManager] ${kind} Consumer 생성 완료:`, {
        consumerId: id,
        producerId,
        producerSocketId,
      });

      return consumer;
    } catch (error) {
      console.error("[SFUConsumerManager] Consumer 생성 실패:", error);
      throw error;
    }
  }

  /**
   * Consumer 종료
   * @param {string} consumerId - Consumer ID
   */
  closeConsumer(consumerId) {
    const consumer = this.consumers.get(consumerId);
    if (!consumer) {
      console.warn(`[SFUConsumerManager] Consumer를 찾을 수 없음: ${consumerId}`);
      return;
    }

    consumer.close();
    this.consumers.delete(consumerId);
    console.log(`[SFUConsumerManager] Consumer 종료: ${consumerId}`);
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
    console.log(`[SFUConsumerManager] socketId=${socketId}의 Consumer 모두 종료`);
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
   * 모든 Consumer 반환
   * @returns {Map<string, Object>}
   */
  getAllConsumers() {
    return this.consumers;
  }

  /**
   * 기존 Producer 목록 조회
   * @returns {Promise<Array>} Producer 목록
   */
  async getExistingProducers() {
    try {
      const response = await this.socketAdapter.emitWithAck("sfu:get-producers", {
        roomId: this.deviceManager.roomId,
      });

      if (response.error) {
        throw new Error(response.error);
      }

      console.log(`[SFUConsumerManager] 기존 Producer 조회: ${response.producers?.length || 0}개`);
      return response.producers || [];
    } catch (error) {
      console.error("[SFUConsumerManager] Producer 목록 조회 실패:", error);
      return [];
    }
  }

  /**
   * Consumer 이벤트 핸들러 설정
   * @param {Object} consumer - Consumer 인스턴스
   * @private
   */
  _setupConsumerEvents(consumer) {
    consumer.on("transportclose", () => {
      console.log(`[SFUConsumerManager] Consumer Transport 종료: ${consumer.id}`);
      this.consumers.delete(consumer.id);
    });
  }

  /**
   * 리소스 정리
   */
  cleanup() {
    console.log("[SFUConsumerManager] 리소스 정리");

    for (const [consumerId, consumer] of this.consumers.entries()) {
      try {
        consumer.close();
      } catch (e) {
        console.warn(`[SFUConsumerManager] Consumer 정리 에러: ${consumerId}`, e);
      }
    }
    this.consumers.clear();
  }
}

export default SFUConsumerManager;
