/**
 * Socket 스키마 테스트
 * 방 입장 실패 관련 Zod 스키마 검증 테스트
 */
import {
  joinFailureReasonSchema,
  joinFailureReportSchema,
  clientInfoSchema,
} from "./socketSchemas.js";

describe("joinFailureReasonSchema", () => {
  it("모든 7개 reason 값을 허용한다", () => {
    // Given: 유효한 7개 reason 값
    const validReasons = [
      "ROOM_FULL",
      "VALIDATION_ERROR",
      "ROOM_NOT_FOUND",
      "NICKNAME_DUPLICATE",
      "SERVER_ERROR",
      "NETWORK_TIMEOUT",
      "CONNECTION_REFUSED",
    ];

    // When/Then: 모든 값이 통과
    for (const reason of validReasons) {
      const result = joinFailureReasonSchema.safeParse(reason);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(reason);
      }
    }
  });

  it("알 수 없는 reason 값은 거부한다", () => {
    // Given: 유효하지 않은 reason 값
    const invalidReasons = ["UNKNOWN_ERROR", "invalid", "", null, undefined, 123];

    // When/Then: 모든 값이 실패
    for (const reason of invalidReasons) {
      const result = joinFailureReasonSchema.safeParse(reason);
      expect(result.success).toBe(false);
    }
  });
});

describe("clientInfoSchema", () => {
  it("유효한 clientInfo를 허용한다", () => {
    // Given: 유효한 clientInfo
    const clientInfo = {
      userAgent: "Mozilla/5.0",
      connectionType: "wifi",
      timestamp: 1703257200000,
    };

    // When: 스키마 검증
    const result = clientInfoSchema.safeParse(clientInfo);

    // Then: 통과
    expect(result.success).toBe(true);
  });

  it("clientInfo는 선택적(optional)이다", () => {
    // Given: undefined
    // When: 스키마 검증
    const result = clientInfoSchema.safeParse(undefined);

    // Then: 통과 (optional이므로)
    expect(result.success).toBe(true);
  });

  it("userAgent와 connectionType은 nullable이다", () => {
    // Given: null 값을 가진 clientInfo
    const clientInfo = {
      userAgent: null,
      connectionType: null,
      timestamp: 1703257200000,
    };

    // When: 스키마 검증
    const result = clientInfoSchema.safeParse(clientInfo);

    // Then: 통과
    expect(result.success).toBe(true);
  });

  // M4: timestamp 경계값 테스트 추가
  it("timestamp가 음수이면 거부한다", () => {
    // Given: 음수 timestamp
    const invalidClientInfo = {
      userAgent: "Chrome",
      timestamp: -1,
    };

    // When: 스키마 검증
    const result = clientInfoSchema.safeParse(invalidClientInfo);

    // Then: 실패 (positive() 검증)
    expect(result.success).toBe(false);
  });

  it("timestamp가 0이면 거부한다", () => {
    // Given: 0인 timestamp
    const invalidClientInfo = {
      userAgent: "Chrome",
      timestamp: 0,
    };

    // When: 스키마 검증
    const result = clientInfoSchema.safeParse(invalidClientInfo);

    // Then: 실패 (positive()는 0보다 커야 함)
    expect(result.success).toBe(false);
  });

  it("timestamp가 양수이면 허용한다", () => {
    // Given: 양수 timestamp
    const validClientInfo = {
      userAgent: "Chrome",
      timestamp: 1,
    };

    // When: 스키마 검증
    const result = clientInfoSchema.safeParse(validClientInfo);

    // Then: 통과
    expect(result.success).toBe(true);
  });
});

describe("joinFailureReportSchema", () => {
  it("유효한 데이터를 통과시킨다", () => {
    // Given: 완전한 유효 데이터
    const validReport = {
      roomId: "test-room-123",
      reason: "ROOM_FULL",
      errorMessage: "정원이 초과되었습니다",
      clientInfo: {
        userAgent: "Chrome/120.0",
        connectionType: "4g",
        timestamp: 1703257200000,
      },
    };

    // When: 스키마 검증
    const result = joinFailureReportSchema.safeParse(validReport);

    // Then: 통과
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.roomId).toBe("test-room-123");
      expect(result.data.reason).toBe("ROOM_FULL");
    }
  });

  it("roomId 누락 시 실패한다", () => {
    // Given: roomId 없는 데이터
    const invalidReport = {
      reason: "ROOM_FULL",
    };

    // When: 스키마 검증
    const result = joinFailureReportSchema.safeParse(invalidReport);

    // Then: 실패
    expect(result.success).toBe(false);
    if (!result.success) {
      const issues = result.error.issues;
      expect(issues.some((e) => e.path.includes("roomId"))).toBe(true);
    }
  });

  it("유효하지 않은 reason 값은 거부한다", () => {
    // Given: 잘못된 reason
    const invalidReport = {
      roomId: "test-room",
      reason: "INVALID_REASON",
    };

    // When: 스키마 검증
    const result = joinFailureReportSchema.safeParse(invalidReport);

    // Then: 실패
    expect(result.success).toBe(false);
    if (!result.success) {
      const issues = result.error.issues;
      expect(issues.some((e) => e.path.includes("reason"))).toBe(true);
    }
  });

  it("clientInfo는 선택적이다", () => {
    // Given: clientInfo 없는 유효 데이터
    const validReport = {
      roomId: "test-room",
      reason: "SERVER_ERROR",
    };

    // When: 스키마 검증
    const result = joinFailureReportSchema.safeParse(validReport);

    // Then: 통과
    expect(result.success).toBe(true);
  });

  it("errorMessage는 500자 제한이다", () => {
    // Given: 500자 초과 메시지
    const longMessage = "a".repeat(501);
    const invalidReport = {
      roomId: "test-room",
      reason: "VALIDATION_ERROR",
      errorMessage: longMessage,
    };

    // When: 스키마 검증
    const result = joinFailureReportSchema.safeParse(invalidReport);

    // Then: 실패
    expect(result.success).toBe(false);

    // Given: 정확히 500자 메시지
    const validMessage = "b".repeat(500);
    const validReport = {
      roomId: "test-room",
      reason: "VALIDATION_ERROR",
      errorMessage: validMessage,
    };

    // When: 스키마 검증
    const validResult = joinFailureReportSchema.safeParse(validReport);

    // Then: 통과
    expect(validResult.success).toBe(true);
  });

  it("serverResponse는 any 타입으로 모든 값을 허용한다", () => {
    // Given: 다양한 serverResponse 값
    const reports = [
      { roomId: "room-1", reason: "ROOM_FULL", serverResponse: { currentSize: 4, maxSize: 4 } },
      { roomId: "room-2", reason: "SERVER_ERROR", serverResponse: "에러 메시지" },
      { roomId: "room-3", reason: "NETWORK_TIMEOUT", serverResponse: 123 },
      { roomId: "room-4", reason: "CONNECTION_REFUSED", serverResponse: null },
    ];

    // When/Then: 모든 데이터 통과
    for (const report of reports) {
      const result = joinFailureReportSchema.safeParse(report);
      expect(result.success).toBe(true);
    }
  });
});
