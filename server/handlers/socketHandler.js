/**
 * Socket 이벤트 핸들러 라우터
 * 각 도메인별 핸들러 모듈을 등록하는 역할만 수행
 */
import { registerRoomHandlers } from "./roomHandler.js";
import { registerScreenShareHandlers } from "./screenShareHandler.js";
import { registerSignalingHandlers } from "./signalingHandler.js";
import { registerWhiteboardHandlers } from "./whiteboardHandler.js";

/**
 * Socket 이벤트 핸들러 등록
 * @param {Object} io - Socket.io 서버 인스턴스
 * @param {Object} socket - Socket.io 소켓 인스턴스
 * @param {Object} roomManager - RoomManager 인스턴스
 */
const registerSocketHandlers = (io, socket, roomManager) => {
  // 파라미터 검증
  if (!io || !socket || !roomManager) {
    throw new Error("필수 파라미터가 누락되었습니다");
  }

  // 각 도메인별 핸들러 등록
  registerRoomHandlers(io, socket, roomManager);
  registerSignalingHandlers(io, socket, roomManager);
  registerScreenShareHandlers(io, socket, roomManager);
  registerWhiteboardHandlers(io, socket, roomManager);
};

export default registerSocketHandlers;
