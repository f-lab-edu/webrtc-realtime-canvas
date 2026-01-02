/**
 * ProducerManager 클래스
 * Producer 생성/일시정지/재개/삭제 및 소유권 추적
 *
 * 책임:
 * - Producer 생성
 * - Producer 일시정지/재개
 * - Producer 삭제
 * - 소유권(socketId) 추적
 *
 * 의존성: 없음 (Transport는 파라미터로 전달)
 */

class ProducerManager {
  constructor() {
    /** @type {Map<string, Object>} producerId → Producer */
    this.producers = new Map();

    /** @type {Map<string, string>} producerId → socketId */
    this.producerOwners = new Map();

    console.log("[ProducerManager] 인스턴스 생성");
  }

  /**
   * Producer 생성
   * @param {Object} transport Transport 인스턴스
   * @param {string} kind 미디어 종류 ('audio' | 'video')
   * @param {object} rtpParameters RTP 파라미터
   * @param {object} [appData] 추가 데이터
   * @returns {Promise<Object>} Producer 인스턴스
   */
  async createProducer(transport, kind, rtpParameters, appData = {}) {
    if (!transport) {
      throw new Error("[ProducerManager] transport는 필수입니다.");
    }
    if (!kind) {
      throw new Error("[ProducerManager] kind는 필수입니다.");
    }
    if (!rtpParameters) {
      throw new Error("[ProducerManager] rtpParameters는 필수입니다.");
    }

    const producer = await transport.produce({
      kind,
      rtpParameters,
      appData,
    });

    // Producer 저장
    this.producers.set(producer.id, producer);

    // 소유자 추적
    const socketId = transport.appData?.socketId;
    if (socketId) {
      this.producerOwners.set(producer.id, socketId);
    }

    // Producer 이벤트 핸들러
    this._setupProducerEvents(producer);

    console.log(`[ProducerManager] Producer 생성: id=${producer.id}, kind=${kind}`);

    return producer;
  }

  /**
   * Producer 일시정지
   * @param {string} producerId Producer ID
   */
  async pauseProducer(producerId) {
    const producer = this.producers.get(producerId);
    if (!producer) {
      throw new Error(`[ProducerManager] Producer를 찾을 수 없습니다: ${producerId}`);
    }

    await producer.pause();
    console.log(`[ProducerManager] Producer 일시정지: ${producerId}`);
  }

  /**
   * Producer 재개
   * @param {string} producerId Producer ID
   */
  async resumeProducer(producerId) {
    const producer = this.producers.get(producerId);
    if (!producer) {
      throw new Error(`[ProducerManager] Producer를 찾을 수 없습니다: ${producerId}`);
    }

    await producer.resume();
    console.log(`[ProducerManager] Producer 재개: ${producerId}`);
  }

  /**
   * Producer 삭제
   * @param {string} producerId Producer ID
   */
  closeProducer(producerId) {
    const producer = this.producers.get(producerId);
    if (!producer) {
      return;
    }

    if (!producer.closed) {
      producer.close();
    }

    this._removeProducerFromMaps(producerId);
    console.log(`[ProducerManager] Producer 삭제: ${producerId}`);
  }

  /**
   * Producer 조회
   * @param {string} producerId Producer ID
   * @returns {Object|undefined}
   */
  getProducer(producerId) {
    return this.producers.get(producerId);
  }

  /**
   * 소켓의 모든 Producer ID 조회
   * @param {string} socketId 소켓 ID
   * @returns {string[]}
   */
  getProducerIdsBySocketId(socketId) {
    const producerIds = [];
    for (const [producerId, ownerId] of this.producerOwners.entries()) {
      if (ownerId === socketId) {
        producerIds.push(producerId);
      }
    }
    return producerIds;
  }

  /**
   * Peer의 모든 Producer 삭제
   * @param {string} socketId Socket ID
   */
  closeProducersBySocketId(socketId) {
    const producerIds = this.getProducerIdsBySocketId(socketId);
    for (const producerId of producerIds) {
      this.closeProducer(producerId);
    }
    console.log(`[ProducerManager] socketId=${socketId}의 Producer ${producerIds.length}개 삭제`);
  }

  /**
   * Producer 이벤트 핸들러 설정
   * @param {Object} producer Producer 인스턴스
   * @private
   */
  _setupProducerEvents(producer) {
    producer.on("transportclose", () => {
      console.log(`[ProducerManager] Producer transport closed: ${producer.id}`);
      this._removeProducerFromMaps(producer.id);
    });
  }

  /**
   * Producer 맵에서 제거
   * @param {string} producerId
   * @private
   */
  _removeProducerFromMaps(producerId) {
    this.producers.delete(producerId);
    this.producerOwners.delete(producerId);
  }

  /**
   * 닫힌 Producer ID 목록 반환 (고아 리소스 정리용)
   * @returns {string[]}
   */
  getClosedProducerIds() {
    const closedIds = [];
    for (const [producerId, producer] of this.producers.entries()) {
      if (producer.closed) {
        closedIds.push(producerId);
      }
    }
    return closedIds;
  }

  /**
   * Producer 개수 반환
   * @returns {number}
   */
  getProducerCount() {
    return this.producers.size;
  }

  /**
   * 모든 Producer 인스턴스 반환 (모니터링용)
   * @returns {Object[]} Producer 인스턴스 배열
   */
  getAll() {
    return Array.from(this.producers.values());
  }

  /**
   * 리소스 정리
   */
  cleanup() {
    console.log("[ProducerManager] 리소스 정리");

    for (const [producerId, producer] of this.producers.entries()) {
      try {
        if (!producer.closed) {
          producer.close();
        }
      } catch (e) {
        console.warn(`[ProducerManager] Producer 정리 에러: ${producerId}`, e);
      }
    }

    this.producers.clear();
    this.producerOwners.clear();

    console.log("[ProducerManager] 리소스 정리 완료");
  }
}

export default ProducerManager;
