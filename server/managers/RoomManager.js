/**
 * RoomManager 클래스
 * 방 생성, 조회, 참가자 관리를 담당하는 클래스
 * P2P Mesh 다중 참가자 지원 (최대 6명)
 */
import { roomIdSchema, socketIdSchema } from "../schemas/socketSchemas.js";

class RoomManager {
  constructor(defaultMaxParticipants = 6) {
    // 메모리 기반 방 관리 (Map 사용)
    this.rooms = new Map(); // roomId → { participants: Set, maxParticipants, hostSocketId, ... }
    this.socketToRoom = new Map(); // socketId → roomId (빠른 조회를 위한 역방향 맵)
    this.nicknames = new Map(); // socketId → nickname (전역 닉네임 관리)
    this.defaultMaxParticipants = defaultMaxParticipants;
  }

  /**
   * 방 생성
   * @param {string} roomId - 방 고유 식별자
   * @param {string} socketId - 방 생성자 소켓 ID (호스트)
   * @param {string} nickname - 호스트 닉네임
   * @param {number|null} maxParticipants - 최대 참가자 수 (선택)
   * @returns {Object} 생성 결과 { success, reason? }
   */
  createRoom(roomId, socketId, nickname, maxParticipants = null) {
    // Zod로 파라미터 검증
    const validatedRoomId = roomIdSchema.parse(roomId);
    const validatedSocketId = socketIdSchema.parse(socketId);

    // 이미 존재하는 방인지 확인
    if (this.rooms.has(validatedRoomId)) {
      console.warn(`[RoomManager] 이미 존재하는 방: ${validatedRoomId}`);
      return { success: false, reason: "ALREADY_EXISTS" };
    }

    // 새 방 생성
    const room = {
      participants: new Set([validatedSocketId]),
      maxParticipants: maxParticipants || this.defaultMaxParticipants,
      createdAt: Date.now(),
      hostSocketId: validatedSocketId, // 방 생성자가 호스트
      screenSharePermissions: new Set([validatedSocketId]), // 호스트는 기본적으로 화면 공유 권한 보유
    };

    this.rooms.set(validatedRoomId, room);
    this.socketToRoom.set(validatedSocketId, validatedRoomId);
    this.nicknames.set(validatedSocketId, nickname);

    console.log(
      `[RoomManager] 방 생성: ${validatedRoomId}, 호스트: ${validatedSocketId}, 최대 인원: ${room.maxParticipants}`
    );

    return { success: true };
  }

  /**
   * 방 참가
   * @param {string} roomId - 방 고유 식별자
   * @param {string} socketId - 참가자 소켓 ID
   * @param {string} nickname - 참가자 닉네임
   * @param {number|null} maxParticipants - 최대 참가자 수 (방 생성 시에만 사용)
   * @returns {Object} 참가 결과 { success, participants?, reason?, currentSize?, maxSize? }
   */
  joinRoom(roomId, socketId, nickname, maxParticipants = null) {
    // Zod로 파라미터 검증
    const validatedRoomId = roomIdSchema.parse(roomId);
    const validatedSocketId = socketIdSchema.parse(socketId);

    // 방이 없으면 생성
    if (!this.rooms.has(validatedRoomId)) {
      const createResult = this.createRoom(
        validatedRoomId,
        validatedSocketId,
        nickname,
        maxParticipants
      );

      if (createResult.success) {
        // 방 생성 성공 시 빈 기존 참가자 목록 반환
        return {
          success: true,
          participants: [],
        };
      }

      return createResult;
    }

    const room = this.rooms.get(validatedRoomId);

    // 정원 체크
    if (room.participants.size >= room.maxParticipants) {
      console.warn(
        `[RoomManager] 방 정원 초과: ${validatedRoomId} (${room.participants.size}/${room.maxParticipants})`
      );
      return {
        success: false,
        reason: "ROOM_FULL",
        currentSize: room.participants.size,
        maxSize: room.maxParticipants,
      };
    }

    // 참가자 추가
    room.participants.add(validatedSocketId);
    this.socketToRoom.set(validatedSocketId, validatedRoomId);
    this.nicknames.set(validatedSocketId, nickname);

    console.log(
      `[RoomManager] 참가자 추가: ${validatedRoomId} (${room.participants.size}/${room.maxParticipants})`
    );

    // 기존 참가자 목록 반환 (자신 제외)
    const existingParticipants = Array.from(room.participants).filter(
      (id) => id !== validatedSocketId
    );

    return {
      success: true,
      participants: existingParticipants,
    };
  }

  /**
   * 방 퇴장 (원자적 처리 - 호스트 승계 포함)
   *
   * ⚠️ Critical Fix: 호스트 승계 로직을 내부에 캡슐화하여 원자성 보장
   * - Node.js 싱글 스레드 특성을 활용하여 동시성 문제 해결
   * - getNextParticipant()와 transferHost() 사이의 race condition 방지
   *
   * @param {string} socketId - 퇴장할 소켓 ID
   * @returns {Object|null} 퇴장 결과 { roomId, wasHost, newHostId, remainingParticipants }
   */
  leaveRoom(socketId) {
    // Zod로 파라미터 검증
    const validatedSocketId = socketIdSchema.parse(socketId);

    const roomId = this.socketToRoom.get(validatedSocketId);

    if (!roomId) {
      console.warn(`[RoomManager] 참가하지 않은 사용자: ${validatedSocketId}`);
      return null;
    }

    const room = this.rooms.get(roomId);

    if (!room) {
      this.socketToRoom.delete(validatedSocketId);
      this.nicknames.delete(validatedSocketId);
      return null;
    }

    // 1. 호스트 여부 확인 (퇴장 전에 저장)
    const wasHost = room.hostSocketId === validatedSocketId;

    // 2. 참가자 제거 (동기적)
    room.participants.delete(validatedSocketId);
    room.screenSharePermissions.delete(validatedSocketId);
    this.socketToRoom.delete(validatedSocketId);
    this.nicknames.delete(validatedSocketId);

    console.log(`[RoomManager] 참가자 퇴장: ${roomId} (남은 인원: ${room.participants.size})`);

    // 3. 호스트 승계 (동기적, 원자적)
    let newHostId = null;
    if (wasHost && room.participants.size > 0) {
      // 남은 참가자 중 첫 번째를 새 호스트로 선택
      newHostId = room.participants.keys().next().value;
      room.hostSocketId = newHostId;
      // 새 호스트에게 자동으로 화면 공유 권한 부여
      room.screenSharePermissions.add(newHostId);
      console.log(`[RoomManager] 호스트 승계: ${validatedSocketId} → ${newHostId}`);
    }

    // 4. 빈 방 정리
    const remainingParticipants = Array.from(room.participants);
    if (room.participants.size === 0) {
      this.rooms.delete(roomId);
      console.log(`[RoomManager] 빈 방 삭제: ${roomId}`);
    }

    // 원자적 처리 결과 반환
    return {
      roomId,
      wasHost,
      newHostId,
      remainingParticipants,
    };
  }

  /**
   * 호스트 Socket ID 조회
   * @param {string} roomId - 방 ID
   * @returns {string|null} 호스트 Socket ID 또는 null
   */
  getHost(roomId) {
    // Zod로 파라미터 검증
    const validatedRoomId = roomIdSchema.parse(roomId);

    const room = this.rooms.get(validatedRoomId);
    return room ? room.hostSocketId : null;
  }

  /**
   * 호스트 권한 이전 (수동 호출용 - leaveRoom은 자동 처리)
   * @param {string} roomId - 방 ID
   * @param {string} newHostSocketId - 새 호스트 Socket ID
   * @returns {Object} 결과 { success, reason?, oldHost?, newHost? }
   */
  transferHost(roomId, newHostSocketId) {
    // Zod로 파라미터 검증
    const validatedRoomId = roomIdSchema.parse(roomId);
    const validatedSocketId = socketIdSchema.parse(newHostSocketId);

    const room = this.rooms.get(validatedRoomId);

    if (!room) {
      console.warn(`[RoomManager] 방을 찾을 수 없음: ${validatedRoomId}`);
      return { success: false, reason: "ROOM_NOT_FOUND" };
    }

    if (!room.participants.has(validatedSocketId)) {
      console.warn(`[RoomManager] 새 호스트가 방에 없음: ${validatedSocketId}`);
      return { success: false, reason: "PARTICIPANT_NOT_FOUND" };
    }

    const oldHost = room.hostSocketId;
    room.hostSocketId = validatedSocketId;

    // 새 호스트에게 자동으로 화면 공유 권한 부여
    room.screenSharePermissions.add(validatedSocketId);

    console.log(`[RoomManager] 호스트 이전: ${validatedRoomId}, ${oldHost} → ${validatedSocketId}`);

    return { success: true, oldHost, newHost: validatedSocketId };
  }

  /**
   * 화면 공유 권한 부여
   * @param {string} roomId - 방 ID
   * @param {string} socketId - 권한을 부여할 Socket ID
   * @returns {Object} 결과 { success, reason? }
   */
  grantScreenSharePermission(roomId, socketId) {
    // Zod로 파라미터 검증
    const validatedRoomId = roomIdSchema.parse(roomId);
    const validatedSocketId = socketIdSchema.parse(socketId);

    const room = this.rooms.get(validatedRoomId);

    if (!room) {
      return { success: false, reason: "ROOM_NOT_FOUND" };
    }

    if (!room.participants.has(validatedSocketId)) {
      return { success: false, reason: "PARTICIPANT_NOT_FOUND" };
    }

    room.screenSharePermissions.add(validatedSocketId);
    console.log(`[RoomManager] 화면 공유 권한 부여: ${validatedRoomId}, ${validatedSocketId}`);

    return { success: true };
  }

  /**
   * 화면 공유 권한 회수
   * @param {string} roomId - 방 ID
   * @param {string} socketId - 권한을 회수할 Socket ID
   * @returns {Object} 결과 { success, reason? }
   */
  revokeScreenSharePermission(roomId, socketId) {
    // Zod로 파라미터 검증
    const validatedRoomId = roomIdSchema.parse(roomId);
    const validatedSocketId = socketIdSchema.parse(socketId);

    const room = this.rooms.get(validatedRoomId);

    if (!room) {
      return { success: false, reason: "ROOM_NOT_FOUND" };
    }

    // 호스트의 권한은 회수할 수 없음
    if (validatedSocketId === room.hostSocketId) {
      console.warn(`[RoomManager] 호스트의 권한은 회수할 수 없음: ${validatedSocketId}`);
      return { success: false, reason: "CANNOT_REVOKE_HOST_PERMISSION" };
    }

    room.screenSharePermissions.delete(validatedSocketId);
    console.log(`[RoomManager] 화면 공유 권한 회수: ${validatedRoomId}, ${validatedSocketId}`);

    return { success: true };
  }

  /**
   * 화면 공유 권한 확인
   * @param {string} roomId - 방 ID
   * @param {string} socketId - 확인할 Socket ID
   * @returns {boolean} 권한 보유 여부
   */
  hasScreenSharePermission(roomId, socketId) {
    // Zod로 파라미터 검증
    const validatedRoomId = roomIdSchema.parse(roomId);
    const validatedSocketId = socketIdSchema.parse(socketId);

    const room = this.rooms.get(validatedRoomId);

    if (!room) {
      return false;
    }

    return room.screenSharePermissions.has(validatedSocketId);
  }

  /**
   * 방 조회
   * @param {string} roomId - 방 고유 식별자
   * @returns {Object|undefined} 방 객체 또는 undefined
   */
  getRoom(roomId) {
    // Zod로 파라미터 검증
    const validatedRoomId = roomIdSchema.parse(roomId);

    return this.rooms.get(validatedRoomId);
  }

  /**
   * 방 정보 조회 (상세 정보 포함)
   * @param {string} roomId - 방 ID
   * @returns {Object|null} 방 정보 객체 또는 null
   */
  getRoomInfo(roomId) {
    // Zod로 파라미터 검증
    const validatedRoomId = roomIdSchema.parse(roomId);

    const room = this.rooms.get(validatedRoomId);

    if (!room) {
      return null;
    }

    return {
      roomId: validatedRoomId,
      currentSize: room.participants.size,
      maxSize: room.maxParticipants,
      participants: Array.from(room.participants),
      nicknames: this.getRoomNicknames(validatedRoomId),
      createdAt: room.createdAt,
      hostSocketId: room.hostSocketId,
      screenSharePermissions: Array.from(room.screenSharePermissions),
    };
  }

  /**
   * 방 참가자 목록 조회
   * @param {string} roomId - 방 고유 식별자
   * @returns {Array} 참가자 소켓 ID 배열
   */
  getRoomParticipants(roomId) {
    // Zod로 파라미터 검증
    const validatedRoomId = roomIdSchema.parse(roomId);

    const room = this.getRoom(validatedRoomId);
    if (!room) {
      return [];
    }

    return Array.from(room.participants);
  }

  /**
   * 특정 방의 다른 참가자들 조회
   * @param {string} roomId - 방 ID
   * @param {string} excludeSocketId - 제외할 Socket ID
   * @returns {Array} 다른 참가자 소켓 ID 배열
   */
  getOtherParticipants(roomId, excludeSocketId) {
    // Zod로 파라미터 검증
    const validatedRoomId = roomIdSchema.parse(roomId);
    const validatedSocketId = socketIdSchema.parse(excludeSocketId);

    const room = this.rooms.get(validatedRoomId);

    if (!room) {
      return [];
    }

    return Array.from(room.participants).filter((id) => id !== validatedSocketId);
  }

  /**
   * 방 정원 확인
   * @param {string} roomId - 방 고유 식별자
   * @returns {boolean} 정원 초과 여부
   */
  isRoomFull(roomId) {
    // Zod로 파라미터 검증
    const validatedRoomId = roomIdSchema.parse(roomId);

    const room = this.getRoom(validatedRoomId);
    if (!room) {
      return false;
    }

    return room.participants.size >= room.maxParticipants;
  }

  /**
   * 전체 방 목록 조회 (디버깅용)
   * @returns {Array} 방 ID 배열
   */
  getAllRooms() {
    return Array.from(this.rooms.keys());
  }

  /**
   * 전체 방 개수 조회 (디버깅용)
   * @returns {number} 방 개수
   */
  getRoomCount() {
    return this.rooms.size;
  }

  /**
   * 특정 소켓의 방 ID 조회
   * @param {string} socketId - 참가자 소켓 ID
   * @returns {string|null} 방 ID 또는 null
   */
  getRoomIdBySocketId(socketId) {
    // Zod로 파라미터 검증
    const validatedSocketId = socketIdSchema.parse(socketId);

    return this.socketToRoom.get(validatedSocketId) || null;
  }

  /**
   * 참가자 닉네임 설정
   * @param {string} socketId - 참가자 소켓 ID
   * @param {string} nickname - 닉네임
   */
  setParticipantNickname(socketId, nickname) {
    // Zod로 파라미터 검증
    const validatedSocketId = socketIdSchema.parse(socketId);

    this.nicknames.set(validatedSocketId, nickname);
    console.log(`[RoomManager] 닉네임 설정: ${validatedSocketId} → "${nickname}"`);
  }

  /**
   * 참가자 닉네임 조회
   * @param {string} socketId - 참가자 소켓 ID
   * @returns {string|null} 닉네임 또는 null
   */
  getParticipantNickname(socketId) {
    // Zod로 파라미터 검증
    const validatedSocketId = socketIdSchema.parse(socketId);

    return this.nicknames.get(validatedSocketId) || null;
  }

  /**
   * 특정 방의 모든 참가자 닉네임 조회
   * @param {string} roomId - 방 ID
   * @returns {Object} { socketId: nickname } 형태의 객체
   */
  getRoomNicknames(roomId) {
    // Zod로 파라미터 검증
    const validatedRoomId = roomIdSchema.parse(roomId);

    const room = this.rooms.get(validatedRoomId);

    if (!room) {
      return {};
    }

    const nicknames = {};
    for (const socketId of room.participants) {
      nicknames[socketId] = this.nicknames.get(socketId) || "익명";
    }

    return nicknames;
  }

  /**
   * 방의 모든 참가자 닉네임 조회 (Map 반환)
   * @param {string} roomId - 방 고유 식별자
   * @returns {Map<socketId, nickname>} 참가자 닉네임 맵
   */
  getAllParticipantNicknames(roomId) {
    // Zod로 파라미터 검증
    const validatedRoomId = roomIdSchema.parse(roomId);

    const room = this.getRoom(validatedRoomId);
    if (!room) {
      return new Map();
    }

    const nicknamesMap = new Map();
    for (const socketId of room.participants) {
      const nickname = this.nicknames.get(socketId) || "익명";
      nicknamesMap.set(socketId, nickname);
    }

    return nicknamesMap;
  }

  /**
   * 리소스 정리 (서버 종료 시 호출)
   */
  cleanup() {
    this.rooms.clear();
    this.socketToRoom.clear();
    this.nicknames.clear();
    console.log("[RoomManager] 리소스 정리 완료");
  }
}

export default RoomManager;
