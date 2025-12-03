/**
 * 화이트보드 이벤트 핸들러
 * whiteboard:* 이벤트 처리 (호스트 전용)
 */
import { whiteboardEventSchema } from "../schemas/socketSchemas.js";

/**
 * 화이트보드 관련 이벤트 핸들러 등록
 * @param {Object} io - Socket.io 서버 인스턴스
 * @param {Object} socket - Socket.io 소켓 인스턴스
 * @param {Object} roomManager - RoomManager 인스턴스
 */
export const registerWhiteboardHandlers = (io, socket, roomManager) => {
  /**
   * whiteboard:event 이벤트 핸들러 (호스트 전용)
   * 화이트보드 그리기 이벤트를 방의 다른 참가자들에게 중계
   *
   * ⚠️ 권한 제어: 호스트만 화이트보드 제어 가능
   */
  socket.on("whiteboard:event", (data) => {
    try {
      const { roomId, event } = whiteboardEventSchema.parse(data);

      const room = roomManager.getRoom(roomId);

      if (!room) {
        socket.emit("error", { message: "방을 찾을 수 없습니다" });
        return;
      }

      // 호스트만 화이트보드 제어 가능
      if (room.hostSocketId !== socket.id) {
        socket.emit("whiteboard:denied", {
          reason: "호스트만 화이트보드를 제어할 수 있습니다",
        });
        console.warn(
          `[whiteboard:event] 화이트보드 권한 없음: ${socket.id} (호스트: ${room.hostSocketId})`
        );
        return;
      }

      const senderNickname = roomManager.getParticipantNickname(socket.id) || socket.id;

      console.log(
        `[whiteboard:event] [${senderNickname}] 방 ${roomId}에서 이벤트 발생: ${event.type}`
      );

      // 자신을 제외한 방의 모든 참가자에게 브로드캐스트
      socket.to(roomId).emit("whiteboard:event", {
        roomId,
        from: socket.id,
        event,
      });

      console.log(`[whiteboard:event] 방 ${roomId}의 다른 참가자들에게 이벤트 브로드캐스트 완료`);
    } catch (error) {
      console.error(`[whiteboard:event] 검증 실패:`, error);
      socket.emit("error", { message: "잘못된 화이트보드 이벤트 데이터" });
    }
  });
};
