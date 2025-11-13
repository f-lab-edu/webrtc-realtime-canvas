/**
 * RoomManager 클래스
 * 방 생성, 조회, 참가자 관리를 담당하는 클래스
 */
import { roomIdSchema, socketIdSchema } from "../schemas/socketSchemas.js";

class RoomManager {
  constructor() {
    // 메모리 기반 방 관리 (Map 사용)
    this.rooms = new Map();
  }

  /**
   * 방 생성
   * @param {string} roomId - 방 고유 식별자
   * @returns {Object} 생성된 방 객체
   */
  createRoom(roomId) {
    // Zod로 파라미터 검증
    const validatedRoomId = roomIdSchema.parse(roomId);

    // 이미 존재하는 방인지 확인
    if (this.rooms.has(validatedRoomId)) {
      return this.rooms.get(validatedRoomId);
    }

    // 새 방 생성
    const room = {
      id: validatedRoomId,
      participants: new Set(),
      participantNicknames: new Map(),
      createdAt: new Date(),
      maxParticipants: 2,
    };

    this.rooms.set(validatedRoomId, room);
    console.log(`방 생성됨: ${validatedRoomId}`);

    return room;
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
   * 참가자 추가
   * @param {string} roomId - 방 고유 식별자
   * @param {string} socketId - 참가자 소켓 ID
   * @returns {boolean} 추가 성공 여부
   */
  addParticipant(roomId, socketId) {
    // Zod로 파라미터 검증
    const validatedRoomId = roomIdSchema.parse(roomId);
    const validatedSocketId = socketIdSchema.parse(socketId);

    // 방이 존재하지 않으면 생성
    let room = this.getRoom(validatedRoomId);
    if (!room) {
      room = this.createRoom(validatedRoomId);
    }

    // 방 정원 체크 (최대 2명)
    if (this.isRoomFull(validatedRoomId)) {
      console.log(`방 정원 초과: ${validatedRoomId}, 현재 인원: ${room.participants.size}`);
      return false;
    }

    // 참가자 추가
    room.participants.add(validatedSocketId);
    console.log(
      `참가자 추가됨: ${validatedSocketId} -> 방: ${validatedRoomId}, 현재 인원: ${room.participants.size}`
    );

    return true;
  }

  /**
   * 참가자 제거
   * @param {string} roomId - 방 고유 식별자
   * @param {string} socketId - 참가자 소켓 ID
   * @returns {boolean} 제거 성공 여부
   */
  removeParticipant(roomId, socketId) {
    // Zod로 파라미터 검증
    const validatedRoomId = roomIdSchema.parse(roomId);
    const validatedSocketId = socketIdSchema.parse(socketId);

    const room = this.getRoom(validatedRoomId);
    if (!room) {
      console.log(`방을 찾을 수 없음: ${validatedRoomId}`);
      return false;
    }

    // 참가자 제거
    const removed = room.participants.delete(validatedSocketId);

    if (removed) {
      // 닉네임도 함께 삭제
      room.participantNicknames.delete(validatedSocketId);

      console.log(
        `참가자 제거됨: ${validatedSocketId} <- 방: ${validatedRoomId}, 남은 인원: ${room.participants.size}`
      );

      // 방이 비어있으면 방 삭제
      if (room.participants.size === 0) {
        this.rooms.delete(validatedRoomId);
        console.log(`빈 방 삭제됨: ${validatedRoomId}`);
      }
    }

    return removed;
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

    for (const [roomId, room] of this.rooms.entries()) {
      if (room.participants.has(validatedSocketId)) {
        return roomId;
      }
    }

    return null;
  }

  /**
   * 참가자 활동 시간 업데이트
   * @param {string} socketId - 참가자 소켓 ID
   */
  updateParticipantActivity(socketId) {
    // Zod로 파라미터 검증
    const validatedSocketId = socketIdSchema.parse(socketId);

    // 해당 소켓이 속한 방 찾기
    const roomId = this.getRoomIdBySocketId(validatedSocketId);
    if (!roomId) {
      console.log(`참가자 ${validatedSocketId}가 속한 방을 찾을 수 없습니다`);
      return;
    }

    const room = this.getRoom(roomId);
    if (!room) {
      return;
    }

    // 참가자 활동 시간 업데이트 (향후 비활성 참가자 정리에 사용 가능)
    if (!room.participantActivity) {
      room.participantActivity = new Map();
    }

    room.participantActivity.set(validatedSocketId, new Date());
    console.log(`참가자 ${validatedSocketId} 활동 시간 업데이트`);
  }

  /**
   * 참가자 닉네임 설정
   * @param {string} roomId - 방 고유 식별자
   * @param {string} socketId - 참가자 소켓 ID
   * @param {string} nickname - 닉네임
   */
  setParticipantNickname(roomId, socketId, nickname) {
    // Zod로 파라미터 검증
    const validatedRoomId = roomIdSchema.parse(roomId);
    const validatedSocketId = socketIdSchema.parse(socketId);

    const room = this.getRoom(validatedRoomId);
    if (!room) {
      console.log(`방을 찾을 수 없음: ${validatedRoomId}`);
      return;
    }

    // 닉네임 저장
    room.participantNicknames.set(validatedSocketId, nickname);
    console.log(`닉네임 설정됨: ${validatedSocketId} -> "${nickname}" (방: ${validatedRoomId})`);
  }

  /**
   * 참가자 닉네임 조회
   * @param {string} socketId - 참가자 소켓 ID
   * @returns {string|null} 닉네임 또는 null
   */
  getParticipantNickname(socketId) {
    // Zod로 파라미터 검증
    const validatedSocketId = socketIdSchema.parse(socketId);

    // 해당 소켓이 속한 방 찾기
    for (const room of this.rooms.values()) {
      if (room.participants.has(validatedSocketId)) {
        return room.participantNicknames.get(validatedSocketId) || null;
      }
    }

    return null;
  }

  /**
   * 방의 모든 참가자 닉네임 조회
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

    return new Map(room.participantNicknames);
  }

  /**
   * 리소스 정리 (서버 종료 시 호출)
   */
  cleanup() {
    this.rooms.clear();
    console.log("RoomManager 리소스 정리 완료");
  }
}

export default RoomManager;
