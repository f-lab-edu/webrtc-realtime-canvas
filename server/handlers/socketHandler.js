/**
 * Socket 이벤트 핸들러
 * Socket.io 이벤트를 처리하고 방 관리 및 시그널링 중계를 담당
 */
import {
  iceCandidateSchema,
  roomJoinSchema,
  roomLeaveSchema,
  signalSchema,
  whiteboardEventSchema,
} from "../schemas/socketSchemas.js";

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

  // 소켓이 참가한 방 ID를 추적
  let currentRoomId = null;

  /**
   * room:join 이벤트 핸들러
   * 클라이언트가 방에 참가할 때 호출됨
   */
  socket.on("room:join", (roomId) => {
    // Zod로 파라미터 검증
    const result = roomJoinSchema.safeParse({ roomId });

    if (!result.success) {
      socket.emit("error", {
        message: "유효하지 않은 방 ID",
        details: result.error.errors,
      });
      return;
    }

    const { roomId: validatedRoomId } = result.data;
    console.log(`[room:join] 소켓 ${socket.id}가 방 ${validatedRoomId} 참가 시도`);

    // 기존 방에서 나가기
    if (currentRoomId) {
      handleRoomLeave(io, socket, roomManager, currentRoomId);
    }

    // 방 정원 확인
    if (roomManager.isRoomFull(validatedRoomId)) {
      console.log(`[room:join] 방 ${validatedRoomId} 정원 초과`);
      socket.emit("room:full");
      return;
    }

    // 참가자 추가
    const added = roomManager.addParticipant(validatedRoomId, socket.id);

    if (!added) {
      console.log(`[room:join] 방 ${validatedRoomId} 참가 실패`);
      socket.emit("room:full");
      return;
    }

    // Socket.io 방에 참가
    socket.join(validatedRoomId);
    currentRoomId = validatedRoomId;

    // 현재 방의 다른 참가자 목록 조회
    const participants = roomManager
      .getRoomParticipants(validatedRoomId)
      .filter((id) => id !== socket.id);

    // 참가 성공 응답
    socket.emit("room:joined", {
      roomId: validatedRoomId,
      participants,
    });

    console.log(
      `[room:join] 소켓 ${socket.id}가 방 ${validatedRoomId}에 참가 완료, 기존 참가자: ${participants.length}명`
    );

    // 방의 다른 참가자들에게 새 참가자 알림
    socket.to(validatedRoomId).emit("room:participant-joined", socket.id);
    console.log(`[room:join] 방 ${validatedRoomId}의 다른 참가자들에게 알림 전송`);
  });

  /**
   * room:leave 이벤트 핸들러
   * 클라이언트가 방을 나갈 때 호출됨
   */
  socket.on("room:leave", (roomId) => {
    // Zod로 파라미터 검증
    const result = roomLeaveSchema.safeParse({ roomId });

    if (!result.success) {
      socket.emit("error", {
        message: "유효하지 않은 방 ID",
        details: result.error.errors,
      });
      return;
    }

    const { roomId: validatedRoomId } = result.data;
    console.log(`[room:leave] 소켓 ${socket.id}가 방 ${validatedRoomId} 퇴장 시도`);
    handleRoomLeave(io, socket, roomManager, validatedRoomId);
  });

  /**
   * signal:offer 이벤트 핸들러
   * WebRTC offer를 상대방에게 중계
   */
  socket.on("signal:offer", (data) => {
    // Zod로 파라미터 검증
    const result = signalSchema.safeParse(data);

    if (!result.success) {
      socket.emit("error", {
        message: "유효하지 않은 시그널 데이터",
        details: result.error.errors,
      });
      return;
    }

    const { to, signal } = result.data;
    console.log(`[signal:offer] ${socket.id} -> ${to}`);

    // 대상 소켓에게 offer 전달
    io.to(to).emit("signal:offer", {
      from: socket.id,
      signal,
    });
  });

  /**
   * signal:answer 이벤트 핸들러
   * WebRTC answer를 상대방에게 중계
   */
  socket.on("signal:answer", (data) => {
    // Zod로 파라미터 검증
    const result = signalSchema.safeParse(data);

    if (!result.success) {
      socket.emit("error", {
        message: "유효하지 않은 시그널 데이터",
        details: result.error.errors,
      });
      return;
    }

    const { to, signal } = result.data;
    console.log(`[signal:answer] ${socket.id} -> ${to}`);

    // 대상 소켓에게 answer 전달
    io.to(to).emit("signal:answer", {
      from: socket.id,
      signal,
    });
  });

  /**
   * signal:ice-candidate 이벤트 핸들러
   * ICE candidate를 상대방에게 중계
   */
  socket.on("signal:ice-candidate", (data) => {
    // Zod로 파라미터 검증
    const result = iceCandidateSchema.safeParse(data);

    if (!result.success) {
      socket.emit("error", {
        message: "유효하지 않은 ICE candidate 데이터",
        details: result.error.errors,
      });
      return;
    }

    const { to, candidate } = result.data;
    console.log(`[signal:ice-candidate] ${socket.id} -> ${to}`);

    // 대상 소켓에게 ICE candidate 전달
    io.to(to).emit("signal:ice-candidate", {
      from: socket.id,
      candidate,
    });
  });

  /**
   * whiteboard:event 이벤트 핸들러
   * 화이트보드 그리기 이벤트를 방의 다른 참가자들에게 중계
   */
  socket.on("whiteboard:event", (data) => {
    // Zod로 파라미터 검증
    const result = whiteboardEventSchema.safeParse(data);

    if (!result.success) {
      socket.emit("error", {
        message: "유효하지 않은 화이트보드 이벤트 데이터",
        details: result.error.errors,
      });
      return;
    }

    const { roomId, event } = result.data;
    console.log(`[whiteboard:event] 방 ${roomId}에서 이벤트 발생: ${event.type}`);

    // 방의 다른 참가자들에게 이벤트 중계
    socket.to(roomId).emit("whiteboard:event", {
      from: socket.id,
      event,
    });
  });

  /**
   * disconnect 이벤트 핸들러
   * 소켓 연결이 끊어질 때 자동으로 방에서 제거
   */
  socket.on("disconnect", (reason) => {
    console.log(`[disconnect] 소켓 ${socket.id} 연결 해제, 이유: ${reason}`);

    if (currentRoomId) {
      handleRoomLeave(io, socket, roomManager, currentRoomId);
    }
  });
};

/**
 * 방 퇴장 처리 헬퍼 함수
 * @param {Object} io - Socket.io 서버 인스턴스
 * @param {Object} socket - Socket.io 소켓 인스턴스
 * @param {Object} roomManager - RoomManager 인스턴스
 * @param {string} roomId - 방 ID
 */
const handleRoomLeave = (io, socket, roomManager, roomId) => {
  // 파라미터 검증
  if (!io || !socket || !roomManager || !roomId) {
    return;
  }

  // 참가자 제거
  const removed = roomManager.removeParticipant(roomId, socket.id);

  if (removed) {
    // Socket.io 방에서 나가기
    socket.leave(roomId);

    // 방의 다른 참가자들에게 퇴장 알림
    socket.to(roomId).emit("room:participant-left", socket.id);

    console.log(`[handleRoomLeave] 소켓 ${socket.id}가 방 ${roomId}에서 퇴장 완료`);
  }
};

export default registerSocketHandlers;
