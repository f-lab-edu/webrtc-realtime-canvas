/**
 * ConsumerManager 클래스
 * Consumer 생성/재개/삭제 및 소유권 추적
 *
 * 책임:
 * - Consumer 생성 (canConsume 검증 포함)
 * - Consumer 재개
 * - Consumer 삭제
 * - 소유권(socketId) 추적
 *
 * 의존성: 없음 (Router, Transport는 파라미터로 전달)
 */

class ConsumerManager {
  constructor() {
    /** @type {Map<string, Object>} consumerId → Consumer */
    this.consumers = new Map();

    /** @type {Map<string, string>} consumerId → socketId */
    this.consumerOwners = new Map();

    console.log("[ConsumerManager] 인스턴스 생성");
  }

  /**
   * Consumer 생성
   * @param {Object} router Router 인스턴스
   * @param {Object} transport Transport 인스턴스
   * @param {string} producerId Producer ID
   * @param {object} rtpCapabilities 클라이언트 RTP 능력
   * @returns {Promise<Object>} Consumer 인스턴스
   */
  async createConsumer(router, transport, producerId, rtpCapabilities) {
    if (!router) {
      throw new Error("[ConsumerManager] router는 필수입니다.");
    }
    if (!transport) {
      throw new Error("[ConsumerManager] transport는 필수입니다.");
    }
    if (!producerId) {
      throw new Error("[ConsumerManager] producerId는 필수입니다.");
    }
    if (!rtpCapabilities) {
      throw new Error("[ConsumerManager] rtpCapabilities는 필수입니다.");
    }

    // canConsume 검증
    if (!router.canConsume({ producerId, rtpCapabilities })) {
      throw new Error(`[ConsumerManager] Cannot consume producer: ${producerId}`);
    }

    const consumer = await transport.consume({
      producerId,
      rtpCapabilities,
      paused: true, // Consumer는 기본 일시정지 상태로 생성
    });

    // Consumer 저장
    this.consumers.set(consumer.id, consumer);

    // 소유자 추적
    const socketId = transport.appData?.socketId;
    if (socketId) {
      this.consumerOwners.set(consumer.id, socketId);
    }

    // Consumer 이벤트 핸들러
    this._setupConsumerEvents(consumer);

    console.log(`[ConsumerManager] Consumer 생성: id=${consumer.id}, producerId=${producerId}`);

    return consumer;
  }

  /**
   * Consumer 재개
   * @param {string} consumerId Consumer ID
   */
  async resumeConsumer(consumerId) {
    const consumer = this.consumers.get(consumerId);
    if (!consumer) {
      throw new Error(`[ConsumerManager] Consumer를 찾을 수 없습니다: ${consumerId}`);
    }

    await consumer.resume();
    console.log(`[ConsumerManager] Consumer 재개: ${consumerId}`);
  }

  /**
   * Consumer 삭제
   * @param {string} consumerId Consumer ID
   */
  closeConsumer(consumerId) {
    const consumer = this.consumers.get(consumerId);
    if (!consumer) {
      return;
    }

    if (!consumer.closed) {
      consumer.close();
    }

    this._removeConsumerFromMaps(consumerId);
    console.log(`[ConsumerManager] Consumer 삭제: ${consumerId}`);
  }

  /**
   * Consumer 조회
   * @param {string} consumerId Consumer ID
   * @returns {Object|undefined}
   */
  getConsumer(consumerId) {
    return this.consumers.get(consumerId);
  }

  /**
   * Peer의 모든 Consumer 삭제
   * @param {string} socketId Socket ID
   */
  closeConsumersBySocketId(socketId) {
    const consumerIds = [];
    for (const [consumerId, ownerId] of this.consumerOwners.entries()) {
      if (ownerId === socketId) {
        consumerIds.push(consumerId);
      }
    }

    for (const consumerId of consumerIds) {
      this.closeConsumer(consumerId);
    }

    console.log(`[ConsumerManager] socketId=${socketId}의 Consumer ${consumerIds.length}개 삭제`);
  }

  /**
   * Consumer 이벤트 핸들러 설정
   * @param {Object} consumer Consumer 인스턴스
   * @private
   */
  _setupConsumerEvents(consumer) {
    consumer.on("transportclose", () => {
      console.log(`[ConsumerManager] Consumer transport closed: ${consumer.id}`);
      this._removeConsumerFromMaps(consumer.id);
    });

    consumer.on("producerclose", () => {
      console.log(`[ConsumerManager] Consumer producer closed: ${consumer.id}`);
      this._removeConsumerFromMaps(consumer.id);
    });
  }

  /**
   * Consumer 맵에서 제거
   * @param {string} consumerId
   * @private
   */
  _removeConsumerFromMaps(consumerId) {
    this.consumers.delete(consumerId);
    this.consumerOwners.delete(consumerId);
  }

  /**
   * 닫힌 Consumer ID 목록 반환 (고아 리소스 정리용)
   * @returns {string[]}
   */
  getClosedConsumerIds() {
    const closedIds = [];
    for (const [consumerId, consumer] of this.consumers.entries()) {
      if (consumer.closed) {
        closedIds.push(consumerId);
      }
    }
    return closedIds;
  }

  /**
   * Consumer 개수 반환
   * @returns {number}
   */
  getConsumerCount() {
    return this.consumers.size;
  }

  /**
   * 모든 Consumer 인스턴스 반환 (모니터링용)
   * @returns {Object[]} Consumer 인스턴스 배열
   */
  getAll() {
    return Array.from(this.consumers.values());
  }

  /**
   * 리소스 정리
   */
  cleanup() {
    console.log("[ConsumerManager] 리소스 정리");

    for (const [consumerId, consumer] of this.consumers.entries()) {
      try {
        if (!consumer.closed) {
          consumer.close();
        }
      } catch (e) {
        console.warn(`[ConsumerManager] Consumer 정리 에러: ${consumerId}`, e);
      }
    }

    this.consumers.clear();
    this.consumerOwners.clear();

    console.log("[ConsumerManager] 리소스 정리 완료");
  }
}

export default ConsumerManager;
