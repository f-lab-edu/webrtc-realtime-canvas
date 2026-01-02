/**
 * 화면 공유 이벤트 핸들러
 * screen-share:* 이벤트 처리
 */
import { screenSharePermissionSchema } from "../schemas/socketSchemas.js";

/**
 * 화면 공유 관련 이벤트 핸들러 등록
 * @param {Object} io - Socket.io 서버 인스턴스
 * @param {Object} socket - Socket.io 소켓 인스턴스
 * @param {Object} roomManager - RoomManager 인스턴스
 */
export const registerScreenShareHandlers = (io, socket, roomManager) => {
  /**
   * screen-share:request 이벤트 핸들러
   * 화면 공유 권한 확인
   */
  socket.on("screen-share:request", () => {
    const roomId = roomManager.getRoomIdBySocketId(socket.id);

    if (!roomId) {
      socket.emit("screen-share:denied", { reason: "NOT_IN_ROOM" });
      return;
    }

    const hasPermission = roomManager.hasScreenSharePermission(roomId, socket.id);

    if (!hasPermission) {
      console.warn(`[screen-share:request] 화면 공유 권한 없음: ${socket.id}`);
      socket.emit("screen-share:denied", { reason: "NO_PERMISSION" });
      return;
    }

    console.log(`[screen-share:request] 화면 공유 승인: ${socket.id}`);
    socket.emit("screen-share:approved");
  });

  /**
   * screen-share:started 이벤트 핸들러
   * 화면 공유 시작 알림
   */
  socket.on("screen-share:started", () => {
    const roomId = roomManager.getRoomIdBySocketId(socket.id);

    if (roomId) {
      console.log(`[screen-share:started] 화면 공유 시작: ${socket.id}`);

      io.to(roomId).emit("screen-share:started", {
        socketId: socket.id,
        nickname: roomManager.getParticipantNickname(socket.id),
      });
    }
  });

  /**
   * screen-share:stopped 이벤트 핸들러
   * 화면 공유 중지 알림
   */
  socket.on("screen-share:stopped", () => {
    const roomId = roomManager.getRoomIdBySocketId(socket.id);

    if (roomId) {
      console.log(`[screen-share:stopped] 화면 공유 중지: ${socket.id}`);

      io.to(roomId).emit("screen-share:stopped", {
        socketId: socket.id,
      });
    }
  });

  /**
   * screen-share:grant 이벤트 핸들러
   * 화면 공유 권한 부여 (호스트 전용)
   */
  socket.on("screen-share:grant", (data) => {
    try {
      const { targetSocketId } = screenSharePermissionSchema.parse(data);

      const roomId = roomManager.getRoomIdBySocketId(socket.id);

      if (!roomId) {
        socket.emit("error", { message: "방을 찾을 수 없습니다" });
        return;
      }

      const hostSocketId = roomManager.getHost(roomId);
      if (socket.id !== hostSocketId) {
        console.warn(`[screen-share:grant] 호스트가 아닌 사용자의 권한 부여 시도: ${socket.id}`);
        socket.emit("error", { message: "호스트만 권한을 부여할 수 있습니다" });
        return;
      }

      const result = roomManager.grantScreenSharePermission(roomId, targetSocketId);

      if (result.success) {
        console.log(`[screen-share:grant] 화면 공유 권한 부여: ${targetSocketId}`);

        io.to(targetSocketId).emit("screen-share:permission-granted");

        io.to(roomId).emit("screen-share:permission-updated", {
          targetSocketId,
          granted: true,
          nickname: roomManager.getParticipantNickname(targetSocketId),
        });
      } else {
        socket.emit("error", { message: "권한 부여 실패" });
      }
    } catch (error) {
      console.error(`[screen-share:grant] 검증 실패:`, error);
      socket.emit("error", { message: "잘못된 요청 데이터" });
    }
  });

  /**
   * screen-share:revoke 이벤트 핸들러
   * 화면 공유 권한 회수 (호스트 전용)
   */
  socket.on("screen-share:revoke", (data) => {
    try {
      const { targetSocketId } = screenSharePermissionSchema.parse(data);

      const roomId = roomManager.getRoomIdBySocketId(socket.id);

      if (!roomId) {
        socket.emit("error", { message: "방을 찾을 수 없습니다" });
        return;
      }

      const hostSocketId = roomManager.getHost(roomId);
      if (socket.id !== hostSocketId) {
        console.warn(`[screen-share:revoke] 호스트가 아닌 사용자의 권한 회수 시도: ${socket.id}`);
        socket.emit("error", { message: "호스트만 권한을 회수할 수 있습니다" });
        return;
      }

      const result = roomManager.revokeScreenSharePermission(roomId, targetSocketId);

      if (result.success) {
        console.log(`[screen-share:revoke] 화면 공유 권한 회수: ${targetSocketId}`);

        io.to(targetSocketId).emit("screen-share:permission-revoked");

        io.to(roomId).emit("screen-share:permission-updated", {
          targetSocketId,
          granted: false,
          nickname: roomManager.getParticipantNickname(targetSocketId),
        });
      } else {
        socket.emit("error", {
          message:
            result.reason === "CANNOT_REVOKE_HOST_PERMISSION"
              ? "호스트의 권한은 회수할 수 없습니다"
              : "권한 회수 실패",
        });
      }
    } catch (error) {
      console.error(`[screen-share:revoke] 검증 실패:`, error);
      socket.emit("error", { message: "잘못된 요청 데이터" });
    }
  });
};
