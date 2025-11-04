/**
 * 채팅 이벤트 핸들러
 * 채팅 메시지를 방 내 다른 참가자에게 중계
 */
import { chatMessageSchema } from "../schemas/socketSchemas.js";
import serverLogger from "../utils/logger.js";

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
    serverLogger.info("CHAT", `이벤트 수신 from ${socket.id}`, data);
    console.log(`[chat:message] 이벤트 수신 from ${socket.id}:`, JSON.stringify(data, null, 2));

    // Zod로 파라미터 검증
    const result = chatMessageSchema.safeParse(data);

    if (!result.success) {
      serverLogger.error("CHAT", "유효하지 않은 메시지 데이터", {
        socketId: socket.id,
        errors: result.error.errors,
        receivedData: data,
      });
      console.error("[chat:message] 유효하지 않은 메시지 데이터:", result.error.errors);
      console.error("[chat:message] 수신된 데이터:", JSON.stringify(data, null, 2));
      socket.emit("chat:error", {
        message: "유효하지 않은 메시지 데이터",
        details: result.error.errors,
      });
      return;
    }

    const { roomId, message } = result.data;

    serverLogger.debug("CHAT", "검증 완료", { roomId, messageId: message.id, socketId: socket.id });
    console.log(`[chat:message] 검증 완료 - roomId: ${roomId}, messageId: ${message.id}`);

    // 방 존재 여부 확인
    const room = roomManager.getRoom(roomId);
    if (!room) {
      serverLogger.error("CHAT", "존재하지 않는 방", {
        roomId,
        socketId: socket.id,
        existingRooms: roomManager.getAllRooms(),
      });
      console.error(`[chat:message] 존재하지 않는 방: ${roomId}`);
      console.error(`[chat:message] 현재 존재하는 방 목록:`, roomManager.getAllRooms());
      socket.emit("chat:error", {
        message: "존재하지 않는 방입니다",
        roomId,
      });
      return;
    }

    // 발신자가 방에 참가 중인지 확인
    const participants = roomManager.getRoomParticipants(roomId);
    serverLogger.debug("CHAT", "참가자 확인", { roomId, participants, socketId: socket.id });
    console.log(`[chat:message] 방 ${roomId}의 참가자 목록:`, participants);

    if (!participants.includes(socket.id)) {
      serverLogger.error("CHAT", "방에 참가하지 않은 소켓", {
        roomId,
        socketId: socket.id,
        participants,
      });
      console.error(`[chat:message] 소켓 ${socket.id}는 방 ${roomId}에 참가하지 않았습니다`);
      socket.emit("chat:error", {
        message: "방에 참가하지 않았습니다",
        roomId,
      });
      return;
    }

    serverLogger.info("CHAT", `메시지 수신 from ${socket.id}`, {
      roomId,
      messageId: message.id,
      content: message.content,
    });
    console.log(
      `[chat:message] 방 ${roomId}에서 메시지 수신 from ${socket.id}: "${message.content}"`
    );

    // 참가자 활동 시간 업데이트
    try {
      roomManager.updateParticipantActivity(socket.id);
    } catch (error) {
      serverLogger.error("CHAT", "활동 시간 업데이트 실패", {
        socketId: socket.id,
        error: error.message,
      });
      console.error(`[chat:message] 활동 시간 업데이트 실패:`, error);
    }

    // 방의 다른 참가자들에게 메시지 중계
    const relayData = {
      from: socket.id,
      message,
    };

    // Socket.io room 참가 확인
    const socketsInRoom = Array.from(io.sockets.adapter.rooms.get(roomId) || []);
    serverLogger.debug("CHAT", "Socket.io room 참가자 확인", {
      roomId,
      socketsInRoom,
      participantsCount: socketsInRoom.length,
    });
    console.log(`[chat:message] Socket.io room ${roomId} 참가자:`, socketsInRoom);

    serverLogger.info("CHAT", "메시지 중계", { roomId, relayData, socketsInRoom });
    console.log(
      `[chat:message] 방 ${roomId}의 다른 참가자들에게 메시지 중계:`,
      JSON.stringify(relayData, null, 2)
    );
    socket.to(roomId).emit("chat:message", relayData);

    serverLogger.info("CHAT", "메시지 중계 완료", { roomId, messageId: message.id });
    console.log(`[chat:message] 방 ${roomId}의 다른 참가자들에게 메시지 중계 완료`);
  });
};

export default registerChatHandlers;
