/**
 * WorkerPoolManager 클래스
 * mediasoup Worker 풀 생성 및 라운드 로빈 분배
 *
 * 책임:
 * - Worker 풀 초기화
 * - 라운드 로빈으로 Worker 분배
 * - Worker 장애 처리 및 재생성
 *
 * 의존성: 없음 (최하위 모듈)
 *
 * 핸들러 주입:
 * - onWorkerDied(worker): Worker 장애 시 호출
 */

import * as mediasoup from "mediasoup";
import {
  numWorkers,
  workerSettings,
  webRtcServerEnabled,
  webRtcServerOptions,
} from "../../config/mediasoupConfig.js";

class WorkerPoolManager {
  constructor() {
    /** @type {mediasoup.types.Worker[]} Worker 풀 */
    this.workers = [];

    /** @type {Map<number, mediasoup.types.WebRtcServer>} worker.pid → WebRtcServer */
    this.webRtcServers = new Map();

    /** @type {number} 라운드 로빈 인덱스 */
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

    // WebRtcServer 생성 (활성화된 경우)
    if (webRtcServerEnabled) {
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
    console.log(`[WorkerPoolManager] Worker ${index} 생성 완료 (PID: ${worker.pid})`);
  }

  /**
   * 라운드 로빈으로 다음 Worker 반환
   * @returns {mediasoup.types.Worker}
   */
  getNextWorker() {
    if (this.workers.length === 0) {
      throw new Error(
        "[WorkerPoolManager] 사용 가능한 Worker가 없습니다. initialize()를 먼저 호출하세요."
      );
    }

    const worker = this.workers[this.nextWorkerIndex];
    this.nextWorkerIndex = (this.nextWorkerIndex + 1) % this.workers.length;
    return worker;
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
   * Worker에 연결된 WebRtcServer 반환
   * @param {mediasoup.types.Worker} worker
   * @returns {mediasoup.types.WebRtcServer|null}
   */
  getWebRtcServer(worker) {
    if (!worker) return null;
    return this.webRtcServers.get(worker.pid) || null;
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
    this.nextWorkerIndex = 0;
    this.initialized = false;

    console.log("[WorkerPoolManager] 리소스 정리 완료");
  }
}

export default WorkerPoolManager;
