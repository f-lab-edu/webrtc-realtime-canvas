/**
 * ResourceCleaner 클래스
 * 고아 리소스 스캔 및 정리
 *
 * 책임:
 * - 주기적인 고아 리소스 스캔
 * - 닫힌 리소스 정리
 *
 * 의존성:
 * - 각 Manager (정리 대상 조회용)
 */

// 기본 고아 리소스 스캔 주기 (5분)
const DEFAULT_SCAN_INTERVAL_MS = 5 * 60 * 1000;

class ResourceCleaner {
  /**
   * @param {Object} managers Manager 인스턴스들
   * @param {TransportManager} managers.transportManager
   * @param {ProducerManager} managers.producerManager
   * @param {ConsumerManager} managers.consumerManager
   * @param {RouterManager} managers.routerManager
   */
  constructor(managers) {
    if (!managers) {
      throw new Error("[ResourceCleaner] managers 객체는 필수입니다.");
    }

    /** @type {TransportManager} */
    this.transportManager = managers.transportManager;

    /** @type {ProducerManager} */
    this.producerManager = managers.producerManager;

    /** @type {ConsumerManager} */
    this.consumerManager = managers.consumerManager;

    /** @type {RouterManager} */
    this.routerManager = managers.routerManager;

    /** @type {NodeJS.Timeout|null} 고아 리소스 스캔 타이머 */
    this.orphanScanTimer = null;

    console.log("[ResourceCleaner] 인스턴스 생성");
  }

  /**
   * 고아 리소스 스캔 시작
   * @param {number} [intervalMs] 스캔 주기 (기본: 5분)
   */
  startOrphanScan(intervalMs = DEFAULT_SCAN_INTERVAL_MS) {
    if (this.orphanScanTimer) {
      console.warn("[ResourceCleaner] 이미 스캔이 실행 중입니다.");
      return;
    }

    this.orphanScanTimer = setInterval(() => {
      this.scanAndClean();
    }, intervalMs);

    console.log(`[ResourceCleaner] 고아 리소스 스캔 시작 (주기: ${intervalMs / 1000}초)`);
  }

  /**
   * 고아 리소스 스캔 중지
   */
  stopOrphanScan() {
    if (this.orphanScanTimer) {
      clearInterval(this.orphanScanTimer);
      this.orphanScanTimer = null;
      console.log("[ResourceCleaner] 고아 리소스 스캔 중지");
    }
  }

  /**
   * 고아 리소스 스캔 및 정리
   * @returns {number} 정리된 리소스 수
   */
  scanAndClean() {
    let cleanedCount = 0;

    // 닫힌 Transport 정리
    if (this.transportManager) {
      const closedTransportIds = this.transportManager.getClosedTransportIds();
      for (const transportId of closedTransportIds) {
        this.transportManager.closeTransport(transportId);
        cleanedCount++;
      }
    }

    // 닫힌 Producer 정리
    if (this.producerManager) {
      const closedProducerIds = this.producerManager.getClosedProducerIds();
      for (const producerId of closedProducerIds) {
        this.producerManager.closeProducer(producerId);
        cleanedCount++;
      }
    }

    // 닫힌 Consumer 정리
    if (this.consumerManager) {
      const closedConsumerIds = this.consumerManager.getClosedConsumerIds();
      for (const consumerId of closedConsumerIds) {
        this.consumerManager.closeConsumer(consumerId);
        cleanedCount++;
      }
    }

    // 닫힌 Router 정리
    if (this.routerManager) {
      const closedRouterRoomIds = this.routerManager.getClosedRouterRoomIds();
      for (const roomId of closedRouterRoomIds) {
        this.routerManager.closeRouter(roomId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      console.log(`[ResourceCleaner] 고아 리소스 ${cleanedCount}개 정리됨`);
    }

    return cleanedCount;
  }

  /**
   * 스캔 실행 중 여부
   * @returns {boolean}
   */
  isScanning() {
    return this.orphanScanTimer !== null;
  }
}

export default ResourceCleaner;
