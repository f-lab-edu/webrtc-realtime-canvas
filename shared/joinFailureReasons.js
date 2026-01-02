/**
 * 방 입장 실패 원인 분류
 * 서버와 클라이언트에서 공유하는 상수
 * 단일 소스: 새 원인 추가 시 여기만 수정
 */
export const JOIN_FAILURE_REASONS = {
  ROOM_FULL: "정원 초과",
  VALIDATION_ERROR: "입력 검증 실패",
  ROOM_NOT_FOUND: "방 미존재",
  NICKNAME_DUPLICATE: "닉네임 중복",
  SERVER_ERROR: "서버 내부 오류",
  NETWORK_TIMEOUT: "네트워크 타임아웃",
  CONNECTION_REFUSED: "연결 거부",
};

/**
 * 실패 원인 키 배열 (Zod enum용)
 * @type {Array<string>}
 */
export const JOIN_FAILURE_REASON_KEYS = Object.keys(JOIN_FAILURE_REASONS);
