/**
 * RoomManager 클래스
 * 방 생성, 조회, 참가자 관리를 담당하는 클래스
 */
import { roomIdSchema, socketIdSchema } from '../schemas/socketSchemas.js';

class RoomManager {
  constructor() {
    // 메모리 기반 방 관리 (Map 사용)
    this.rooms = new Map();
    // 참가자별 마지막 활동 시간 추적
    this.participantActivity = new Map();
    // 타임아웃 체크 간격 (10초마다 체크)
    this.timeoutCheckInterval = 10000;
    // 무응답 타임아웃 시간 (60초)
    this.inactivityTimeout = 60000;
    // 타임아웃 체크 타이머
    this.timeoutTimer = null;
    
    // 타임아웃 체크 시작
    this.startTimeoutCheck();
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
      createdAt: new Date(),
      maxParticipants: 2
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
    console.log(`참가자 추가됨: ${validatedSocketId} -> 방: ${validatedRoomId}, 현재 인원: ${room.participants.size}`);
    
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
      console.log(`참가자 제거됨: ${validatedSocketId} <- 방: ${validatedRoomId}, 남은 인원: ${room.participants.size}`);
      
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
   * 참가자 활동 시간 업데이트
   * @param {string} socketId - 참가자 소켓 ID
   */
  updateParticipantActivity(socketId) {
    // Zod로 파라미터 검증
    const validatedSocketId = socketIdSchema.parse(socketId);
    
    this.participantActivity.set(validatedSocketId, Date.now());
    console.log(`참가자 활동 시간 업데이트: ${validatedSocketId}`);
  }

  /**
   * 참가자 활동 시간 제거
   * @param {string} socketId - 참가자 소켓 ID
   */
  removeParticipantActivity(socketId) {
    // Zod로 파라미터 검증
    const validatedSocketId = socketIdSchema.parse(socketId);
    
    this.participantActivity.delete(validatedSocketId);
    console.log(`참가자 활동 시간 제거: ${validatedSocketId}`);
  }

  /**
   * 타임아웃 체크 시작
   */
  startTimeoutCheck() {
    if (this.timeoutTimer) {
      return;
    }

    this.timeoutTimer = setInterval(() => {
      this.checkInactiveParticipants();
    }, this.timeoutCheckInterval);

    console.log('타임아웃 체크 시작됨');
  }

  /**
   * 타임아웃 체크 중지
   */
  stopTimeoutCheck() {
    if (this.timeoutTimer) {
      clearInterval(this.timeoutTimer);
      this.timeoutTimer = null;
      console.log('타임아웃 체크 중지됨');
    }
  }

  /**
   * 무응답 참가자 체크 및 제거
   * @returns {Array} 제거된 참가자 정보 배열 [{ socketId, roomId }]
   */
  checkInactiveParticipants() {
    const now = Date.now();
    const inactiveParticipants = [];

    // 모든 참가자의 활동 시간 체크
    for (const [socketId, lastActivity] of this.participantActivity.entries()) {
      const inactiveDuration = now - lastActivity;

      // 60초 이상 무응답인 경우
      if (inactiveDuration >= this.inactivityTimeout) {
        console.log(`무응답 참가자 감지: ${socketId}, 무응답 시간: ${Math.floor(inactiveDuration / 1000)}초`);

        // 참가자가 속한 방 찾기
        let participantRoomId = null;
        for (const [roomId, room] of this.rooms.entries()) {
          if (room.participants.has(socketId)) {
            participantRoomId = roomId;
            break;
          }
        }

        if (participantRoomId) {
          // 참가자 제거
          this.removeParticipant(participantRoomId, socketId);
          this.removeParticipantActivity(socketId);

          inactiveParticipants.push({
            socketId,
            roomId: participantRoomId
          });

          console.log(`무응답 참가자 제거됨: ${socketId} (방: ${participantRoomId})`);
        }
      }
    }

    return inactiveParticipants;
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
   * 리소스 정리 (서버 종료 시 호출)
   */
  cleanup() {
    this.stopTimeoutCheck();
    this.rooms.clear();
    this.participantActivity.clear();
    console.log('RoomManager 리소스 정리 완료');
  }
}

export default RoomManager;
