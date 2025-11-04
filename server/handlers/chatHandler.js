/**
 * 채팅 이벤트 핸들러
 * 채팅 메시지 및 타이핑 상태를 방 내 다른 참가자에게 중계
 */
import { chatMessageSchema, chatTypingSchema } from "../schemas/socketSchemas.js";

/**
 * 채팅 이벤트 핸들러 등록
 * @param {Object} io - Socket.io 서버 인스턴스
 * @param {Object} socket - Socket.io 소켓 인스턴스
 * @param {Object} roomManager - RoomManager 인스턴스
 */
const registerChatHandlers = (io, socket, roomManager) => {
  // 파라미터 검증
  if (!io || !socket || !roomManager) {
    throw new Error("필수 파라미터가 누락되었습니다");
  }

  /**
   * chat:message 이벤트 핸들러
   * 채팅 메시지를 방의 다른 참가자들에게 중계
   */
  socket.on("chat:message", (data) => {
    // Zod로 파라미터 검증
    const result = chatMessageSchema.safeParse(data);

    if (!result.success) {
      console.error("[chat:message] 유효하지 않은 메시지 데이터:", result.error.errors);
      socket.emit("error", {
        message: "유효하지 않은 메시지 데이터",
        details: result.error.errors,
      });
      return;
    }

    const { roomId, message } = result.data;

    // 방 존재 여부 확인
    const room = roomManager.getRoom(roomId);
    if (!room) {
      console.error(`[chat:message] 존재하지 않는 방: ${roomId}`);
      socket.emit("error", {
        message: "존재하지 않는 방입니다",
      });
      return;
    }

    // 발신자가 방에 참가 중인지 확인
    const participants = roomManager.getRoomParticipants(roomId);
    if (!participants.includes(socket.id)) {
      console.error(`[chat:message] 소켓 ${socket.id}는 방 ${roomId}에 참가하지 않았습니다`);
      socket.emit("error", {
        message: "방에 참가하지 않았습니다",
      });
      return;
    }

    console.log(`[chat:message] 방 ${roomId}에서 메시지 수신 from ${socket.id}: "${message.content}"`);

    // 참가자 활동 시간 업데이트
    roomManager.updateParticipantActivity(socket.id);

    // 방의 다른 참가자들에게 메시지 중계
    socket.to(roomId).emit("chat:message", {
      from: socket.id,
      message,
    });

    console.log(`[chat:message] 방 ${roomId}의 다른 참가자들에게 메시지 중계 완료`);
  });

  /**
   * chat:typing 이벤트 핸들러 (선택적)
   * 타이핑 상태를 방의 다른 참가자들에게 중계
   */
  socket.on("chat:typing", (data) => {
    // Zod로 파라미터 검증
    const result = chatTypingSchema.safeParse(data);

    if (!result.success) {
      console.error("[chat:typing] 유효하지 않은 타이핑 데이터:", result.error.errors);
      socket.emit("error", {
        message: "유효하지 않은 타이핑 데이터",
        details: result.error.errors,
      });
      return;
    }

    const { roomId, isTyping } = result.data;

    // 방 존재 여부 확인
    const room = roomManager.getRoom(roomId);
    if (!room) {
      console.error(`[chat:typing] 존재하지 않는 방: ${roomId}`);
      return;
    }

    // 발신자가 방에 참가 중인지 확인
    const participants = roomManager.getRoomParticipants(roomId);
    if (!participants.includes(socket.id)) {
      console.error(`[chat:typing] 소켓 ${socket.id}는 방 ${roomId}에 참가하지 않았습니다`);
      return;
    }

    console.log(`[chat:typing] 방 ${roomId}에서 타이핑 상태 수신 from ${socket.id}: ${isTyping}`);

    // 참가자 활동 시간 업데이트
    roomManager.updateParticipantActivity(socket.id);

    // 방의 다른 참가자들에게 타이핑 상태 중계
    socket.to(roomId).emit("chat:typing", {
      from: socket.id,
      isTyping,
    });
  });
};

export default registerChatHandlers;
