/**
 * Socket 이벤트 핸들러
 * Socket.io 이벤트를 처리하고 방 관리 및 시그널링 중계를 담당
 * P2P Mesh 방식 지원 (다중 참가자 WebRTC 연결)
 */
import {
  iceCandidateSchema,
  mediaReconnectedSchema,
  mediaReconnectingSchema,
  roomJoinSchema,
  roomLeaveSchema,
  screenSharePermissionSchema,
  setNicknameSchema,
  signalSchema,
  whiteboardEventSchema,
} from "../schemas/socketSchemas.js";

// 서버 설정 상수
const ABSOLUTE_MAX_PARTICIPANTS = 10; // 서버가 허용하는 절대 최대값
const RECOMMENDED_MAX_PARTICIPANTS = 6; // 권장 최대값 (성능 고려)

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

  /**
   * user:set-nickname 이벤트 핸들러
   * 클라이언트가 닉네임을 설정할 때 호출됨
   */
  socket.on("user:set-nickname", (data) => {
    // Zod로 파라미터 검증
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

    // 현재 참가 중인 방 찾기
    const roomId = roomManager.getRoomIdBySocketId(socket.id);
    if (!roomId) {
      console.log(`[user:set-nickname] 소켓 ${socket.id}가 참가 중인 방이 없습니다`);
      socket.emit("user:nickname-error", {
        message: "방에 참가하지 않았습니다",
      });
      return;
    }

    // RoomManager에 닉네임 저장
    roomManager.setParticipantNickname(socket.id, nickname);

    // 방의 모든 참가자들에게 닉네임 브로드캐스트
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
      // Zod 검증
      const { roomId, nickname, maxParticipants } = roomJoinSchema.parse(data);
      let validatedMaxParticipants = maxParticipants;

      console.log(
        `[room:join] 소켓 ${socket.id}가 방 ${roomId} 참가 시도, 닉네임: ${nickname || "익명"}`
      );

      // 서버 측 추가 검증 (보안 강화)
      if (validatedMaxParticipants) {
        // 절대 최대값 초과 시 강제 조정
        if (validatedMaxParticipants > ABSOLUTE_MAX_PARTICIPANTS) {
          console.warn(
            `[Security] 비정상적인 maxParticipants 요청: ${validatedMaxParticipants}, 클라이언트: ${socket.id}`
          );
          validatedMaxParticipants = ABSOLUTE_MAX_PARTICIPANTS;
        }

        // 권장값 초과 시 경고 메시지 전송
        if (validatedMaxParticipants > RECOMMENDED_MAX_PARTICIPANTS) {
          socket.emit("warning", {
            message: `${validatedMaxParticipants}명은 권장 최대 인원(${RECOMMENDED_MAX_PARTICIPANTS}명)을 초과합니다. 성능 저하 가능성이 있습니다.`,
          });
          console.log(
            `[room:join] 권장 인원 초과 경고 전송: ${roomId}, 요청 인원: ${validatedMaxParticipants}`
          );
        }
      }

      // 방 참가 시도
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

      // Socket.io 방 입장
      socket.join(roomId);

      // 본인에게 참가 성공 알림 (기존 참가자 목록 포함)
      socket.emit("room:joined", {
        roomId,
        participants: result.participants, // 기존 참가자들 (자신 제외)
        participantNicknames: roomManager.getRoomNicknames(roomId),
      });

      // 다른 모든 참가자에게 새 참가자 입장 알림
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
    // Zod로 파라미터 검증
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
   * signal:offer 이벤트 핸들러 (P2P Mesh - 1:1 전달)
   * WebRTC offer를 특정 Peer에게 중계
   */
  socket.on("signal:offer", (data) => {
    try {
      const { to, signal } = signalSchema.parse(data);

      // 닉네임 조회
      const senderNickname = roomManager.getParticipantNickname(socket.id) || socket.id;
      const receiverNickname = roomManager.getParticipantNickname(to) || to;

      console.log(`[WebRTC] Offer 전달: [${senderNickname}] → [${receiverNickname}]`);

      // 특정 Peer에게만 전달
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

      // 닉네임 조회
      const senderNickname = roomManager.getParticipantNickname(socket.id) || socket.id;
      const receiverNickname = roomManager.getParticipantNickname(to) || to;

      console.log(`[WebRTC] Answer 전달: [${senderNickname}] → [${receiverNickname}]`);

      // 특정 Peer에게만 전달
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

      // 닉네임 조회
      const senderNickname = roomManager.getParticipantNickname(socket.id) || socket.id;
      const receiverNickname = roomManager.getParticipantNickname(to) || to;

      console.log(`[WebRTC] ICE Candidate 전달: [${senderNickname}] → [${receiverNickname}]`);

      // 특정 Peer에게만 전달
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

      // 닉네임 조회
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

    // 권한 확인
    const hasPermission = roomManager.hasScreenSharePermission(roomId, socket.id);

    if (!hasPermission) {
      console.warn(`[screen-share:request] 화면 공유 권한 없음: ${socket.id}`);
      socket.emit("screen-share:denied", { reason: "NO_PERMISSION" });
      return;
    }

    // 권한이 있으면 승인
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

      // 방의 모든 참가자에게 브로드캐스트
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

      // 방의 모든 참가자에게 브로드캐스트
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

      // 호스트 권한 확인
      const hostSocketId = roomManager.getHost(roomId);
      if (socket.id !== hostSocketId) {
        console.warn(`[screen-share:grant] 호스트가 아닌 사용자의 권한 부여 시도: ${socket.id}`);
        socket.emit("error", { message: "호스트만 권한을 부여할 수 있습니다" });
        return;
      }

      // 권한 부여
      const result = roomManager.grantScreenSharePermission(roomId, targetSocketId);

      if (result.success) {
        console.log(`[screen-share:grant] 화면 공유 권한 부여: ${targetSocketId}`);

        // 권한을 받은 사용자에게 알림
        io.to(targetSocketId).emit("screen-share:permission-granted");

        // 방의 모든 참가자에게 브로드캐스트
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

      // 호스트 권한 확인
      const hostSocketId = roomManager.getHost(roomId);
      if (socket.id !== hostSocketId) {
        console.warn(`[screen-share:revoke] 호스트가 아닌 사용자의 권한 회수 시도: ${socket.id}`);
        socket.emit("error", { message: "호스트만 권한을 회수할 수 있습니다" });
        return;
      }

      // 권한 회수
      const result = roomManager.revokeScreenSharePermission(roomId, targetSocketId);

      if (result.success) {
        console.log(`[screen-share:revoke] 화면 공유 권한 회수: ${targetSocketId}`);

        // 권한을 잃은 사용자에게 알림
        io.to(targetSocketId).emit("screen-share:permission-revoked");

        // 방의 모든 참가자에게 브로드캐스트
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

  /**
   * media:reconnecting 이벤트 핸들러
   * 클라이언트가 디바이스 변경으로 미디어 재연결을 시작할 때 호출됨
   * 상대방에게 재연결 시작을 알려서 대기 상태로 만듦
   */
  socket.on("media:reconnecting", (data) => {
    // Zod로 파라미터 검증
    const result = mediaReconnectingSchema.safeParse(data);

    if (!result.success) {
      socket.emit("error", {
        message: "유효하지 않은 재연결 데이터",
        details: result.error.errors,
      });
      return;
    }

    const { to, timestamp } = result.data;

    // 닉네임 조회
    const senderNickname = roomManager.getParticipantNickname(socket.id) || socket.id;
    const receiverNickname = roomManager.getParticipantNickname(to) || to;

    console.log(
      `[media:reconnecting] [${senderNickname}] -> [${receiverNickname}] 재연결 시작, timestamp: ${timestamp}`
    );

    // 대상 소켓에게 재연결 시작 알림
    io.to(to).emit("media:reconnecting", {
      from: socket.id,
      timestamp,
    });

    console.log(`[media:reconnecting] 재연결 알림 전송 완료`);
  });

  /**
   * media:reconnected 이벤트 핸들러
   * 클라이언트가 미디어 재연결을 완료했을 때 호출됨
   * 상대방에게 재연결 완료를 알려서 대기 상태 해제
   */
  socket.on("media:reconnected", (data) => {
    // Zod로 파라미터 검증
    const result = mediaReconnectedSchema.safeParse(data);

    if (!result.success) {
      socket.emit("error", {
        message: "유효하지 않은 재연결 완료 데이터",
        details: result.error.errors,
      });
      return;
    }

    const { to } = result.data;

    // 닉네임 조회
    const senderNickname = roomManager.getParticipantNickname(socket.id) || socket.id;
    const receiverNickname = roomManager.getParticipantNickname(to) || to;

    console.log(`[media:reconnected] [${senderNickname}] -> [${receiverNickname}] 재연결 완료`);

    // 대상 소켓에게 재연결 완료 알림
    io.to(to).emit("media:reconnected", {
      from: socket.id,
    });

    console.log(`[media:reconnected] 재연결 완료 알림 전송 완료`);
  });

  /**
   * disconnect 이벤트 핸들러 (원자적 퇴장 처리)
   * 소켓 연결이 끊어질 때 자동으로 방에서 제거
   *
   * ⚠️ Critical Fix: leaveRoom()이 호스트 승계를 원자적으로 처리하므로
   * 외부에서 별도로 transferHost()를 호출할 필요 없음
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
const handleRoomLeave = (io, socket, roomManager) => {
  // 파라미터 검증
  if (!io || !socket || !roomManager) {
    return;
  }

  // 원자적 퇴장 처리 (호스트 승계 포함)
  const result = roomManager.leaveRoom(socket.id);

  if (!result) {
    return;
  }

  const { roomId, wasHost, newHostId, remainingParticipants } = result;

  // Socket.io 방에서 나가기
  socket.leave(roomId);

  // 호스트가 퇴장하고 새 호스트가 있는 경우 알림
  if (wasHost && newHostId) {
    console.log(`[handleRoomLeave] 호스트 권한 자동 이전: ${socket.id} → ${newHostId}`);

    // 새 호스트에게 알림
    io.to(newHostId).emit("host:transferred", {
      oldHost: socket.id,
      newHost: newHostId,
    });

    // 방의 모든 참가자에게 브로드캐스트
    io.to(roomId).emit("host:changed", {
      oldHost: socket.id,
      newHost: newHostId,
      nickname: roomManager.getParticipantNickname(newHostId),
    });
  }

  // 남은 참가자들에게 퇴장 알림
  if (remainingParticipants.length > 0) {
    socket.to(roomId).emit("room:participant-left", socket.id);
    console.log(`[handleRoomLeave] 참가자 퇴장 알림 전송: ${roomId}`);
  }
};

export default registerSocketHandlers;
