/**
 * 방 관리 이벤트 핸들러
 * room:* 이벤트 처리
 */
import { roomJoinSchema, roomLeaveSchema, setNicknameSchema } from "../schemas/socketSchemas.js";

// 서버 설정 상수 (SFU 모드 기준)
const ABSOLUTE_MAX_PARTICIPANTS = 20; // 서버가 허용하는 절대 최대값
const RECOMMENDED_MAX_PARTICIPANTS = 15; // 권장 최대값 (성능 고려)

/**
 * 방 관련 이벤트 핸들러 등록
 * @param {Object} io - Socket.io 서버 인스턴스
 * @param {Object} socket - Socket.io 소켓 인스턴스
 * @param {Object} roomManager - RoomManager 인스턴스
 */
export const registerRoomHandlers = (io, socket, roomManager) => {
  /**
   * user:set-nickname 이벤트 핸들러
   * 클라이언트가 닉네임을 설정할 때 호출됨
   */
  socket.on("user:set-nickname", (data) => {
    const result = setNicknameSchema.safeParse(data);

    if (!result.success) {
      socket.emit("user:nickname-error", {
        message: "유효하지 않은 닉네임",
        details: result.error.errors,
      });
      return;
    }

    const { nickname } = result.data;
    console.log(`[user:set-nickname] 소켓 ${socket.id}가 닉네임 설정: "${nickname}"`);

    const roomId = roomManager.getRoomIdBySocketId(socket.id);
    if (!roomId) {
      console.log(`[user:set-nickname] 소켓 ${socket.id}가 참가 중인 방이 없습니다`);
      socket.emit("user:nickname-error", {
        message: "방에 참가하지 않았습니다",
      });
      return;
    }

    roomManager.setParticipantNickname(socket.id, nickname);

    io.to(roomId).emit("user:nickname-updated", {
      socketId: socket.id,
      nickname,
    });

    console.log(`[user:set-nickname] 방 ${roomId}의 참가자들에게 닉네임 브로드캐스트 완료`);
  });

  /**
   * room:join 이벤트 핸들러
   * 클라이언트가 방에 참가할 때 호출됨
   */
  socket.on("room:join", (data) => {
    try {
      const { roomId, nickname, maxParticipants } = roomJoinSchema.parse(data);
      let validatedMaxParticipants = maxParticipants;

      console.log(
        `[room:join] 소켓 ${socket.id}가 방 ${roomId} 참가 시도, 닉네임: ${nickname || "익명"}`
      );

      // 서버 측 추가 검증 (보안 강화)
      if (validatedMaxParticipants) {
        if (validatedMaxParticipants > ABSOLUTE_MAX_PARTICIPANTS) {
          console.warn(
            `[Security] 비정상적인 maxParticipants 요청: ${validatedMaxParticipants}, 클라이언트: ${socket.id}`
          );
          validatedMaxParticipants = ABSOLUTE_MAX_PARTICIPANTS;
        }

        if (validatedMaxParticipants > RECOMMENDED_MAX_PARTICIPANTS) {
          socket.emit("warning", {
            message: `${validatedMaxParticipants}명은 권장 최대 인원(${RECOMMENDED_MAX_PARTICIPANTS}명)을 초과합니다. 성능 저하 가능성이 있습니다.`,
          });
          console.log(
            `[room:join] 권장 인원 초과 경고 전송: ${roomId}, 요청 인원: ${validatedMaxParticipants}`
          );
        }
      }

      const result = roomManager.joinRoom(
        roomId,
        socket.id,
        nickname || "익명",
        validatedMaxParticipants
      );

      if (!result.success) {
        console.warn(`[room:join] 방 참가 실패: ${result.reason}`);

        if (result.reason === "ROOM_FULL") {
          socket.emit("room:full", {
            currentSize: result.currentSize,
            maxSize: result.maxSize,
          });
        }
        return;
      }

      socket.join(roomId);

      const room = roomManager.getRoom(roomId);

      socket.emit("room:joined", {
        roomId,
        participants: result.participants,
        participantNicknames: roomManager.getRoomNicknames(roomId),
        hostSocketId: room.hostSocketId,
      });

      socket.to(roomId).emit("room:participant-joined", {
        socketId: socket.id,
        nickname: nickname || "익명",
      });

      console.log(
        `[room:join] 방 참가 성공: ${roomId} (참가자 ${result.participants.length + 1}명)`
      );
    } catch (error) {
      console.error(`[room:join] 검증 실패:`, error);
      socket.emit("error", { message: "잘못된 요청 형식입니다" });
    }
  });

  /**
   * room:leave 이벤트 핸들러
   * 클라이언트가 방을 나갈 때 호출됨
   */
  socket.on("room:leave", (data) => {
    const result = roomLeaveSchema.safeParse(data);

    if (!result.success) {
      socket.emit("error", {
        message: "유효하지 않은 방 ID",
        details: result.error.errors,
      });
      return;
    }

    const { roomId } = result.data;
    console.log(`[room:leave] 소켓 ${socket.id}가 방 ${roomId} 퇴장 시도`);
    handleRoomLeave(io, socket, roomManager);
  });

  /**
   * disconnect 이벤트 핸들러
   * 소켓 연결이 끊어질 때 자동으로 방에서 제거
   */
  socket.on("disconnect", (reason) => {
    console.log(`[disconnect] 소켓 ${socket.id} 연결 해제, 이유: ${reason}`);
    handleRoomLeave(io, socket, roomManager);
  });
};

/**
 * 방 퇴장 처리 헬퍼 함수
 * @param {Object} io - Socket.io 서버 인스턴스
 * @param {Object} socket - Socket.io 소켓 인스턴스
 * @param {Object} roomManager - RoomManager 인스턴스
 */
export const handleRoomLeave = (io, socket, roomManager) => {
  if (!io || !socket || !roomManager) {
    return;
  }

  const result = roomManager.leaveRoom(socket.id);

  if (!result) {
    return;
  }

  const { roomId, wasHost, newHostId, remainingParticipants } = result;

  socket.leave(roomId);

  if (wasHost && newHostId) {
    console.log(`[handleRoomLeave] 호스트 권한 자동 이전: ${socket.id} → ${newHostId}`);

    io.to(newHostId).emit("host:transferred", {
      oldHost: socket.id,
      newHost: newHostId,
    });

    io.to(roomId).emit("room:host-changed", {
      oldHost: socket.id,
      newHost: newHostId,
      nickname: roomManager.getParticipantNickname(newHostId),
    });
  }

  if (remainingParticipants.length > 0) {
    socket.to(roomId).emit("room:participant-left", socket.id);
    console.log(`[handleRoomLeave] 참가자 퇴장 알림 전송: ${roomId}`);
  }
};
