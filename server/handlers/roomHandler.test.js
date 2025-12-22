/**
 * roomHandler 테스트
 * 방 입장 실패 로깅 관련 핸들러 테스트
 */
import { jest } from "@jest/globals";
import joinFailureLogger from "../utils/JoinFailureLogger.js";
import { registerRoomHandlers } from "./roomHandler.js";

// Mock 객체 생성 헬퍼
const createMockSocket = () => ({
  id: "test-socket-123",
  on: jest.fn(),
  emit: jest.fn(),
  to: jest.fn(() => ({ emit: jest.fn() })),
  join: jest.fn(),
  leave: jest.fn(),
});

const createMockIo = () => ({
  to: jest.fn(() => ({ emit: jest.fn() })),
});

const createMockRoomManager = () => ({
  joinRoom: jest.fn(),
  leaveRoom: jest.fn(),
  getRoom: jest.fn(),
  getRoomNicknames: jest.fn(() => ({})),
  getRoomIdBySocketId: jest.fn(),
  setParticipantNickname: jest.fn(),
  getParticipantNickname: jest.fn(),
});

describe("roomHandler - 방 입장 실패 로깅", () => {
  let mockIo;
  let mockSocket;
  let mockRoomManager;
  let logFailureSpy;
  let writeToFileSpy;

  beforeEach(() => {
    mockIo = createMockIo();
    mockSocket = createMockSocket();
    mockRoomManager = createMockRoomManager();

    // M3: logFailure 직접 spy + writeToFile mock (실제 파일 쓰기 방지)
    logFailureSpy = jest.spyOn(joinFailureLogger, "logFailure");
    writeToFileSpy = jest.spyOn(joinFailureLogger, "writeToFile").mockResolvedValue(undefined);
  });

  afterEach(() => {
    logFailureSpy.mockRestore();
    writeToFileSpy.mockRestore();
    jest.clearAllMocks();
  });

  describe("room:join 실패 시 서버 측 로깅", () => {
    it("ROOM_FULL 시 서버 측에서 직접 로깅한다", () => {
      // Given: 방이 가득 찬 상황
      mockRoomManager.joinRoom.mockReturnValue({
        success: false,
        reason: "ROOM_FULL",
        currentSize: 4,
        maxSize: 4,
      });

      // 핸들러 등록
      registerRoomHandlers(mockIo, mockSocket, mockRoomManager);

      // room:join 이벤트 핸들러 찾기
      const roomJoinHandler = mockSocket.on.mock.calls.find(
        ([event]) => event === "room:join"
      )?.[1];
      expect(roomJoinHandler).toBeDefined();

      // When: room:join 이벤트 발생
      roomJoinHandler({
        roomId: "test-room",
        nickname: "테스트유저",
      });

      // Then: logFailure 직접 호출됨 (M3: logFailure spy 사용)
      expect(logFailureSpy).toHaveBeenCalled();

      // 전달된 파라미터 검증
      const logParams = logFailureSpy.mock.calls[0][0];
      expect(logParams.socketId).toBe("test-socket-123");
      expect(logParams.roomId).toBe("test-room");
      expect(logParams.reason).toBe("ROOM_FULL");
      expect(logParams.serverContext.source).toBe("server-side");
    });

    it("serverContext에 방 정보가 포함된다", () => {
      // Given: 방이 가득 찬 상황
      mockRoomManager.joinRoom.mockReturnValue({
        success: false,
        reason: "ROOM_FULL",
        currentSize: 6,
        maxSize: 6,
      });

      registerRoomHandlers(mockIo, mockSocket, mockRoomManager);
      const roomJoinHandler = mockSocket.on.mock.calls.find(
        ([event]) => event === "room:join"
      )?.[1];

      // When: room:join 이벤트 발생
      roomJoinHandler({
        roomId: "full-room",
        nickname: "늦은참가자",
      });

      // Then: serverContext에 currentSize, maxSize 포함 (M3: logFailure spy 사용)
      const logParams = logFailureSpy.mock.calls[0][0];
      expect(logParams.serverContext.currentSize).toBe(6);
      expect(logParams.serverContext.maxSize).toBe(6);
    });
  });

  describe("room:join-failure-report 핸들러", () => {
    it("Zod 검증 실패 시 로깅하지 않는다", () => {
      // Given: 핸들러 등록
      registerRoomHandlers(mockIo, mockSocket, mockRoomManager);

      const failureReportHandler = mockSocket.on.mock.calls.find(
        ([event]) => event === "room:join-failure-report"
      )?.[1];
      expect(failureReportHandler).toBeDefined();

      // When: 잘못된 데이터로 이벤트 발생 (reason 누락)
      failureReportHandler({
        roomId: "test-room",
        // reason 누락 - Zod 검증 실패
      });

      // Then: logFailure 호출되지 않음 (M3: logFailure spy 사용)
      expect(logFailureSpy).not.toHaveBeenCalled();
    });

    it("유효한 보고 시 클라이언트 정보와 함께 로깅한다", () => {
      // Given: 방이 존재하는 상황
      mockRoomManager.getRoom.mockReturnValue({
        participants: new Map([
          ["socket-1", {}],
          ["socket-2", {}],
        ]),
        maxParticipants: 4,
      });

      registerRoomHandlers(mockIo, mockSocket, mockRoomManager);

      const failureReportHandler = mockSocket.on.mock.calls.find(
        ([event]) => event === "room:join-failure-report"
      )?.[1];

      // When: 유효한 실패 보고
      failureReportHandler({
        roomId: "client-report-room",
        reason: "NETWORK_TIMEOUT",
        errorMessage: "연결 시간 초과",
        clientInfo: {
          userAgent: "Mozilla/5.0",
          connectionType: "wifi",
          timestamp: 1703257200000,
        },
      });

      // Then: logFailure 호출됨 (M3: logFailure spy 사용)
      expect(logFailureSpy).toHaveBeenCalled();

      const logParams = logFailureSpy.mock.calls[0][0];
      expect(logParams.roomId).toBe("client-report-room");
      expect(logParams.reason).toBe("NETWORK_TIMEOUT");
      expect(logParams.clientInfo).toEqual({
        userAgent: "Mozilla/5.0",
        connectionType: "wifi",
        timestamp: 1703257200000,
      });
    });

    it("serverContext에 source: client-report가 포함된다", () => {
      // Given: 방이 존재
      mockRoomManager.getRoom.mockReturnValue({
        participants: new Map(),
        maxParticipants: 4,
      });

      registerRoomHandlers(mockIo, mockSocket, mockRoomManager);

      const failureReportHandler = mockSocket.on.mock.calls.find(
        ([event]) => event === "room:join-failure-report"
      )?.[1];

      // When: 클라이언트 실패 보고
      failureReportHandler({
        roomId: "source-test-room",
        reason: "CONNECTION_REFUSED",
      });

      // Then: source가 client-report (M3: logFailure spy 사용)
      const logParams = logFailureSpy.mock.calls[0][0];
      expect(logParams.serverContext.source).toBe("client-report");
    });

    it("방이 존재하지 않으면 serverContext에 방 정보가 없다", () => {
      // Given: 방이 존재하지 않음
      mockRoomManager.getRoom.mockReturnValue(null);

      registerRoomHandlers(mockIo, mockSocket, mockRoomManager);

      const failureReportHandler = mockSocket.on.mock.calls.find(
        ([event]) => event === "room:join-failure-report"
      )?.[1];

      // When: 실패 보고
      failureReportHandler({
        roomId: "non-existent-room",
        reason: "ROOM_NOT_FOUND",
      });

      // Then: serverContext에 currentSize, maxSize 없음 (M3: logFailure spy 사용)
      const logParams = logFailureSpy.mock.calls[0][0];
      expect(logParams.serverContext.source).toBe("client-report");
      expect(logParams.serverContext.currentSize).toBeUndefined();
      expect(logParams.serverContext.maxSize).toBeUndefined();
    });
  });
});
