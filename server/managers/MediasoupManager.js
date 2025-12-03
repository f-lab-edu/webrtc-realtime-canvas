/**
 * MediasoupManager - SFU 리소스 중앙 관리자
 *
 * 설계 의도:
 * - 싱글톤 패턴으로 전역 리소스 관리
 * - Worker 풀을 라운드 로빈으로 분배하여 부하 분산
 * - Room:Router 1:1 매핑으로 방별 미디어 격리
 * - 리소스 누수 방지를 위한 다층 정리 메커니즘
 *
 * @see design/server-architecture.md 섹션 3.1
 */

import * as mediasoup from "mediasoup";
import {
  numWorkers,
  routerOptions,
  webRtcTransportOptions,
  workerSettings,
} from "../config/mediasoupConfig.js";

// 고아 리소스 스캔 주기 (5분)
const ORPHAN_SCAN_INTERVAL_MS = 5 * 60 * 1000;

class MediasoupManager {
  constructor() {
    // 싱글톤 검증
    if (MediasoupManager.instance) {
      throw new Error("MediasoupManager는 싱글톤입니다. getInstance()를 사용하세요.");
    }

    /** @type {mediasoup.types.Worker[]} Worker 풀 */
    this.workers = [];

    /** @type {number} 라운드 로빈 인덱스 */
    this.nextWorkerIndex = 0;

    /** @type {Map<string, mediasoup.types.Router>} roomId → Router */
    this.roomRouters = new Map();

    /** @type {Map<string, mediasoup.types.WebRtcTransport>} transportId → Transport */
    this.transports = new Map();

    /** @type {Map<string, Set<string>>} socketId → Set<transportId> */
    this.peerTransports = new Map();

    /** @type {Map<string, mediasoup.types.Producer>} producerId → Producer */
    this.producers = new Map();

    /** @type {Map<string, string>} producerId → socketId */
    this.producerOwners = new Map();

    /** @type {Map<string, mediasoup.types.Consumer>} consumerId → Consumer */
    this.consumers = new Map();

    /** @type {Map<string, string>} consumerId → socketId */
    this.consumerOwners = new Map();

    /** @type {NodeJS.Timeout|null} 고아 리소스 스캔 타이머 */
    this.orphanScanTimer = null;

    /** @type {boolean} 초기화 완료 여부 */
    this.initialized = false;
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
  // Worker 풀 관리
  // ============================================

  /**
   * Worker 풀 초기화
   * - CPU 코어 수만큼 Worker 생성 (개발: 1개)
   * - Worker 장애 시 자동 복구 또는 로깅
   */
  async initialize() {
    if (this.initialized) {
      console.warn("[MediasoupManager] 이미 초기화되었습니다.");
      return;
    }

    console.log(`[MediasoupManager] Worker 풀 초기화 시작 (목표: ${numWorkers}개)`);

    for (let i = 0; i < numWorkers; i++) {
      await this._createWorker(i);
    }

    // 고아 리소스 스캔 시작
    this._startOrphanScan();

    this.initialized = true;
    console.log(`[MediasoupManager] 초기화 완료 - Worker ${this.workers.length}개 실행 중`);
  }

  /**
   * 개별 Worker 생성
   * @param {number} index Worker 인덱스
   * @private
   */
  async _createWorker(index) {
    const worker = await mediasoup.createWorker(workerSettings);

    worker.on("died", (error) => {
      console.error(`[MediasoupManager] Worker ${index} (PID: ${worker.pid}) 사망:`, error);

      // Worker 풀에서 제거
      const workerIdx = this.workers.indexOf(worker);
      if (workerIdx !== -1) {
        this.workers.splice(workerIdx, 1);
      }

      // 해당 Worker의 모든 Router 정리
      this._cleanupDeadWorkerRouters(worker);

      // Worker 재생성 시도 (운영 환경에서 필요)
      if (process.env.NODE_ENV === "production") {
        console.log(`[MediasoupManager] Worker ${index} 재생성 시도...`);
        this._createWorker(index).catch((err) => {
          console.error(`[MediasoupManager] Worker ${index} 재생성 실패:`, err);
        });
      }
    });

    this.workers.push(worker);
    console.log(`[MediasoupManager] Worker ${index} 생성 완료 (PID: ${worker.pid})`);
  }

  /**
   * 죽은 Worker의 Router들 정리
   * @param {mediasoup.types.Worker} deadWorker
   * @private
   */
  _cleanupDeadWorkerRouters(_deadWorker) {
    for (const [roomId, router] of this.roomRouters.entries()) {
      // Router가 해당 Worker에 속해있는지 확인
      // mediasoup Router는 appData에 접근하거나, closed 상태로 확인
      if (router.closed) {
        console.log(`[MediasoupManager] 죽은 Worker의 Router 정리: roomId=${roomId}`);
        this.roomRouters.delete(roomId);
      }
    }
  }

  /**
   * 라운드 로빈으로 다음 Worker 반환
   * @returns {mediasoup.types.Worker}
   */
  getNextWorker() {
    if (this.workers.length === 0) {
      throw new Error(
        "[MediasoupManager] 사용 가능한 Worker가 없습니다. initialize()를 먼저 호출하세요."
      );
    }

    const worker = this.workers[this.nextWorkerIndex];
    this.nextWorkerIndex = (this.nextWorkerIndex + 1) % this.workers.length;
    return worker;
  }

  // ============================================
  // Router 관리
  // ============================================

  /**
   * 방에 대한 Router 생성
   * @param {string} roomId 방 ID
   * @returns {Promise<mediasoup.types.Router>}
   */
  async createRouter(roomId) {
    if (!roomId) {
      throw new Error("[MediasoupManager] roomId는 필수입니다.");
    }

    // 이미 존재하면 기존 Router 반환
    if (this.roomRouters.has(roomId)) {
      console.log(`[MediasoupManager] 기존 Router 반환: roomId=${roomId}`);
      return this.roomRouters.get(roomId);
    }

    const worker = this.getNextWorker();
    const router = await worker.createRouter(routerOptions);

    this.roomRouters.set(roomId, router);
    console.log(`[MediasoupManager] Router 생성: roomId=${roomId}`);

    return router;
  }

  /**
   * 방의 Router 조회
   * @param {string} roomId 방 ID
   * @returns {mediasoup.types.Router|undefined}
   */
  getRouter(roomId) {
    return this.roomRouters.get(roomId);
  }

  /**
   * 방의 Router 삭제
   * @param {string} roomId 방 ID
   */
  closeRouter(roomId) {
    const router = this.roomRouters.get(roomId);
    if (!router) {
      return;
    }

    // Router를 닫으면 해당 Router의 모든 Transport, Producer, Consumer도 자동 종료됨
    if (!router.closed) {
      router.close();
    }

    this.roomRouters.delete(roomId);
    console.log(`[MediasoupManager] Router 삭제: roomId=${roomId}`);
  }

  // ============================================
  // Transport 관리
  // ============================================

  /**
   * WebRTC Transport 생성
   * @param {mediasoup.types.Router} router Router 인스턴스
   * @param {string} socketId 소켓 ID
   * @returns {Promise<mediasoup.types.WebRtcTransport>}
   */
  async createWebRtcTransport(router, socketId) {
    if (!router || !socketId) {
      throw new Error("[MediasoupManager] router와 socketId는 필수입니다.");
    }

    const transport = await router.createWebRtcTransport({
      ...webRtcTransportOptions,
      appData: { socketId },
    });

    // Transport 저장
    this.transports.set(transport.id, transport);

    // peer별 Transport 추적
    if (!this.peerTransports.has(socketId)) {
      this.peerTransports.set(socketId, new Set());
    }
    this.peerTransports.get(socketId).add(transport.id);

    // Transport 이벤트 핸들러
    transport.on("dtlsstatechange", (dtlsState) => {
      if (dtlsState === "closed" || dtlsState === "failed") {
        console.log(`[MediasoupManager] Transport DTLS ${dtlsState}: ${transport.id}`);
        this.closeTransport(transport.id);
      }
    });

    transport.on("@close", () => {
      // 내부 정리는 closeTransport에서 처리
    });

    console.log(`[MediasoupManager] Transport 생성: id=${transport.id}, socketId=${socketId}`);

    return transport;
  }

  /**
   * Transport 연결 (DTLS 핸드셰이크)
   * @param {string} transportId Transport ID
   * @param {object} dtlsParameters DTLS 파라미터
   */
  async connectTransport(transportId, dtlsParameters) {
    const transport = this.transports.get(transportId);
    if (!transport) {
      throw new Error(`[MediasoupManager] Transport를 찾을 수 없습니다: ${transportId}`);
    }

    await transport.connect({ dtlsParameters });
    console.log(`[MediasoupManager] Transport 연결 완료: ${transportId}`);
  }

  /**
   * Transport 삭제
   * @param {string} transportId Transport ID
   */
  closeTransport(transportId) {
    const transport = this.transports.get(transportId);
    if (!transport) {
      return;
    }

    // Transport 닫기
    if (!transport.closed) {
      transport.close();
    }

    // 추적 맵에서 제거
    this.transports.delete(transportId);

    // peerTransports에서도 제거
    const socketId = transport.appData?.socketId;
    if (socketId && this.peerTransports.has(socketId)) {
      this.peerTransports.get(socketId).delete(transportId);
    }

    console.log(`[MediasoupManager] Transport 삭제: ${transportId}`);
  }

  // ============================================
  // Producer 관리
  // ============================================

  /**
   * Producer 생성
   * @param {mediasoup.types.WebRtcTransport} transport Transport 인스턴스
   * @param {string} kind 미디어 종류 ('audio' | 'video')
   * @param {object} rtpParameters RTP 파라미터
   * @param {object} [appData] 추가 데이터
   * @returns {Promise<mediasoup.types.Producer>}
   */
  async createProducer(transport, kind, rtpParameters, appData = {}) {
    if (!transport || !kind || !rtpParameters) {
      throw new Error("[MediasoupManager] transport, kind, rtpParameters는 필수입니다.");
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

    producer.on("transportclose", () => {
      console.log(`[MediasoupManager] Producer transport closed: ${producer.id}`);
      this._removeProducerFromMaps(producer.id);
    });

    console.log(`[MediasoupManager] Producer 생성: id=${producer.id}, kind=${kind}`);

    return producer;
  }

  /**
   * Producer 일시정지
   * @param {string} producerId Producer ID
   */
  async pauseProducer(producerId) {
    const producer = this.producers.get(producerId);
    if (!producer) {
      throw new Error(`[MediasoupManager] Producer를 찾을 수 없습니다: ${producerId}`);
    }

    await producer.pause();
    console.log(`[MediasoupManager] Producer 일시정지: ${producerId}`);
  }

  /**
   * Producer 재개
   * @param {string} producerId Producer ID
   */
  async resumeProducer(producerId) {
    const producer = this.producers.get(producerId);
    if (!producer) {
      throw new Error(`[MediasoupManager] Producer를 찾을 수 없습니다: ${producerId}`);
    }

    await producer.resume();
    console.log(`[MediasoupManager] Producer 재개: ${producerId}`);
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
    console.log(`[MediasoupManager] Producer 삭제: ${producerId}`);
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
   * Producer 조회
   * @param {string} producerId Producer ID
   * @returns {mediasoup.types.Producer|undefined}
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

  // ============================================
  // Consumer 관리
  // ============================================

  /**
   * Consumer 생성
   * @param {mediasoup.types.Router} router Router 인스턴스
   * @param {mediasoup.types.WebRtcTransport} transport Transport 인스턴스
   * @param {string} producerId Producer ID
   * @param {object} rtpCapabilities 클라이언트 RTP 능력
   * @returns {Promise<mediasoup.types.Consumer>}
   */
  async createConsumer(router, transport, producerId, rtpCapabilities) {
    if (!router || !transport || !producerId || !rtpCapabilities) {
      throw new Error(
        "[MediasoupManager] router, transport, producerId, rtpCapabilities는 필수입니다."
      );
    }

    // canConsume 검증
    if (!router.canConsume({ producerId, rtpCapabilities })) {
      throw new Error(`[MediasoupManager] Cannot consume producer: ${producerId}`);
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

    consumer.on("transportclose", () => {
      console.log(`[MediasoupManager] Consumer transport closed: ${consumer.id}`);
      this._removeConsumerFromMaps(consumer.id);
    });

    consumer.on("producerclose", () => {
      console.log(`[MediasoupManager] Consumer producer closed: ${consumer.id}`);
      this._removeConsumerFromMaps(consumer.id);
    });

    console.log(`[MediasoupManager] Consumer 생성: id=${consumer.id}, producerId=${producerId}`);

    return consumer;
  }

  /**
   * Consumer 재개
   * @param {string} consumerId Consumer ID
   */
  async resumeConsumer(consumerId) {
    const consumer = this.consumers.get(consumerId);
    if (!consumer) {
      throw new Error(`[MediasoupManager] Consumer를 찾을 수 없습니다: ${consumerId}`);
    }

    await consumer.resume();
    console.log(`[MediasoupManager] Consumer 재개: ${consumerId}`);
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
    console.log(`[MediasoupManager] Consumer 삭제: ${consumerId}`);
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
   * Consumer 조회
   * @param {string} consumerId Consumer ID
   * @returns {mediasoup.types.Consumer|undefined}
   */
  getConsumer(consumerId) {
    return this.consumers.get(consumerId);
  }

  // ============================================
  // 리소스 정리
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

    // 1. Consumers 정리 (해당 socketId 소유)
    for (const [consumerId, ownerId] of this.consumerOwners.entries()) {
      if (ownerId === socketId) {
        this.closeConsumer(consumerId);
      }
    }

    // 2. Producers 정리 (해당 socketId 소유)
    for (const [producerId, ownerId] of this.producerOwners.entries()) {
      if (ownerId === socketId) {
        this.closeProducer(producerId);
      }
    }

    // 3. Transports 정리
    const transportIds = this.peerTransports.get(socketId);
    if (transportIds) {
      for (const transportId of transportIds) {
        this.closeTransport(transportId);
      }
      this.peerTransports.delete(socketId);
    }

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
    this.closeRouter(roomId);
  }

  /**
   * 고아 리소스 스캔 시작
   * @private
   */
  _startOrphanScan() {
    if (this.orphanScanTimer) {
      return;
    }

    this.orphanScanTimer = setInterval(() => {
      this._scanOrphanResources();
    }, ORPHAN_SCAN_INTERVAL_MS);

    console.log(
      `[MediasoupManager] 고아 리소스 스캔 시작 (주기: ${ORPHAN_SCAN_INTERVAL_MS / 1000}초)`
    );
  }

  /**
   * 고아 리소스 스캔 및 정리
   * @private
   */
  _scanOrphanResources() {
    let cleanedCount = 0;

    // 닫힌 Transport 정리
    for (const [transportId, transport] of this.transports.entries()) {
      if (transport.closed) {
        this.transports.delete(transportId);
        cleanedCount++;
      }
    }

    // 닫힌 Producer 정리
    for (const [producerId, producer] of this.producers.entries()) {
      if (producer.closed) {
        this._removeProducerFromMaps(producerId);
        cleanedCount++;
      }
    }

    // 닫힌 Consumer 정리
    for (const [consumerId, consumer] of this.consumers.entries()) {
      if (consumer.closed) {
        this._removeConsumerFromMaps(consumerId);
        cleanedCount++;
      }
    }

    // 닫힌 Router 정리
    for (const [roomId, router] of this.roomRouters.entries()) {
      if (router.closed) {
        this.roomRouters.delete(roomId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      console.log(`[MediasoupManager] 고아 리소스 ${cleanedCount}개 정리됨`);
    }
  }

  /**
   * 전체 리소스 정리 및 종료
   */
  cleanup() {
    console.log("[MediasoupManager] 전체 정리 시작...");

    // 타이머 정리
    if (this.orphanScanTimer) {
      clearInterval(this.orphanScanTimer);
      this.orphanScanTimer = null;
    }

    // 모든 Router 닫기 (하위 리소스 자동 정리)
    for (const roomId of this.roomRouters.keys()) {
      this.closeRouter(roomId);
    }

    // 모든 Worker 닫기
    for (const worker of this.workers) {
      if (!worker.closed) {
        worker.close();
      }
    }
    this.workers = [];

    // 맵 초기화
    this.transports.clear();
    this.peerTransports.clear();
    this.producers.clear();
    this.producerOwners.clear();
    this.consumers.clear();
    this.consumerOwners.clear();
    this.roomRouters.clear();

    this.initialized = false;
    this.nextWorkerIndex = 0;

    console.log("[MediasoupManager] 전체 정리 완료");
  }

  // ============================================
  // 상태 조회 (디버깅/모니터링용)
  // ============================================

  /**
   * 현재 상태 반환
   * @returns {object}
   */
  getStats() {
    return {
      workers: this.workers.length,
      routers: this.roomRouters.size,
      transports: this.transports.size,
      producers: this.producers.size,
      consumers: this.consumers.size,
      initialized: this.initialized,
    };
  }
}

export default MediasoupManager;
