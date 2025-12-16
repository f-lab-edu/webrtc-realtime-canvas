/**
 * RouterManager 클래스
 * Router 생성 및 Room:Router 매핑 관리
 *
 * 책임:
 * - Router 생성 (Room:Router 1:1 매핑)
 * - Router 조회
 * - Router 삭제
 * - Worker 장애 시 Router 정리
 *
 * 의존성:
 * - WorkerPoolManager (Worker 필요)
 */

import { routerOptions } from "../../config/mediasoupConfig.js";

class RouterManager {
  /**
   * @param {WorkerPoolManager} workerPoolManager Worker Pool Manager
   */
  constructor(workerPoolManager) {
    if (!workerPoolManager) {
      throw new Error("[RouterManager] workerPoolManager는 필수입니다.");
    }

    /** @type {WorkerPoolManager} */
    this.workerPoolManager = workerPoolManager;

    /** @type {Map<string, Object>} roomId → Router */
    this.roomRouters = new Map();

    console.log("[RouterManager] 인스턴스 생성");
  }

  /**
   * 방에 대한 Router 생성
   * @param {string} roomId 방 ID
   * @returns {Promise<Object>} Router 인스턴스
   */
  async createRouter(roomId) {
    if (!roomId) {
      throw new Error("[RouterManager] roomId는 필수입니다.");
    }

    // 이미 존재하면 기존 Router 반환
    if (this.roomRouters.has(roomId)) {
      console.log(`[RouterManager] 기존 Router 반환: roomId=${roomId}`);
      return this.roomRouters.get(roomId);
    }

    const worker = this.workerPoolManager.getNextWorker();
    const router = await worker.createRouter(routerOptions);

    // Worker 참조 저장 (WebRtcServer 조회용)
    router.appData = { roomId, worker };

    this.roomRouters.set(roomId, router);
    console.log(`[RouterManager] Router 생성: roomId=${roomId}`);

    return router;
  }

  /**
   * 방의 Router 조회
   * @param {string} roomId 방 ID
   * @returns {Object|undefined}
   */
  getRouter(roomId) {
    return this.roomRouters.get(roomId);
  }

  /**
   * Room에 할당된 Worker 반환
   * @param {string} roomId
   * @returns {mediasoup.types.Worker|null}
   */
  getWorkerForRoom(roomId) {
    const router = this.roomRouters.get(roomId);
    if (!router) return null;
    return router.appData?.worker || null;
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
    console.log(`[RouterManager] Router 삭제: roomId=${roomId}`);
  }

  /**
   * 죽은 Worker의 Router들 정리
   * Router가 닫힌 상태면 맵에서 제거
   */
  handleDeadWorkerRouters() {
    for (const [roomId, router] of this.roomRouters.entries()) {
      if (router.closed) {
        console.log(`[RouterManager] 죽은 Worker의 Router 정리: roomId=${roomId}`);
        this.roomRouters.delete(roomId);
      }
    }
  }

  /**
   * 닫힌 Router roomId 목록 반환 (고아 리소스 정리용)
   * @returns {string[]}
   */
  getClosedRouterRoomIds() {
    const closedRoomIds = [];
    for (const [roomId, router] of this.roomRouters.entries()) {
      if (router.closed) {
        closedRoomIds.push(roomId);
      }
    }
    return closedRoomIds;
  }

  /**
   * Router 개수 반환
   * @returns {number}
   */
  getRouterCount() {
    return this.roomRouters.size;
  }

  /**
   * 리소스 정리 - 모든 Router 닫기
   */
  cleanup() {
    console.log("[RouterManager] 리소스 정리");

    for (const [roomId, router] of this.roomRouters.entries()) {
      try {
        if (!router.closed) {
          router.close();
        }
      } catch (e) {
        console.warn(`[RouterManager] Router 정리 에러: roomId=${roomId}`, e);
      }
    }

    this.roomRouters.clear();

    console.log("[RouterManager] 리소스 정리 완료");
  }
}

export default RouterManager;
