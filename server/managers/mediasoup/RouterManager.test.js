/**
 * RouterManager 테스트
 * Router 생성/삭제 시 Least-Connection 카운트 동기화 테스트
 *
 * Given-When-Then 패턴 사용
 */

import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";

// Mock Router 생성 함수
const createMockRouter = (roomId, worker) => ({
  id: `router-${roomId}`,
  closed: false,
  close: jest.fn(function () {
    this.closed = true;
  }),
  appData: { roomId, worker },
});

// Mock Worker 생성 함수
const createMockWorker = (pid) => ({
  pid,
  closed: false,
  createRouter: jest.fn(),
});

// 설정 파일 Mock
jest.mock("../../config/mediasoupConfig.js", () => ({
  routerOptions: { mediaCodecs: [] },
}));

import RouterManager from "./RouterManager.js";

describe("RouterManager - Least-Connection 연동", () => {
  let routerManager;
  let mockWorkerPoolManager;
  let mockWorkers;

  beforeEach(() => {
    // Mock Workers
    mockWorkers = [createMockWorker(1001), createMockWorker(1002), createMockWorker(1003)];

    // Mock WorkerPoolManager
    mockWorkerPoolManager = {
      getLeastLoadedWorker: jest.fn(() => mockWorkers[0]),
      incrementRouterCount: jest.fn(),
      decrementRouterCount: jest.fn(),
    };

    routerManager = new RouterManager(mockWorkerPoolManager);
  });

  afterEach(() => {
    routerManager.cleanup();
    jest.clearAllMocks();
  });

  describe("createRouter()", () => {
    it("Given roomId, When createRouter, Then getLeastLoadedWorker 호출", async () => {
      // Given
      const roomId = "test-room-1";
      const mockRouter = createMockRouter(roomId, mockWorkers[0]);
      mockWorkers[0].createRouter.mockResolvedValue(mockRouter);

      // When
      await routerManager.createRouter(roomId);

      // Then
      expect(mockWorkerPoolManager.getLeastLoadedWorker).toHaveBeenCalled();
    });

    it("Given roomId, When createRouter 성공, Then incrementRouterCount 호출", async () => {
      // Given
      const roomId = "test-room-1";
      const mockRouter = createMockRouter(roomId, mockWorkers[0]);
      mockWorkers[0].createRouter.mockResolvedValue(mockRouter);

      // When
      await routerManager.createRouter(roomId);

      // Then
      expect(mockWorkerPoolManager.incrementRouterCount).toHaveBeenCalledWith(1001);
    });

    it("Given 이미 Router 존재, When createRouter, Then incrementRouterCount 미호출", async () => {
      // Given: 첫 번째 Router 생성
      const roomId = "test-room-1";
      const mockRouter = createMockRouter(roomId, mockWorkers[0]);
      mockWorkers[0].createRouter.mockResolvedValue(mockRouter);
      await routerManager.createRouter(roomId);

      jest.clearAllMocks();

      // When: 같은 roomId로 다시 생성 시도
      await routerManager.createRouter(roomId);

      // Then: 기존 Router 반환, incrementRouterCount 미호출
      expect(mockWorkerPoolManager.incrementRouterCount).not.toHaveBeenCalled();
    });
  });

  describe("closeRouter()", () => {
    it("Given Router 존재, When closeRouter, Then decrementRouterCount 호출", async () => {
      // Given: Router 생성
      const roomId = "test-room-1";
      const mockRouter = createMockRouter(roomId, mockWorkers[0]);
      mockWorkers[0].createRouter.mockResolvedValue(mockRouter);
      await routerManager.createRouter(roomId);

      jest.clearAllMocks();

      // When
      routerManager.closeRouter(roomId);

      // Then
      expect(mockWorkerPoolManager.decrementRouterCount).toHaveBeenCalledWith(1001);
    });

    it("Given Router 미존재, When closeRouter, Then decrementRouterCount 미호출", () => {
      // Given: Router 없음

      // When
      routerManager.closeRouter("non-existent-room");

      // Then
      expect(mockWorkerPoolManager.decrementRouterCount).not.toHaveBeenCalled();
    });

    it("Given Router appData에 worker 없음, When closeRouter, Then 에러 없이 처리", async () => {
      // Given: worker 참조 없는 Router
      const roomId = "test-room-1";
      const mockRouter = {
        id: "router-1",
        closed: false,
        close: jest.fn(),
        appData: { roomId }, // worker 없음
      };
      mockWorkers[0].createRouter.mockResolvedValue(mockRouter);
      await routerManager.createRouter(roomId);

      // When/Then: 에러 없이 처리
      expect(() => routerManager.closeRouter(roomId)).not.toThrow();
    });
  });

  describe("Router 생성/삭제 시 카운트 동기화 (통합)", () => {
    it("Given 여러 방 생성/삭제, When 순서대로 처리, Then 카운트 정확히 동기화", async () => {
      // Given: Mock 설정
      let workerIndex = 0;
      mockWorkerPoolManager.getLeastLoadedWorker.mockImplementation(() => {
        const worker = mockWorkers[workerIndex % 3];
        workerIndex++;
        return worker;
      });

      for (const worker of mockWorkers) {
        worker.createRouter.mockImplementation(() =>
          Promise.resolve(createMockRouter(`room-${Math.random()}`, worker))
        );
      }

      // When: 3개 방 생성
      await routerManager.createRouter("room-1");
      await routerManager.createRouter("room-2");
      await routerManager.createRouter("room-3");

      // Then: incrementRouterCount 3번 호출
      expect(mockWorkerPoolManager.incrementRouterCount).toHaveBeenCalledTimes(3);

      // When: 1개 방 삭제
      routerManager.closeRouter("room-2");

      // Then: decrementRouterCount 1번 호출
      expect(mockWorkerPoolManager.decrementRouterCount).toHaveBeenCalledTimes(1);
    });
  });
});

describe("RouterManager - 에러 케이스", () => {
  describe("constructor()", () => {
    it("Given workerPoolManager 없음, When 생성, Then 에러 던짐", () => {
      // Given/When/Then
      expect(() => new RouterManager(null)).toThrow("workerPoolManager는 필수");
    });
  });
});
