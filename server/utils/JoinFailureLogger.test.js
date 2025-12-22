/**
 * JoinFailureLogger 테스트
 * 방 입장 실패 로깅 기능 테스트
 */

import fs from "node:fs";
import { jest } from "@jest/globals";
import joinFailureLogger from "./JoinFailureLogger.js";

// console 메서드 mock
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

describe("JoinFailureLogger", () => {
  let writeToFileSpy;

  beforeEach(() => {
    // console mock 설정
    console.log = jest.fn();
    console.error = jest.fn();

    // writeToFile 메서드 spy (실제 파일 쓰기 방지)
    writeToFileSpy = jest.spyOn(joinFailureLogger, "writeToFile").mockResolvedValue(undefined);
  });

  afterEach(() => {
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
    writeToFileSpy.mockRestore();
  });

  describe("logFailure - 파라미터 검증", () => {
    it("빈 문자열 파라미터도 누락으로 처리한다", () => {
      // Given: 빈 문자열 파라미터
      const params = {
        socketId: "",
        roomId: "test-room",
        reason: "ROOM_FULL",
      };

      // When: logFailure 호출
      joinFailureLogger.logFailure(params);

      // Then: 에러 출력 및 파일 쓰기 없음
      expect(console.error).toHaveBeenCalledWith(
        "[JoinFailureLogger] 필수 파라미터 누락: socketId, roomId, reason"
      );
      expect(writeToFileSpy).not.toHaveBeenCalled();
    });

    it("socketId 누락 시 에러를 출력하고 로깅하지 않는다", () => {
      // Given: socketId가 없는 파라미터
      const params = {
        roomId: "test-room",
        reason: "ROOM_FULL",
      };

      // When: logFailure 호출
      joinFailureLogger.logFailure(params);

      // Then: 에러 출력 및 파일 쓰기 없음
      expect(console.error).toHaveBeenCalledWith(
        "[JoinFailureLogger] 필수 파라미터 누락: socketId, roomId, reason"
      );
      expect(writeToFileSpy).not.toHaveBeenCalled();
    });

    it("roomId 누락 시 에러를 출력하고 로깅하지 않는다", () => {
      // Given: roomId가 없는 파라미터
      const params = {
        socketId: "socket-123",
        reason: "ROOM_FULL",
      };

      // When: logFailure 호출
      joinFailureLogger.logFailure(params);

      // Then: 에러 출력 및 파일 쓰기 없음
      expect(console.error).toHaveBeenCalledWith(
        "[JoinFailureLogger] 필수 파라미터 누락: socketId, roomId, reason"
      );
      expect(writeToFileSpy).not.toHaveBeenCalled();
    });

    it("reason 누락 시 에러를 출력하고 로깅하지 않는다", () => {
      // Given: reason이 없는 파라미터
      const params = {
        socketId: "socket-123",
        roomId: "test-room",
      };

      // When: logFailure 호출
      joinFailureLogger.logFailure(params);

      // Then: 에러 출력 및 파일 쓰기 없음
      expect(console.error).toHaveBeenCalledWith(
        "[JoinFailureLogger] 필수 파라미터 누락: socketId, roomId, reason"
      );
      expect(writeToFileSpy).not.toHaveBeenCalled();
    });
  });

  describe("logFailure - 로그 엔트리 생성", () => {
    it("유효한 파라미터로 호출 시 로그 엔트리를 생성한다", () => {
      // Given: 유효한 파라미터
      const params = {
        socketId: "socket-123",
        roomId: "test-room",
        reason: "ROOM_FULL",
        errorMessage: "정원 초과",
        clientInfo: { userAgent: "Chrome", timestamp: 1703257200000 },
        serverContext: { currentSize: 4, maxSize: 4 },
      };

      // When: logFailure 호출
      joinFailureLogger.logFailure(params);

      // Then: 콘솔 로그 출력 및 writeToFile 호출
      expect(console.log).toHaveBeenCalledWith(
        "[JoinFailureLogger] 방 입장 실패: test-room (ROOM_FULL)"
      );
      expect(writeToFileSpy).toHaveBeenCalledTimes(1);

      // 작성된 로그 엔트리 검증
      const logEntry = writeToFileSpy.mock.calls[0][0];
      expect(logEntry.socketId).toBe("socket-123");
      expect(logEntry.roomId).toBe("test-room");
      expect(logEntry.reason).toBe("ROOM_FULL");
      expect(logEntry.errorMessage).toBe("정원 초과");
      expect(logEntry.clientInfo).toEqual({ userAgent: "Chrome", timestamp: 1703257200000 });
      expect(logEntry.serverContext).toEqual({ currentSize: 4, maxSize: 4 });
    });

    it("clientInfo가 없으면 null로 저장한다", () => {
      // Given: clientInfo 없는 파라미터
      const params = {
        socketId: "socket-123",
        roomId: "test-room",
        reason: "VALIDATION_ERROR",
      };

      // When: logFailure 호출
      joinFailureLogger.logFailure(params);

      // Then: clientInfo가 null
      const logEntry = writeToFileSpy.mock.calls[0][0];
      expect(logEntry.clientInfo).toBeNull();
    });

    it("serverContext가 없으면 null로 저장한다", () => {
      // Given: serverContext 없는 파라미터
      const params = {
        socketId: "socket-123",
        roomId: "test-room",
        reason: "NETWORK_TIMEOUT",
      };

      // When: logFailure 호출
      joinFailureLogger.logFailure(params);

      // Then: serverContext가 null
      const logEntry = writeToFileSpy.mock.calls[0][0];
      expect(logEntry.serverContext).toBeNull();
    });

    it("errorMessage가 없으면 기본 메시지를 사용한다", () => {
      // Given: errorMessage 없는 파라미터 (ROOM_FULL reason)
      const params = {
        socketId: "socket-123",
        roomId: "test-room",
        reason: "ROOM_FULL",
      };

      // When: logFailure 호출
      joinFailureLogger.logFailure(params);

      // Then: 기본 메시지 "정원 초과" 사용
      const logEntry = writeToFileSpy.mock.calls[0][0];
      expect(logEntry.errorMessage).toBe("정원 초과");
    });
  });

  describe("getKoreanTimestamp", () => {
    it("UTC+9 기준 ISO 형식 타임스탬프를 반환한다", () => {
      // Given: 현재 시간

      // When: getKoreanTimestamp 호출
      const timestamp = joinFailureLogger.getKoreanTimestamp();

      // Then: +09:00 타임존 포함, ISO 형식
      expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}\+09:00$/);
      expect(timestamp).toContain("+09:00");
    });
  });

  describe("getDateString", () => {
    it("KST 기준 YYYY-MM-DD 형식을 반환한다", () => {
      // Given: 현재 시간
      const now = new Date();
      const koreanTime = new Date(now.getTime() + 9 * 60 * 60 * 1000);
      const expectedYear = koreanTime.getUTCFullYear();
      const expectedMonth = String(koreanTime.getUTCMonth() + 1).padStart(2, "0");
      const expectedDay = String(koreanTime.getUTCDate()).padStart(2, "0");
      const expectedDateString = `${expectedYear}-${expectedMonth}-${expectedDay}`;

      // When: getDateString 호출
      const dateString = joinFailureLogger.getDateString();

      // Then: YYYY-MM-DD 형식
      expect(dateString).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(dateString).toBe(expectedDateString);
    });
  });

  // H3: getLogFilePath 테스트 추가
  describe("getLogFilePath", () => {
    it("올바른 로그 파일 경로 형식을 반환한다", () => {
      // Given: JoinFailureLogger 인스턴스

      // When: getLogFilePath 호출
      const filePath = joinFailureLogger.getLogFilePath();

      // Then: 경로에 join-failures 포함, 날짜 형식 파일명
      expect(filePath).toContain("join-failures");
      expect(filePath).toMatch(/join-failures-\d{4}-\d{2}-\d{2}\.log$/);
    });
  });

  // H2: ensureLogDirectory 테스트 추가
  describe("ensureLogDirectory", () => {
    it("로그 디렉토리 경로가 올바르게 설정되어 있다", () => {
      // Given: JoinFailureLogger 인스턴스

      // When/Then: logDir 경로 검증
      expect(joinFailureLogger.logDir).toContain("logs");
      expect(joinFailureLogger.logDir).toContain("join-failures");
    });
  });

  // M2: 잘못된 reason 값 테스트 추가
  describe("logFailure - reason 유효성", () => {
    it("잘못된 reason 값 사용 시 '알 수 없는 오류' 메시지를 사용한다", () => {
      // Given: 유효하지 않은 reason
      const params = {
        socketId: "socket-123",
        roomId: "test-room",
        reason: "INVALID_REASON",
      };

      // When: logFailure 호출
      joinFailureLogger.logFailure(params);

      // Then: 기본 메시지 '알 수 없는 오류' 사용
      const logEntry = writeToFileSpy.mock.calls[0][0];
      expect(logEntry.errorMessage).toBe("알 수 없는 오류");
    });
  });
});

describe("JoinFailureLogger - writeToFile 통합 테스트", () => {
  beforeEach(() => {
    console.log = jest.fn();
    console.error = jest.fn();
  });

  afterEach(() => {
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
  });

  it("writeToFile이 호출되면 JSON 형식 로그를 전달받는다", () => {
    // Given: writeToFile spy (실제 파일 쓰기 방지, 인자만 캡처)
    const writeToFileSpy = jest
      .spyOn(joinFailureLogger, "writeToFile")
      .mockResolvedValue(undefined);

    const params = {
      socketId: "socket-456",
      roomId: "integration-room",
      reason: "SERVER_ERROR",
      errorMessage: "서버 내부 오류",
    };

    // When: logFailure 호출
    joinFailureLogger.logFailure(params);

    // Then: writeToFile에 전달된 로그 엔트리 검증
    expect(writeToFileSpy).toHaveBeenCalledTimes(1);
    const logEntry = writeToFileSpy.mock.calls[0][0];

    expect(logEntry).toHaveProperty("timestamp");
    expect(logEntry).toHaveProperty("socketId", "socket-456");
    expect(logEntry).toHaveProperty("roomId", "integration-room");
    expect(logEntry).toHaveProperty("reason", "SERVER_ERROR");
    expect(logEntry).toHaveProperty("errorMessage", "서버 내부 오류");

    writeToFileSpy.mockRestore();
  });

  // H1: writeToFile 에러 핸들링 테스트 추가
  it("writeToFile에서 파일 쓰기 실패 시 에러를 콘솔에 출력한다", async () => {
    // Given: fs.promises.appendFile가 에러를 던지도록 mock
    const mockError = new Error("파일 쓰기 실패");
    const appendFileSpy = jest.spyOn(fs.promises, "appendFile").mockRejectedValueOnce(mockError);

    // When: writeToFile 직접 호출
    await joinFailureLogger.writeToFile({ test: "entry" });

    // Then: console.error 호출됨
    expect(console.error).toHaveBeenCalledWith(
      "[JoinFailureLogger] 로그 파일 쓰기 실패:",
      mockError
    );

    appendFileSpy.mockRestore();
  });
});
