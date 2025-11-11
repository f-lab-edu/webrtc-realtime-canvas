/**
 * 닉네임 관련 유틸리티 함수
 * 클라이언트 측 닉네임 검증 및 세션 스토리지 관리
 */

// 세션 스토리지 키
const NICKNAME_STORAGE_KEY = "webrtc-chat-nickname";

/**
 * 닉네임 검증 정규식
 * - 한글, 영문, 숫자, 언더스코어, 공백 허용
 */
const NICKNAME_REGEX = /^[가-힣a-zA-Z0-9_\s]+$/;

/**
 * 닉네임 최소/최대 길이
 */
const NICKNAME_MIN_LENGTH = 1;
const NICKNAME_MAX_LENGTH = 20;

/**
 * 닉네임 유효성 검증
 * @param {string} nickname - 검증할 닉네임
 * @returns {{ isValid: boolean, error: string | null }} 검증 결과
 */
export const validateNickname = (nickname) => {
  // 빈 문자열 체크
  if (!nickname || nickname.trim().length === 0) {
    return {
      isValid: false,
      error: "닉네임은 최소 1자 이상이어야 합니다",
    };
  }

  // 길이 체크
  if (nickname.length < NICKNAME_MIN_LENGTH) {
    return {
      isValid: false,
      error: "닉네임은 최소 1자 이상이어야 합니다",
    };
  }

  if (nickname.length > NICKNAME_MAX_LENGTH) {
    return {
      isValid: false,
      error: "닉네임은 20자를 초과할 수 없습니다",
    };
  }

  // 허용 문자 체크
  if (!NICKNAME_REGEX.test(nickname)) {
    return {
      isValid: false,
      error: "닉네임은 한글, 영문, 숫자, 언더스코어, 공백만 사용 가능합니다",
    };
  }

  return {
    isValid: true,
    error: null,
  };
};

/**
 * 세션 스토리지에서 닉네임 로드
 * @returns {string | null} 저장된 닉네임 또는 null
 */
export const loadNicknameFromSession = () => {
  try {
    if (typeof window === "undefined" || !window.sessionStorage) {
      return null;
    }

    const storedNickname = window.sessionStorage.getItem(NICKNAME_STORAGE_KEY);

    if (!storedNickname) {
      return null;
    }

    // 저장된 닉네임 검증
    const { isValid } = validateNickname(storedNickname);
    if (!isValid) {
      // 유효하지 않은 닉네임은 삭제
      window.sessionStorage.removeItem(NICKNAME_STORAGE_KEY);
      return null;
    }

    return storedNickname;
  } catch (error) {
    console.error("[닉네임] 세션 스토리지 로드 실패:", error);
    return null;
  }
};

/**
 * 세션 스토리지에 닉네임 저장
 * @param {string} nickname - 저장할 닉네임
 * @returns {boolean} 저장 성공 여부
 */
export const saveNicknameToSession = (nickname) => {
  try {
    if (typeof window === "undefined" || !window.sessionStorage) {
      console.warn("[닉네임] 세션 스토리지를 사용할 수 없습니다");
      return false;
    }

    // 닉네임 검증
    const { isValid, error } = validateNickname(nickname);
    if (!isValid) {
      console.error("[닉네임] 저장 실패:", error);
      return false;
    }

    window.sessionStorage.setItem(NICKNAME_STORAGE_KEY, nickname);
    return true;
  } catch (error) {
    console.error("[닉네임] 세션 스토리지 저장 실패:", error);
    return false;
  }
};

/**
 * 세션 스토리지에서 닉네임 삭제
 * @returns {boolean} 삭제 성공 여부
 */
export const clearNicknameFromSession = () => {
  try {
    if (typeof window === "undefined" || !window.sessionStorage) {
      return false;
    }

    window.sessionStorage.removeItem(NICKNAME_STORAGE_KEY);
    return true;
  } catch (error) {
    console.error("[닉네임] 세션 스토리지 삭제 실패:", error);
    return false;
  }
};

/**
 * 기본 닉네임 생성 (socketId 기반)
 * @param {string} socketId - 소켓 ID
 * @returns {string} 기본 닉네임
 */
export const generateDefaultNickname = (socketId) => {
  if (!socketId) {
    return "사용자";
  }

  // socketId의 앞 4자리 사용
  const shortId = socketId.slice(0, 4);
  return `사용자-${shortId}`;
};
