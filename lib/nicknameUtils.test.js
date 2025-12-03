/**
 * 닉네임 유틸리티 함수 테스트
 * 닉네임 설정 플로우 통합 테스트
 */

// Jest globals는 injectGlobals: true로 자동 주입됨
import {
  clearNicknameFromSession,
  generateDefaultNickname,
  loadNicknameFromSession,
  saveNicknameToSession,
  validateNickname,
} from "./nicknameUtils.js";

describe("닉네임 유틸리티", () => {
  // 세션 스토리지 모킹
  let sessionStorageMock;

  beforeEach(() => {
    // 세션 스토리지 초기화
    sessionStorageMock = {};

    // window.sessionStorage 모킹
    global.window = {
      sessionStorage: {
        getItem: (key) => sessionStorageMock[key] || null,
        setItem: (key, value) => {
          sessionStorageMock[key] = value;
        },
        removeItem: (key) => {
          delete sessionStorageMock[key];
        },
        clear: () => {
          sessionStorageMock = {};
        },
      },
    };
  });

  describe("닉네임 검증", () => {
    it("유효한 닉네임을 검증한다", () => {
      // Given: 유효한 닉네임들
      const validNicknames = [
        "홍길동",
        "John",
        "사용자123",
        "User_Name",
        "닉네임 테스트",
        "a",
        "12345678901234567890", // 20자
      ];

      // When & Then: 모든 닉네임이 유효함
      validNicknames.forEach((nickname) => {
        const result = validateNickname(nickname);
        expect(result.isValid).toBe(true);
        expect(result.error).toBeNull();
      });
    });

    it("빈 문자열은 유효하지 않다", () => {
      // Given: 빈 문자열
      const nickname = "";

      // When: 검증
      const result = validateNickname(nickname);

      // Then: 유효하지 않음
      expect(result.isValid).toBe(false);
      expect(result.error).toBe("닉네임은 최소 1자 이상이어야 합니다");
    });

    it("공백만 있는 문자열은 유효하지 않다", () => {
      // Given: 공백만 있는 문자열
      const nickname = "   ";

      // When: 검증
      const result = validateNickname(nickname);

      // Then: 유효하지 않음
      expect(result.isValid).toBe(false);
      expect(result.error).toBe("닉네임은 최소 1자 이상이어야 합니다");
    });

    it("20자를 초과하는 닉네임은 유효하지 않다", () => {
      // Given: 21자 닉네임
      const nickname = "123456789012345678901";

      // When: 검증
      const result = validateNickname(nickname);

      // Then: 유효하지 않음
      expect(result.isValid).toBe(false);
      expect(result.error).toBe("닉네임은 20자를 초과할 수 없습니다");
    });

    it("허용되지 않는 특수문자가 포함된 닉네임은 유효하지 않다", () => {
      // Given: 특수문자가 포함된 닉네임들
      const invalidNicknames = [
        "홍길동!",
        "User@Name",
        "닉네임#123",
        "test$user",
        "name%test",
        "user&name",
        "test*name",
        "name(test)",
        "user[name]",
        "test{name}",
        "name|test",
        "user\\name",
        "test/name",
        "name:test",
        "user;name",
        "test'name",
        'name"test',
        "user<name>",
        "test,name",
        "name.test",
        "user?name",
      ];

      // When & Then: 모든 닉네임이 유효하지 않음
      invalidNicknames.forEach((nickname) => {
        const result = validateNickname(nickname);
        expect(result.isValid).toBe(false);
        expect(result.error).toBe("닉네임은 한글, 영문, 숫자, 언더스코어, 공백만 사용 가능합니다");
      });
    });
  });

  describe("세션 스토리지 관리", () => {
    it("닉네임을 세션 스토리지에 저장할 수 있다", () => {
      // Given: 유효한 닉네임
      const nickname = "홍길동";

      // When: 세션 스토리지에 저장
      const result = saveNicknameToSession(nickname);

      // Then: 저장 성공
      expect(result).toBe(true);
      expect(sessionStorageMock["webrtc-chat-nickname"]).toBe(nickname);
    });

    it("저장된 닉네임을 세션 스토리지에서 로드할 수 있다", () => {
      // Given: 세션 스토리지에 저장된 닉네임
      const nickname = "홍길동";
      sessionStorageMock["webrtc-chat-nickname"] = nickname;

      // When: 세션 스토리지에서 로드
      const result = loadNicknameFromSession();

      // Then: 로드 성공
      expect(result).toBe(nickname);
    });

    it("저장된 닉네임이 없으면 null을 반환한다", () => {
      // Given: 빈 세션 스토리지

      // When: 세션 스토리지에서 로드
      const result = loadNicknameFromSession();

      // Then: null 반환
      expect(result).toBeNull();
    });

    it("유효하지 않은 닉네임은 저장하지 않는다", () => {
      // Given: 유효하지 않은 닉네임
      const nickname = "invalid@nickname";

      // When: 세션 스토리지에 저장 시도
      const result = saveNicknameToSession(nickname);

      // Then: 저장 실패
      expect(result).toBe(false);
      expect(sessionStorageMock["webrtc-chat-nickname"]).toBeUndefined();
    });

    it("저장된 닉네임이 유효하지 않으면 삭제하고 null을 반환한다", () => {
      // Given: 유효하지 않은 닉네임이 저장됨
      sessionStorageMock["webrtc-chat-nickname"] = "invalid@nickname";

      // When: 세션 스토리지에서 로드
      const result = loadNicknameFromSession();

      // Then: null 반환 및 삭제됨
      expect(result).toBeNull();
      expect(sessionStorageMock["webrtc-chat-nickname"]).toBeUndefined();
    });

    it("닉네임을 세션 스토리지에서 삭제할 수 있다", () => {
      // Given: 세션 스토리지에 저장된 닉네임
      sessionStorageMock["webrtc-chat-nickname"] = "홍길동";

      // When: 세션 스토리지에서 삭제
      const result = clearNicknameFromSession();

      // Then: 삭제 성공
      expect(result).toBe(true);
      expect(sessionStorageMock["webrtc-chat-nickname"]).toBeUndefined();
    });
  });

  describe("닉네임 설정 플로우 통합 테스트", () => {
    it("첫 방 입장 시 닉네임 입력 플로우", () => {
      // Given: 세션 스토리지에 저장된 닉네임 없음
      expect(loadNicknameFromSession()).toBeNull();

      // When: 사용자가 닉네임 입력
      const nickname = "홍길동";
      const { isValid } = validateNickname(nickname);
      expect(isValid).toBe(true);

      // When: 닉네임 저장
      const saved = saveNicknameToSession(nickname);

      // Then: 저장 성공 및 세션 스토리지에 저장됨
      expect(saved).toBe(true);
      expect(loadNicknameFromSession()).toBe(nickname);
    });

    it("두 번째 방 입장 시 기본 닉네임 자동 채우기", () => {
      // Given: 세션 스토리지에 저장된 닉네임
      const savedNickname = "홍길동";
      saveNicknameToSession(savedNickname);

      // When: 두 번째 방 입장 시 닉네임 로드
      const loadedNickname = loadNicknameFromSession();

      // Then: 저장된 닉네임이 로드됨
      expect(loadedNickname).toBe(savedNickname);
    });

    it("닉네임 수정 후 세션 스토리지 업데이트", () => {
      // Given: 세션 스토리지에 저장된 닉네임
      const originalNickname = "홍길동";
      saveNicknameToSession(originalNickname);
      expect(loadNicknameFromSession()).toBe(originalNickname);

      // When: 닉네임 수정
      const updatedNickname = "김철수";
      const { isValid } = validateNickname(updatedNickname);
      expect(isValid).toBe(true);

      const saved = saveNicknameToSession(updatedNickname);

      // Then: 업데이트된 닉네임이 저장됨
      expect(saved).toBe(true);
      expect(loadNicknameFromSession()).toBe(updatedNickname);
    });

    it("여러 방 입장 시 닉네임 유지", () => {
      // Given: 첫 번째 방에서 닉네임 설정
      const nickname = "홍길동";
      saveNicknameToSession(nickname);

      // When: 두 번째 방 입장
      const loadedNickname1 = loadNicknameFromSession();
      expect(loadedNickname1).toBe(nickname);

      // When: 세 번째 방 입장
      const loadedNickname2 = loadNicknameFromSession();
      expect(loadedNickname2).toBe(nickname);

      // Then: 모든 방에서 같은 닉네임 사용
      expect(loadedNickname1).toBe(loadedNickname2);
    });

    it("방별로 다른 닉네임 사용 가능 (마지막 닉네임이 기본값)", () => {
      // Given: 첫 번째 방에서 닉네임 설정
      const nickname1 = "홍길동";
      saveNicknameToSession(nickname1);
      expect(loadNicknameFromSession()).toBe(nickname1);

      // When: 두 번째 방에서 닉네임 변경
      const nickname2 = "김철수";
      saveNicknameToSession(nickname2);

      // Then: 마지막 닉네임이 기본값으로 저장됨
      expect(loadNicknameFromSession()).toBe(nickname2);

      // When: 세 번째 방 입장
      const loadedNickname = loadNicknameFromSession();

      // Then: 마지막 닉네임이 로드됨
      expect(loadedNickname).toBe(nickname2);
    });
  });

  describe("기본 닉네임 생성", () => {
    it("socketId 기반 기본 닉네임을 생성한다", () => {
      // Given: socketId
      const socketId = "abc123def456";

      // When: 기본 닉네임 생성
      const nickname = generateDefaultNickname(socketId);

      // Then: "사용자-{앞 4자리}" 형식
      expect(nickname).toBe("사용자-abc1");
    });

    it("socketId가 없으면 '사용자'를 반환한다", () => {
      // Given: socketId 없음

      // When: 기본 닉네임 생성
      const nickname = generateDefaultNickname(null);

      // Then: "사용자" 반환
      expect(nickname).toBe("사용자");
    });

    it("짧은 socketId도 처리한다", () => {
      // Given: 짧은 socketId
      const socketId = "abc";

      // When: 기본 닉네임 생성
      const nickname = generateDefaultNickname(socketId);

      // Then: 사용 가능한 만큼만 사용
      expect(nickname).toBe("사용자-abc");
    });
  });
});
