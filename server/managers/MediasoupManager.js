/**
 * MediasoupManager - SFU 리소스 중앙 관리자 (Facade 패턴)
 *
 * 설계 의도:
 * - 싱글톤 패턴으로 전역 리소스 관리
 * - Facade 패턴으로 기존 API 100% 호환성 유지
 * - 내부적으로 6개의 Manager로 책임 분리
 *
 * Manager 구조:
 * - WorkerPoolManager: Worker 풀 생성/관리, 라운드 로빈
 * - RouterManager: Router 생성/삭제
 * - TransportManager: Transport 생성/연결/삭제
 * - ProducerManager: Producer 생성/일시정지/재개/삭제
 * - ConsumerManager: Consumer 생성/재개/삭제
 * - ResourceCleaner: 고아 리소스 스캔/정리
 *
 * @see design/server-architecture.md 섹션 3.1
 */

import ConsumerManager from "./mediasoup/ConsumerManager.js";
import ProducerManager from "./mediasoup/ProducerManager.js";
import ResourceCleaner from "./mediasoup/ResourceCleaner.js";
import RouterManager from "./mediasoup/RouterManager.js";
import TransportManager from "./mediasoup/TransportManager.js";
import WorkerPoolManager from "./mediasoup/WorkerPoolManager.js";

// 고아 리소스 스캔 주기 (5분)
const ORPHAN_SCAN_INTERVAL_MS = 5 * 60 * 1000;

class MediasoupManager {
  constructor() {
    // 싱글톤 검증
    if (MediasoupManager.instance) {
      throw new Error("MediasoupManager는 싱글톤입니다. getInstance()를 사용하세요.");
    }

    // ============ Manager 인스턴스 생성 및 의존성 주입 ============

    // 1. Worker Pool Manager (최하위 모듈)
    this.workerPoolManager = new WorkerPoolManager();

    // 2. Router Manager (WorkerPoolManager 의존)
    this.routerManager = new RouterManager(this.workerPoolManager);

    // 3. Transport Manager (독립)
    this.transportManager = new TransportManager();

    // 4. Producer Manager (독립)
    this.producerManager = new ProducerManager();

    // 5. Consumer Manager (독립)
    this.consumerManager = new ConsumerManager();

    // 6. Resource Cleaner (모든 Manager 의존)
    this.resourceCleaner = new ResourceCleaner({
      transportManager: this.transportManager,
      producerManager: this.producerManager,
      consumerManager: this.consumerManager,
      routerManager: this.routerManager,
    });

    // ============ 핸들러 주입 ============

    // Worker 장애 시 Router 정리 콜백
    this.workerPoolManager.onWorkerDied = () => {
      this.routerManager.handleDeadWorkerRouters();
    };

    console.log("[MediasoupManager] 인스턴스 생성 (Facade 패턴)");
  }

  /**
   * 싱글톤 인스턴스 반환
   * @returns {MediasoupManager}
   */
  static getInstance() {
    if (!MediasoupManager.instance) {
      MediasoupManager.instance = new MediasoupManager();
    }
    return MediasoupManager.instance;
  }

  /**
   * 테스트용 인스턴스 초기화
   * @internal
   */
  static resetInstance() {
    if (MediasoupManager.instance) {
      MediasoupManager.instance.cleanup();
      MediasoupManager.instance = null;
    }
  }

  // ============================================
  // 기존 API - 초기화
  // ============================================

  /**
   * Worker 풀 초기화
   */
  async initialize() {
    await this.workerPoolManager.initialize();
    this.resourceCleaner.startOrphanScan(ORPHAN_SCAN_INTERVAL_MS);
  }

  // ============================================
  // 기존 API - Worker 관리
  // ============================================

  /**
   * 라운드 로빈으로 다음 Worker 반환
   * @returns {Object}
   */
  getNextWorker() {
    return this.workerPoolManager.getNextWorker();
  }

  // ============================================
  // 기존 API - Router 관리
  // ============================================

  /**
   * 방에 대한 Router 생성
   * @param {string} roomId 방 ID
   * @returns {Promise<Object>}
   */
  async createRouter(roomId) {
    return this.routerManager.createRouter(roomId);
  }

  /**
   * 방의 Router 조회
   * @param {string} roomId 방 ID
   * @returns {Object|undefined}
   */
  getRouter(roomId) {
    return this.routerManager.getRouter(roomId);
  }

  /**
   * 방의 Router 삭제
   * @param {string} roomId 방 ID
   */
  closeRouter(roomId) {
    this.routerManager.closeRouter(roomId);
  }

  // ============================================
  // 기존 API - Transport 관리
  // ============================================

  /**
   * WebRTC Transport 생성
   * @param {Object} router Router 인스턴스
   * @param {string} socketId 소켓 ID
   * @param {string} roomId 방 ID (WebRtcServer 조회용)
   * @returns {Promise<Object>}
   */
  async createWebRtcTransport(router, socketId, _roomId = null) {
    // WebRtcServer 획득 (단일 포트 모드에서는 하나만 존재)
    const webRtcServer = this.workerPoolManager.getWebRtcServer();

    return this.transportManager.createWebRtcTransport(router, socketId, webRtcServer);
  }

  /**
   * Transport 연결 (DTLS 핸드셰이크)
   * @param {string} transportId Transport ID
   * @param {object} dtlsParameters DTLS 파라미터
   */
  async connectTransport(transportId, dtlsParameters) {
    return this.transportManager.connectTransport(transportId, dtlsParameters);
  }

  /**
   * Transport 조회 (캡슐화 개선 - 기존 this.transports.get() 대체)
   * @param {string} transportId Transport ID
   * @returns {Object|undefined}
   */
  getTransport(transportId) {
    return this.transportManager.getTransport(transportId);
  }

  /**
   * Peer의 Transport ID 목록 조회 (캡슐화 개선 - 기존 this.peerTransports.get() 대체)
   * @param {string} socketId Socket ID
   * @returns {Set<string>|undefined}
   */
  getTransportIdsBySocketId(socketId) {
    return this.transportManager.getTransportIdsBySocketId(socketId);
  }

  /**
   * Transport 삭제
   * @param {string} transportId Transport ID
   */
  closeTransport(transportId) {
    this.transportManager.closeTransport(transportId);
  }

  // ============================================
  // 기존 API - Producer 관리
  // ============================================

  /**
   * Producer 생성
   * @param {Object} transport Transport 인스턴스
   * @param {string} kind 미디어 종류 ('audio' | 'video')
   * @param {object} rtpParameters RTP 파라미터
   * @param {object} [appData] 추가 데이터
   * @returns {Promise<Object>}
   */
  async createProducer(transport, kind, rtpParameters, appData = {}) {
    return this.producerManager.createProducer(transport, kind, rtpParameters, appData);
  }

  /**
   * Producer 일시정지
   * @param {string} producerId Producer ID
   */
  async pauseProducer(producerId) {
    return this.producerManager.pauseProducer(producerId);
  }

  /**
   * Producer 재개
   * @param {string} producerId Producer ID
   */
  async resumeProducer(producerId) {
    return this.producerManager.resumeProducer(producerId);
  }

  /**
   * Producer 삭제
   * @param {string} producerId Producer ID
   */
  closeProducer(producerId) {
    this.producerManager.closeProducer(producerId);
  }

  /**
   * Producer 조회
   * @param {string} producerId Producer ID
   * @returns {Object|undefined}
   */
  getProducer(producerId) {
    return this.producerManager.getProducer(producerId);
  }

  /**
   * 소켓의 모든 Producer ID 조회
   * @param {string} socketId 소켓 ID
   * @returns {string[]}
   */
  getProducerIdsBySocketId(socketId) {
    return this.producerManager.getProducerIdsBySocketId(socketId);
  }

  // ============================================
  // 기존 API - Consumer 관리
  // ============================================

  /**
   * Consumer 생성
   * @param {Object} router Router 인스턴스
   * @param {Object} transport Transport 인스턴스
   * @param {string} producerId Producer ID
   * @param {object} rtpCapabilities 클라이언트 RTP 능력
   * @returns {Promise<Object>}
   */
  async createConsumer(router, transport, producerId, rtpCapabilities) {
    return this.consumerManager.createConsumer(router, transport, producerId, rtpCapabilities);
  }

  /**
   * Consumer 재개
   * @param {string} consumerId Consumer ID
   */
  async resumeConsumer(consumerId) {
    return this.consumerManager.resumeConsumer(consumerId);
  }

  /**
   * Consumer 삭제
   * @param {string} consumerId Consumer ID
   */
  closeConsumer(consumerId) {
    this.consumerManager.closeConsumer(consumerId);
  }

  /**
   * Consumer 조회
   * @param {string} consumerId Consumer ID
   * @returns {Object|undefined}
   */
  getConsumer(consumerId) {
    return this.consumerManager.getConsumer(consumerId);
  }

  // ============================================
  // 기존 API - 리소스 정리
  // ============================================

  /**
   * 참가자 관련 모든 리소스 정리
   * @param {string} socketId 소켓 ID
   */
  cleanupPeer(socketId) {
    if (!socketId) {
      return;
    }

    console.log(`[MediasoupManager] Peer 리소스 정리 시작: ${socketId}`);

    // 역순 정리 (의존성 역방향)
    this.consumerManager.closeConsumersBySocketId(socketId);
    this.producerManager.closeProducersBySocketId(socketId);
    this.transportManager.closeTransportsBySocketId(socketId);

    console.log(`[MediasoupManager] Peer 리소스 정리 완료: ${socketId}`);
  }

  /**
   * 방 관련 모든 리소스 정리
   * @param {string} roomId 방 ID
   */
  cleanupRoom(roomId) {
    if (!roomId) {
      return;
    }

    console.log(`[MediasoupManager] Room 리소스 정리: ${roomId}`);

    // Router를 닫으면 해당 Router의 모든 Transport/Producer/Consumer 자동 종료
    this.routerManager.closeRouter(roomId);
  }

  /**
   * 전체 리소스 정리 및 종료
   */
  cleanup() {
    console.log("[MediasoupManager] 전체 정리 시작...");

    // 타이머 정리
    this.resourceCleaner.stopOrphanScan();

    // 역순 정리
    this.consumerManager.cleanup();
    this.producerManager.cleanup();
    this.transportManager.cleanup();
    this.routerManager.cleanup();
    this.workerPoolManager.cleanup();

    console.log("[MediasoupManager] 전체 정리 완료");
  }

  // ============================================
  // 기존 API - 상태 조회
  // ============================================

  /**
   * 현재 상태 반환
   * @returns {object}
   */
  getStats() {
    return {
      workers: this.workerPoolManager.getWorkerCount(),
      routers: this.routerManager.getRouterCount(),
      transports: this.transportManager.getTransportCount(),
      producers: this.producerManager.getProducerCount(),
      consumers: this.consumerManager.getConsumerCount(),
      initialized: this.workerPoolManager.isInitialized(),
    };
  }
}

export default MediasoupManager;
