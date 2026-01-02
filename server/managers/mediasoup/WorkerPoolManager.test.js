/**
 * WorkerPoolManager 테스트
 * Least-Connection Worker 분배 알고리즘 테스트
 *
 * Given-When-Then 패턴 사용
 * 직접 Worker 배열을 조작하여 테스트 (mediasoup mock 회피)
 */

import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";

// Mock Worker 생성 함수
const createMockWorker = (pid) => ({
  pid,
  closed: false,
  on: jest.fn(),
  close: jest.fn(function () {
    this.closed = true;
  }),
  createRouter: jest.fn(),
});

describe("WorkerPoolManager - Least-Connection 알고리즘", () => {
  let WorkerPoolManager;
  let manager;
  let mockWorkers;

  beforeEach(async () => {
    // ESM 동적 import로 mock 문제 회피
    jest.resetModules();

    // Mock 설정
    jest.unstable_mockModule("mediasoup", () => ({
      createWorker: jest.fn(),
    }));

    jest.unstable_mockModule("../../config/mediasoupConfig.js", () => ({
      numWorkers: 3,
      workerSettings: { logLevel: "debug" },
      routerOptions: { mediaCodecs: [] },
      webRtcServerEnabled: false,
      webRtcServerOptions: {},
    }));

    // 동적 import
    const module = await import("./WorkerPoolManager.js");
    WorkerPoolManager = module.default;

    // 3개의 Mock Worker 준비
    mockWorkers = [createMockWorker(1001), createMockWorker(1002), createMockWorker(1003)];

    // Manager 생성 후 직접 Worker 배열 설정 (initialize 우회)
    manager = new WorkerPoolManager();
    manager.workers = mockWorkers;
    manager.initialized = true;
    for (const worker of mockWorkers) {
      manager.workerRouterCounts.set(worker.pid, 0);
    }
  });

  afterEach(() => {
    if (manager) {
      manager.cleanup();
    }
    jest.clearAllMocks();
  });

  describe("getLeastLoadedWorker()", () => {
    it("Given 모든 Worker가 0개 Router, When getLeastLoadedWorker, Then 첫 번째 Worker 반환", () => {
      // Given: 초기 상태 (모든 Worker 0개 Router)

      // When
      const worker = manager.getLeastLoadedWorker();

      // Then: 첫 번째 Worker 반환 (동일 부하 시 첫 번째)
      expect(worker.pid).toBe(1001);
    });

    it("Given Worker별 Router 카운트 다름, When getLeastLoadedWorker, Then 가장 적은 Worker 반환", () => {
      // Given: Worker 0에 2개, Worker 1에 1개, Worker 2에 0개
      manager.incrementRouterCount(1001);
      manager.incrementRouterCount(1001);
      manager.incrementRouterCount(1002);
      // Worker 1003은 0개

      // When
      const worker = manager.getLeastLoadedWorker();

      // Then: Worker 2 (PID 1003) 반환
      expect(worker.pid).toBe(1003);
    });

    it("Given Worker 0에 2개, Worker 1에 1개 Router, When 새 방 생성, Then Worker 2 선택 (AC2)", () => {
      // Given: AC2 시나리오
      manager.incrementRouterCount(1001);
      manager.incrementRouterCount(1001);
      manager.incrementRouterCount(1002);

      // When: 새 방 생성 시 Worker 선택
      const worker = manager.getLeastLoadedWorker();

      // Then: 가장 적은 Worker 2 (1003) 선택
      expect(worker.pid).toBe(1003);
    });
  });

  describe("incrementRouterCount()", () => {
    it("Given Worker PID, When incrementRouterCount, Then 카운트 증가", () => {
      // Given
      const pid = 1001;
      const initialStats = manager.getWorkerStats().find((s) => s.pid === pid);
      expect(initialStats.routerCount).toBe(0);

      // When
      manager.incrementRouterCount(pid);

      // Then
      const afterStats = manager.getWorkerStats().find((s) => s.pid === pid);
      expect(afterStats.routerCount).toBe(1);
    });

    it("Given 여러 번 호출, When incrementRouterCount, Then 누적 증가", () => {
      // Given
      const pid = 1001;

      // When
      manager.incrementRouterCount(pid);
      manager.incrementRouterCount(pid);
      manager.incrementRouterCount(pid);

      // Then
      const stats = manager.getWorkerStats().find((s) => s.pid === pid);
      expect(stats.routerCount).toBe(3);
    });
  });

  describe("decrementRouterCount()", () => {
    it("Given Worker에 Router 1개, When 방 종료, Then 카운트 0 (AC3)", () => {
      // Given: Worker 0에 Router 1개
      manager.incrementRouterCount(1001);
      expect(manager.getWorkerStats().find((s) => s.pid === 1001).routerCount).toBe(1);

      // When: 해당 방 종료
      manager.decrementRouterCount(1001);

      // Then: Worker 0 카운트 0
      expect(manager.getWorkerStats().find((s) => s.pid === 1001).routerCount).toBe(0);
    });

    it("Given 카운트 0인 Worker, When decrementRouterCount, Then 0 유지 (음수 방지)", () => {
      // Given: 초기 상태 0
      expect(manager.getWorkerStats().find((s) => s.pid === 1001).routerCount).toBe(0);

      // When: 감소 시도
      manager.decrementRouterCount(1001);

      // Then: 0 유지 (음수가 되지 않음)
      expect(manager.getWorkerStats().find((s) => s.pid === 1001).routerCount).toBe(0);
    });
  });

  describe("getWorkerStats()", () => {
    it("Given 초기화된 Manager, When getWorkerStats, Then Worker별 통계 반환", () => {
      // Given: 일부 Router 카운트 설정
      manager.incrementRouterCount(1001);
      manager.incrementRouterCount(1002);
      manager.incrementRouterCount(1002);

      // When
      const stats = manager.getWorkerStats();

      // Then
      expect(stats).toHaveLength(3);
      expect(stats.find((s) => s.pid === 1001).routerCount).toBe(1);
      expect(stats.find((s) => s.pid === 1002).routerCount).toBe(2);
      expect(stats.find((s) => s.pid === 1003).routerCount).toBe(0);
    });
  });

  describe("Worker 죽음 처리 (AC4)", () => {
    it("Given Worker에 Router 카운트 있음, When workerRouterCounts.delete, Then 해당 Worker 카운트 없음", () => {
      // Given: Worker 1에 Router 2개
      manager.incrementRouterCount(1002);
      manager.incrementRouterCount(1002);
      expect(manager.workerRouterCounts.has(1002)).toBe(true);

      // When: Worker 죽음 시 카운트 삭제 시뮬레이션
      manager.workerRouterCounts.delete(1002);

      // Then: Worker 1 카운트 없음
      expect(manager.workerRouterCounts.has(1002)).toBe(false);
    });
  });

  describe("getNextWorker() 하위 호환성", () => {
    it("Given getNextWorker 호출, When Least-Connection 위임, Then 올바른 Worker 반환", () => {
      // Given: Worker 0에 2개, Worker 1에 1개
      manager.incrementRouterCount(1001);
      manager.incrementRouterCount(1001);
      manager.incrementRouterCount(1002);

      // When: deprecated getNextWorker() 호출
      const worker = manager.getNextWorker();

      // Then: Least-Connection 결과와 동일 (Worker 2 반환)
      expect(worker.pid).toBe(1003);
    });
  });

  describe("cleanup()", () => {
    it("Given Router 카운트 존재, When cleanup, Then 모든 카운트 초기화", () => {
      // Given
      manager.incrementRouterCount(1001);
      manager.incrementRouterCount(1002);
      expect(manager.workerRouterCounts.size).toBe(3);

      // When
      manager.cleanup();

      // Then
      expect(manager.workerRouterCounts.size).toBe(0);
      expect(manager.workers.length).toBe(0);
    });
  });
});

describe("WorkerPoolManager - 에러 케이스", () => {
  let WorkerPoolManager;
  let manager;

  beforeEach(async () => {
    jest.resetModules();

    jest.unstable_mockModule("mediasoup", () => ({
      createWorker: jest.fn(),
    }));

    jest.unstable_mockModule("../../config/mediasoupConfig.js", () => ({
      numWorkers: 3,
      workerSettings: { logLevel: "debug" },
      routerOptions: { mediaCodecs: [] },
      webRtcServerEnabled: false,
      webRtcServerOptions: {},
    }));

    const module = await import("./WorkerPoolManager.js");
    WorkerPoolManager = module.default;
    manager = new WorkerPoolManager();
  });

  afterEach(() => {
    if (manager) {
      manager.cleanup();
    }
    jest.clearAllMocks();
  });

  describe("getLeastLoadedWorker() 에러", () => {
    it("Given 초기화 전, When getLeastLoadedWorker, Then 에러 던짐", () => {
      // Given: 초기화되지 않은 상태 (workers 비어있음)

      // When/Then
      expect(() => manager.getLeastLoadedWorker()).toThrow("Worker가 없습니다");
    });
  });
});
