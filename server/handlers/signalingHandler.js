/**
 * WebRTC 시그널링 이벤트 핸들러
 * signal:* 이벤트 처리 (P2P Mesh 방식)
 */
import {
  iceCandidateSchema,
  mediaReconnectedSchema,
  mediaReconnectingSchema,
  signalSchema,
} from "../schemas/socketSchemas.js";

/**
 * 시그널링 관련 이벤트 핸들러 등록
 * @param {Object} io - Socket.io 서버 인스턴스
 * @param {Object} socket - Socket.io 소켓 인스턴스
 * @param {Object} roomManager - RoomManager 인스턴스
 */
export const registerSignalingHandlers = (io, socket, roomManager) => {
  /**
   * signal:offer 이벤트 핸들러 (P2P Mesh - 1:1 전달)
   * WebRTC offer를 특정 Peer에게 중계
   */
  socket.on("signal:offer", (data) => {
    try {
      const { to, signal } = signalSchema.parse(data);

      const senderNickname = roomManager.getParticipantNickname(socket.id) || socket.id;
      const receiverNickname = roomManager.getParticipantNickname(to) || to;

      console.log(`[WebRTC] Offer 전달: [${senderNickname}] → [${receiverNickname}]`);

      io.to(to).emit("signal:offer", {
        from: socket.id,
        signal,
      });
    } catch (error) {
      console.error(`[signal:offer] 검증 실패:`, error);
      socket.emit("error", { message: "잘못된 시그널 데이터" });
    }
  });

  /**
   * signal:answer 이벤트 핸들러 (P2P Mesh - 1:1 전달)
   * WebRTC answer를 특정 Peer에게 중계
   */
  socket.on("signal:answer", (data) => {
    try {
      const { to, signal } = signalSchema.parse(data);

      const senderNickname = roomManager.getParticipantNickname(socket.id) || socket.id;
      const receiverNickname = roomManager.getParticipantNickname(to) || to;

      console.log(`[WebRTC] Answer 전달: [${senderNickname}] → [${receiverNickname}]`);

      io.to(to).emit("signal:answer", {
        from: socket.id,
        signal,
      });
    } catch (error) {
      console.error(`[signal:answer] 검증 실패:`, error);
      socket.emit("error", { message: "잘못된 시그널 데이터" });
    }
  });

  /**
   * signal:ice-candidate 이벤트 핸들러 (P2P Mesh - 1:1 전달)
   * ICE candidate를 특정 Peer에게 중계
   */
  socket.on("signal:ice-candidate", (data) => {
    try {
      const { to, candidate } = iceCandidateSchema.parse(data);

      const senderNickname = roomManager.getParticipantNickname(socket.id) || socket.id;
      const receiverNickname = roomManager.getParticipantNickname(to) || to;

      console.log(`[WebRTC] ICE Candidate 전달: [${senderNickname}] → [${receiverNickname}]`);

      io.to(to).emit("signal:ice-candidate", {
        from: socket.id,
        candidate,
      });
    } catch (error) {
      console.error(`[signal:ice-candidate] 검증 실패:`, error);
      socket.emit("error", { message: "잘못된 ICE candidate 데이터" });
    }
  });

  /**
   * media:reconnecting 이벤트 핸들러
   * 클라이언트가 디바이스 변경으로 미디어 재연결을 시작할 때 호출됨
   */
  socket.on("media:reconnecting", (data) => {
    const result = mediaReconnectingSchema.safeParse(data);

    if (!result.success) {
      socket.emit("error", {
        message: "유효하지 않은 재연결 데이터",
        details: result.error.errors,
      });
      return;
    }

    const { to, timestamp } = result.data;

    const senderNickname = roomManager.getParticipantNickname(socket.id) || socket.id;
    const receiverNickname = roomManager.getParticipantNickname(to) || to;

    console.log(
      `[media:reconnecting] [${senderNickname}] -> [${receiverNickname}] 재연결 시작, timestamp: ${timestamp}`
    );

    io.to(to).emit("media:reconnecting", {
      from: socket.id,
      timestamp,
    });

    console.log(`[media:reconnecting] 재연결 알림 전송 완료`);
  });

  /**
   * media:reconnected 이벤트 핸들러
   * 클라이언트가 미디어 재연결을 완료했을 때 호출됨
   */
  socket.on("media:reconnected", (data) => {
    const result = mediaReconnectedSchema.safeParse(data);

    if (!result.success) {
      socket.emit("error", {
        message: "유효하지 않은 재연결 완료 데이터",
        details: result.error.errors,
      });
      return;
    }

    const { to } = result.data;

    const senderNickname = roomManager.getParticipantNickname(socket.id) || socket.id;
    const receiverNickname = roomManager.getParticipantNickname(to) || to;

    console.log(`[media:reconnected] [${senderNickname}] -> [${receiverNickname}] 재연결 완료`);

    io.to(to).emit("media:reconnected", {
      from: socket.id,
    });

    console.log(`[media:reconnected] 재연결 완료 알림 전송 완료`);
  });
};
