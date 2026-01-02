/**
 * WorkerPoolManager 클래스
 * mediasoup Worker 풀 생성 및 Least-Connection 분배
 *
 * 책임:
 * - Worker 풀 초기화
 * - Least-Connection 방식으로 Worker 분배 (Router 수 기준)
 * - Worker 장애 처리 및 재생성
 * - Worker별 Router 카운트 추적
 *
 * 의존성: 없음 (최하위 모듈)
 *
 * 핸들러 주입:
 * - onWorkerDied(worker): Worker 장애 시 호출
 */

import * as mediasoup from "mediasoup";
import {
  numWorkers,
  webRtcServerEnabled,
  webRtcServerOptions,
  workerSettings,
} from "../../config/mediasoupConfig.js";

class WorkerPoolManager {
  constructor() {
    /** @type {mediasoup.types.Worker[]} Worker 풀 */
    this.workers = [];

    /** @type {Map<number, mediasoup.types.WebRtcServer>} worker.pid → WebRtcServer */
    this.webRtcServers = new Map();

    /** @type {Map<number, number>} worker.pid → Router 카운트 (Least-Connection용) */
    this.workerRouterCounts = new Map();

    /** @type {number} 라운드 로빈 인덱스 (deprecated, Least-Connection으로 대체) */
    this.nextWorkerIndex = 0;

    /** @type {boolean} 초기화 완료 여부 */
    this.initialized = false;

    /** @type {Function|null} Worker 장애 콜백 */
    this.onWorkerDied = null;

    console.log("[WorkerPoolManager] 인스턴스 생성");
  }

  /**
   * Worker 풀 초기화
   * - CPU 코어 수만큼 Worker 생성 (개발: 1개)
   */
  async initialize() {
    if (this.initialized) {
      console.warn("[WorkerPoolManager] 이미 초기화되었습니다.");
      return;
    }

    console.log(`[WorkerPoolManager] Worker 풀 초기화 시작 (목표: ${numWorkers}개)`);

    for (let i = 0; i < numWorkers; i++) {
      await this._createWorker(i);
    }

    this.initialized = true;
    console.log(`[WorkerPoolManager] 초기화 완료 - Worker ${this.workers.length}개 실행 중`);
  }

  /**
   * 개별 Worker 생성
   * @param {number} index Worker 인덱스
   * @private
   */
  async _createWorker(index) {
    const worker = await mediasoup.createWorker(workerSettings);

    // WebRtcServer 생성 (활성화된 경우, 첫 번째 Worker에만)
    // 단일 포트를 사용하므로 하나의 WebRtcServer만 필요
    if (webRtcServerEnabled && index === 0) {
      try {
        const webRtcServer = await worker.createWebRtcServer(webRtcServerOptions);
        this.webRtcServers.set(worker.pid, webRtcServer);
        console.log(
          `[WorkerPoolManager] WebRtcServer 생성: Worker ${index}, port=${webRtcServerOptions.listenInfos[0].port}`
        );
      } catch (error) {
        console.error(`[WorkerPoolManager] WebRtcServer 생성 실패: Worker ${index}`, error);
        throw error;
      }
    }

    worker.on("died", (error) => {
      console.error(`[WorkerPoolManager] Worker ${index} (PID: ${worker.pid}) 사망:`, error);

      // WebRtcServer 정리
      this.webRtcServers.delete(worker.pid);

      // Router 카운트 정리
      this.workerRouterCounts.delete(worker.pid);

      // Worker 풀에서 제거
      const workerIdx = this.workers.indexOf(worker);
      if (workerIdx !== -1) {
        this.workers.splice(workerIdx, 1);
      }

      // 외부 콜백 호출 (Router 정리 등)
      if (this.onWorkerDied) {
        this.onWorkerDied(worker);
      }

      // Worker 재생성 시도 (운영 환경에서 필요)
      if (process.env.NODE_ENV === "production") {
        console.log(`[WorkerPoolManager] Worker ${index} 재생성 시도...`);
        this._createWorker(index).catch((err) => {
          console.error(`[WorkerPoolManager] Worker ${index} 재생성 실패:`, err);
        });
      }
    });

    this.workers.push(worker);
    // Least-Connection: Router 카운트 초기화
    this.workerRouterCounts.set(worker.pid, 0);
    console.log(`[WorkerPoolManager] Worker ${index} 생성 완료 (PID: ${worker.pid})`);
  }

  /**
   * 라운드 로빈으로 다음 Worker 반환
   * @deprecated getLeastLoadedWorker() 사용 권장
   * @returns {mediasoup.types.Worker}
   */
  getNextWorker() {
    // Least-Connection 방식으로 위임
    return this.getLeastLoadedWorker();
  }

  /**
   * Least-Connection 방식으로 가장 부하가 적은 Worker 반환
   * Router 카운트가 가장 적은 Worker 선택
   * @returns {mediasoup.types.Worker}
   */
  getLeastLoadedWorker() {
    if (this.workers.length === 0) {
      throw new Error(
        "[WorkerPoolManager] 사용 가능한 Worker가 없습니다. initialize()를 먼저 호출하세요."
      );
    }

    let leastLoadedWorker = this.workers[0];
    let minCount = this.workerRouterCounts.get(leastLoadedWorker.pid) || 0;

    for (const worker of this.workers) {
      const count = this.workerRouterCounts.get(worker.pid) || 0;
      if (count < minCount) {
        minCount = count;
        leastLoadedWorker = worker;
      }
    }

    return leastLoadedWorker;
  }

  /**
   * Router 카운트 증가
   * Router 생성 시 호출
   * @param {number} workerPid Worker PID
   */
  incrementRouterCount(workerPid) {
    const current = this.workerRouterCounts.get(workerPid) || 0;
    this.workerRouterCounts.set(workerPid, current + 1);
    console.log(`[WorkerPoolManager] Worker ${workerPid} Router 카운트: ${current + 1}`);
  }

  /**
   * Router 카운트 감소
   * Router 삭제 시 호출
   * @param {number} workerPid Worker PID
   */
  decrementRouterCount(workerPid) {
    const current = this.workerRouterCounts.get(workerPid) || 0;
    if (current > 0) {
      this.workerRouterCounts.set(workerPid, current - 1);
      console.log(`[WorkerPoolManager] Worker ${workerPid} Router 카운트: ${current - 1}`);
    }
  }

  /**
   * Worker별 통계 반환 (디버깅/모니터링용)
   * @returns {Array<{pid: number, routerCount: number}>}
   */
  getWorkerStats() {
    return this.workers.map((worker) => ({
      pid: worker.pid,
      routerCount: this.workerRouterCounts.get(worker.pid) || 0,
    }));
  }

  /**
   * Worker 개수 반환
   * @returns {number}
   */
  getWorkerCount() {
    return this.workers.length;
  }

  /**
   * 초기화 상태 반환
   * @returns {boolean}
   */
  isInitialized() {
    return this.initialized;
  }

  /**
   * WebRtcServer 반환
   * 단일 포트 모드에서는 첫 번째 Worker의 WebRtcServer를 공유
   * @returns {mediasoup.types.WebRtcServer|null}
   */
  getWebRtcServer() {
    // WebRtcServer는 하나만 존재 (첫 번째 Worker에 생성됨)
    const firstServer = this.webRtcServers.values().next().value;
    return firstServer || null;
  }

  /**
   * 리소스 정리 - 모든 Worker 종료
   */
  cleanup() {
    console.log("[WorkerPoolManager] 리소스 정리");

    // WebRtcServer 정리
    for (const webRtcServer of this.webRtcServers.values()) {
      try {
        webRtcServer.close();
      } catch (e) {
        console.warn("[WorkerPoolManager] WebRtcServer 정리 에러:", e);
      }
    }
    this.webRtcServers.clear();

    // Worker 정리
    for (const worker of this.workers) {
      if (!worker.closed) {
        worker.close();
      }
    }

    this.workers = [];
    this.workerRouterCounts.clear();
    this.nextWorkerIndex = 0;
    this.initialized = false;

    console.log("[WorkerPoolManager] 리소스 정리 완료");
  }
}

export default WorkerPoolManager;
