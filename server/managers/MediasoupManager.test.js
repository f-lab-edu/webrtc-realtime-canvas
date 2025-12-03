/**
 * MediasoupManager 테스트
 * SFU 리소스 중앙 관리자 기능 테스트
 *
 * Given-When-Then 패턴 사용
 * mediasoup Worker/Router/Transport는 Mock 사용 (실제 네이티브 바이너리 필요)
 */

import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";

// mediasoup Mock
const mockWorker = {
  pid: 12345,
  closed: false,
  on: jest.fn(),
  close: jest.fn(() => {
    mockWorker.closed = true;
  }),
  createRouter: jest.fn(),
};

const mockRouter = {
  id: "mock-router-id",
  closed: false,
  rtpCapabilities: { codecs: [], headerExtensions: [] },
  close: jest.fn(() => {
    mockRouter.closed = true;
  }),
  createWebRtcTransport: jest.fn(),
  canConsume: jest.fn(() => true),
};

const mockTransport = {
  id: "mock-transport-id",
  closed: false,
  iceParameters: { usernameFragment: "test", password: "test" },
  iceCandidates: [],
  dtlsParameters: { fingerprints: [] },
  appData: {},
  on: jest.fn(),
  close: jest.fn(() => {
    mockTransport.closed = true;
  }),
  connect: jest.fn(),
  produce: jest.fn(),
  consume: jest.fn(),
};

const mockProducer = {
  id: "mock-producer-id",
  kind: "video",
  closed: false,
  on: jest.fn(),
  close: jest.fn(() => {
    mockProducer.closed = true;
  }),
  pause: jest.fn(),
  resume: jest.fn(),
};

const mockConsumer = {
  id: "mock-consumer-id",
  kind: "video",
  producerId: "mock-producer-id",
  rtpParameters: {},
  closed: false,
  on: jest.fn(),
  close: jest.fn(() => {
    mockConsumer.closed = true;
  }),
  resume: jest.fn(),
};

// mediasoup 모듈 Mock
jest.mock("mediasoup", () => ({
  createWorker: jest.fn(() => Promise.resolve(mockWorker)),
}));

// 설정 파일 Mock
jest.mock("../config/mediasoupConfig.js", () => ({
  numWorkers: 1,
  workerSettings: { logLevel: "debug" },
  routerOptions: { mediaCodecs: [] },
  webRtcTransportOptions: { listenIps: [{ ip: "127.0.0.1" }] },
}));

import MediasoupManager from "./MediasoupManager.js";

describe("MediasoupManager - 싱글톤 패턴", () => {
  beforeEach(() => {
    // 각 테스트 전에 싱글톤 인스턴스 초기화
    MediasoupManager.resetInstance();

    // Mock 상태 초기화
    mockWorker.closed = false;
    mockRouter.closed = false;
    mockTransport.closed = false;
    mockProducer.closed = false;
    mockConsumer.closed = false;

    // Mock 함수 초기화
    jest.clearAllMocks();
    mockWorker.createRouter.mockResolvedValue(mockRouter);
    mockRouter.createWebRtcTransport.mockResolvedValue(mockTransport);
    mockTransport.produce.mockResolvedValue(mockProducer);
    mockTransport.consume.mockResolvedValue(mockConsumer);
  });

  afterEach(() => {
    MediasoupManager.resetInstance();
  });

  describe("getInstance()", () => {
    it("동일한 인스턴스를 반환한다", () => {
      // Given: getInstance 두 번 호출
      // When
      const instance1 = MediasoupManager.getInstance();
      const instance2 = MediasoupManager.getInstance();

      // Then: 동일한 인스턴스
      expect(instance1).toBe(instance2);
    });
  });

  describe("resetInstance()", () => {
    it("싱글톤 인스턴스를 초기화한다", () => {
      // Given: 인스턴스가 존재
      const instance1 = MediasoupManager.getInstance();

      // When: 초기화
      MediasoupManager.resetInstance();
      const instance2 = MediasoupManager.getInstance();

      // Then: 새로운 인스턴스
      expect(instance1).not.toBe(instance2);
    });
  });
});

describe("MediasoupManager - Worker 풀 관리", () => {
  let manager;

  beforeEach(() => {
    MediasoupManager.resetInstance();
    manager = MediasoupManager.getInstance();

    // Mock 상태 초기화
    mockWorker.closed = false;
    jest.clearAllMocks();
    mockWorker.createRouter.mockResolvedValue(mockRouter);
  });

  afterEach(() => {
    MediasoupManager.resetInstance();
  });

  describe("initialize()", () => {
    it("Worker 풀을 초기화한다", async () => {
      // Given: 초기화되지 않은 상태
      expect(manager.initialized).toBe(false);

      // When: 초기화
      await manager.initialize();

      // Then: Worker 생성 및 initialized 상태
      expect(manager.initialized).toBe(true);
      expect(manager.workers.length).toBe(1);
    });

    it("이미 초기화된 경우 중복 초기화하지 않는다", async () => {
      // Given: 이미 초기화됨
      await manager.initialize();

      // When: 다시 초기화 시도
      await manager.initialize();

      // Then: Worker 수 변화 없음
      expect(manager.workers.length).toBe(1);
    });
  });

  describe("getNextWorker()", () => {
    it("초기화 전에 호출하면 에러를 던진다", () => {
      // Given: 초기화되지 않은 상태
      // When/Then
      expect(() => manager.getNextWorker()).toThrow("Worker가 없습니다");
    });

    it("라운드 로빈으로 Worker를 반환한다", async () => {
      // Given: 초기화됨
      await manager.initialize();

      // When: Worker 요청
      const worker = manager.getNextWorker();

      // Then: Worker 반환
      expect(worker).toBeDefined();
      expect(worker.pid).toBe(12345);
    });
  });
});

describe("MediasoupManager - Router 관리", () => {
  let manager;

  beforeEach(async () => {
    MediasoupManager.resetInstance();
    manager = MediasoupManager.getInstance();

    // Mock 상태 초기화
    mockWorker.closed = false;
    mockRouter.closed = false;
    jest.clearAllMocks();
    mockWorker.createRouter.mockResolvedValue(mockRouter);

    await manager.initialize();
  });

  afterEach(() => {
    MediasoupManager.resetInstance();
  });

  describe("createRouter()", () => {
    it("roomId로 Router를 생성한다", async () => {
      // Given: 방 ID
      const roomId = "test-room";

      // When: Router 생성
      const router = await manager.createRouter(roomId);

      // Then: Router 생성 및 저장
      expect(router).toBeDefined();
      expect(manager.roomRouters.has(roomId)).toBe(true);
    });

    it("roomId 없이 호출하면 에러를 던진다", async () => {
      // Given/When/Then
      await expect(manager.createRouter(null)).rejects.toThrow("roomId는 필수");
    });

    it("이미 존재하는 roomId면 기존 Router를 반환한다", async () => {
      // Given: 이미 Router 존재
      const roomId = "test-room";
      await manager.createRouter(roomId);

      // When: 같은 roomId로 다시 생성
      const router = await manager.createRouter(roomId);

      // Then: 기존 Router 반환, createRouter 1번만 호출
      expect(router).toBeDefined();
      expect(mockWorker.createRouter).toHaveBeenCalledTimes(1);
    });
  });

  describe("getRouter()", () => {
    it("존재하는 Router를 반환한다", async () => {
      // Given: Router 존재
      const roomId = "test-room";
      await manager.createRouter(roomId);

      // When: 조회
      const router = manager.getRouter(roomId);

      // Then: Router 반환
      expect(router).toBeDefined();
    });

    it("존재하지 않는 Router는 undefined를 반환한다", () => {
      // Given/When
      const router = manager.getRouter("non-existent");

      // Then
      expect(router).toBeUndefined();
    });
  });

  describe("closeRouter()", () => {
    it("Router를 삭제한다", async () => {
      // Given: Router 존재
      const roomId = "test-room";
      await manager.createRouter(roomId);

      // When: 삭제
      manager.closeRouter(roomId);

      // Then: Router 제거
      expect(manager.roomRouters.has(roomId)).toBe(false);
    });
  });
});

describe("MediasoupManager - Transport 관리", () => {
  let manager;
  let router;

  beforeEach(async () => {
    MediasoupManager.resetInstance();
    manager = MediasoupManager.getInstance();

    // Mock 상태 초기화
    mockWorker.closed = false;
    mockRouter.closed = false;
    mockTransport.closed = false;
    mockTransport.appData = {};
    jest.clearAllMocks();
    mockWorker.createRouter.mockResolvedValue(mockRouter);
    mockRouter.createWebRtcTransport.mockResolvedValue(mockTransport);

    await manager.initialize();
    router = await manager.createRouter("test-room");
  });

  afterEach(() => {
    MediasoupManager.resetInstance();
  });

  describe("createWebRtcTransport()", () => {
    it("Transport를 생성한다", async () => {
      // Given: Router와 socketId
      const socketId = "socket-1";

      // When: Transport 생성
      const transport = await manager.createWebRtcTransport(router, socketId);

      // Then: Transport 생성 및 저장
      expect(transport).toBeDefined();
      expect(manager.transports.has(transport.id)).toBe(true);
      expect(manager.peerTransports.has(socketId)).toBe(true);
    });

    it("필수 파라미터 없이 호출하면 에러를 던진다", async () => {
      // Given/When/Then
      await expect(manager.createWebRtcTransport(null, "socket-1")).rejects.toThrow("필수");
    });
  });

  describe("connectTransport()", () => {
    it("Transport를 연결한다", async () => {
      // Given: Transport 존재
      const socketId = "socket-1";
      const transport = await manager.createWebRtcTransport(router, socketId);
      const dtlsParameters = { fingerprints: [] };

      // When: 연결
      await manager.connectTransport(transport.id, dtlsParameters);

      // Then: connect 호출
      expect(mockTransport.connect).toHaveBeenCalledWith({ dtlsParameters });
    });

    it("존재하지 않는 Transport면 에러를 던진다", async () => {
      // Given/When/Then
      await expect(manager.connectTransport("invalid-id", {})).rejects.toThrow("찾을 수 없습니다");
    });
  });

  describe("closeTransport()", () => {
    it("Transport를 삭제한다", async () => {
      // Given: Transport 존재
      const socketId = "socket-1";
      const transport = await manager.createWebRtcTransport(router, socketId);

      // When: 삭제
      manager.closeTransport(transport.id);

      // Then: Transport 제거
      expect(manager.transports.has(transport.id)).toBe(false);
    });
  });
});

describe("MediasoupManager - Producer 관리", () => {
  let manager;
  let router;
  let transport;

  beforeEach(async () => {
    MediasoupManager.resetInstance();
    manager = MediasoupManager.getInstance();

    // Mock 상태 초기화
    mockWorker.closed = false;
    mockRouter.closed = false;
    mockTransport.closed = false;
    mockProducer.closed = false;
    mockTransport.appData = { socketId: "socket-1" };
    jest.clearAllMocks();
    mockWorker.createRouter.mockResolvedValue(mockRouter);
    mockRouter.createWebRtcTransport.mockResolvedValue(mockTransport);
    mockTransport.produce.mockResolvedValue(mockProducer);

    await manager.initialize();
    router = await manager.createRouter("test-room");
    transport = await manager.createWebRtcTransport(router, "socket-1");
  });

  afterEach(() => {
    MediasoupManager.resetInstance();
  });

  describe("createProducer()", () => {
    it("Producer를 생성한다", async () => {
      // Given: Transport와 RTP 파라미터
      const kind = "video";
      const rtpParameters = { codecs: [] };

      // When: Producer 생성
      const producer = await manager.createProducer(transport, kind, rtpParameters);

      // Then: Producer 생성 및 저장
      expect(producer).toBeDefined();
      expect(manager.producers.has(producer.id)).toBe(true);
    });

    it("필수 파라미터 없이 호출하면 에러를 던진다", async () => {
      // Given/When/Then
      await expect(manager.createProducer(null, "video", {})).rejects.toThrow("필수");
    });
  });

  describe("pauseProducer() / resumeProducer()", () => {
    it("Producer를 일시정지하고 재개한다", async () => {
      // Given: Producer 존재
      const producer = await manager.createProducer(transport, "video", { codecs: [] });

      // When: 일시정지 및 재개
      await manager.pauseProducer(producer.id);
      await manager.resumeProducer(producer.id);

      // Then: pause/resume 호출
      expect(mockProducer.pause).toHaveBeenCalled();
      expect(mockProducer.resume).toHaveBeenCalled();
    });
  });

  describe("closeProducer()", () => {
    it("Producer를 삭제한다", async () => {
      // Given: Producer 존재
      const producer = await manager.createProducer(transport, "video", { codecs: [] });

      // When: 삭제
      manager.closeProducer(producer.id);

      // Then: Producer 제거
      expect(manager.producers.has(producer.id)).toBe(false);
    });
  });
});

describe("MediasoupManager - Consumer 관리", () => {
  let manager;
  let router;
  let transport;
  let producer;

  beforeEach(async () => {
    MediasoupManager.resetInstance();
    manager = MediasoupManager.getInstance();

    // Mock 상태 초기화
    mockWorker.closed = false;
    mockRouter.closed = false;
    mockTransport.closed = false;
    mockProducer.closed = false;
    mockConsumer.closed = false;
    mockTransport.appData = { socketId: "socket-1" };
    jest.clearAllMocks();
    mockWorker.createRouter.mockResolvedValue(mockRouter);
    mockRouter.createWebRtcTransport.mockResolvedValue(mockTransport);
    mockTransport.produce.mockResolvedValue(mockProducer);
    mockTransport.consume.mockResolvedValue(mockConsumer);
    mockRouter.canConsume.mockReturnValue(true);

    await manager.initialize();
    router = await manager.createRouter("test-room");
    transport = await manager.createWebRtcTransport(router, "socket-1");
    producer = await manager.createProducer(transport, "video", { codecs: [] });
  });

  afterEach(() => {
    MediasoupManager.resetInstance();
  });

  describe("createConsumer()", () => {
    it("Consumer를 생성한다", async () => {
      // Given: Router, Transport, Producer, rtpCapabilities
      const rtpCapabilities = { codecs: [] };

      // When: Consumer 생성
      const consumer = await manager.createConsumer(
        router,
        transport,
        producer.id,
        rtpCapabilities
      );

      // Then: Consumer 생성 및 저장
      expect(consumer).toBeDefined();
      expect(manager.consumers.has(consumer.id)).toBe(true);
    });

    it("canConsume이 false면 에러를 던진다", async () => {
      // Given: canConsume이 false
      mockRouter.canConsume.mockReturnValue(false);

      // When/Then
      await expect(
        manager.createConsumer(router, transport, producer.id, { codecs: [] })
      ).rejects.toThrow("Cannot consume");
    });
  });

  describe("resumeConsumer()", () => {
    it("Consumer를 재개한다", async () => {
      // Given: Consumer 존재
      const consumer = await manager.createConsumer(router, transport, producer.id, { codecs: [] });

      // When: 재개
      await manager.resumeConsumer(consumer.id);

      // Then: resume 호출
      expect(mockConsumer.resume).toHaveBeenCalled();
    });
  });

  describe("closeConsumer()", () => {
    it("Consumer를 삭제한다", async () => {
      // Given: Consumer 존재
      const consumer = await manager.createConsumer(router, transport, producer.id, { codecs: [] });

      // When: 삭제
      manager.closeConsumer(consumer.id);

      // Then: Consumer 제거
      expect(manager.consumers.has(consumer.id)).toBe(false);
    });
  });
});

describe("MediasoupManager - 리소스 정리", () => {
  let manager;

  beforeEach(async () => {
    MediasoupManager.resetInstance();
    manager = MediasoupManager.getInstance();

    // Mock 상태 초기화
    mockWorker.closed = false;
    mockRouter.closed = false;
    mockTransport.closed = false;
    mockProducer.closed = false;
    mockConsumer.closed = false;
    mockTransport.appData = { socketId: "socket-1" };
    jest.clearAllMocks();
    mockWorker.createRouter.mockResolvedValue(mockRouter);
    mockRouter.createWebRtcTransport.mockResolvedValue(mockTransport);
    mockTransport.produce.mockResolvedValue(mockProducer);
    mockTransport.consume.mockResolvedValue(mockConsumer);
    mockRouter.canConsume.mockReturnValue(true);

    await manager.initialize();
  });

  afterEach(() => {
    MediasoupManager.resetInstance();
  });

  describe("cleanupPeer()", () => {
    it("참가자의 모든 리소스를 정리한다", async () => {
      // Given: 참가자가 Transport, Producer, Consumer 보유
      const socketId = "socket-1";
      const router = await manager.createRouter("test-room");
      await manager.createWebRtcTransport(router, socketId);

      // When: 참가자 정리
      manager.cleanupPeer(socketId);

      // Then: 해당 참가자의 Transport 정리
      expect(manager.peerTransports.has(socketId)).toBe(false);
    });
  });

  describe("cleanupRoom()", () => {
    it("방의 모든 리소스를 정리한다", async () => {
      // Given: 방에 Router 존재
      const roomId = "test-room";
      await manager.createRouter(roomId);

      // When: 방 정리
      manager.cleanupRoom(roomId);

      // Then: Router 제거
      expect(manager.roomRouters.has(roomId)).toBe(false);
    });
  });

  describe("cleanup()", () => {
    it("모든 리소스를 정리한다", async () => {
      // Given: 여러 리소스 존재
      const router = await manager.createRouter("test-room");
      await manager.createWebRtcTransport(router, "socket-1");

      // When: 전체 정리
      manager.cleanup();

      // Then: 모든 맵 초기화
      expect(manager.roomRouters.size).toBe(0);
      expect(manager.transports.size).toBe(0);
      expect(manager.workers.length).toBe(0);
      expect(manager.initialized).toBe(false);
    });
  });

  describe("getStats()", () => {
    it("현재 상태를 반환한다", async () => {
      // Given: 리소스 존재
      await manager.createRouter("test-room");

      // When: 상태 조회
      const stats = manager.getStats();

      // Then: 상태 정보 포함
      expect(stats.workers).toBe(1);
      expect(stats.routers).toBe(1);
      expect(stats.initialized).toBe(true);
    });
  });
});
