/**
 * RoomManager 테스트
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import RoomManager from "./RoomManager.js";

describe("RoomManager", () => {
  let roomManager;

  beforeEach(() => {
    roomManager = new RoomManager();
  });

  afterEach(() => {
    // 타임아웃 타이머 정리
    roomManager.cleanup();
  });

  describe("방 생성 및 조회", () => {
    it("새 방을 생성할 수 있다", () => {
      // Given: 방 ID
      const roomId = "room-1";

      // When: 방 생성
      const room = roomManager.createRoom(roomId);

      // Then: 방이 생성됨
      expect(room).toBeDefined();
      expect(room.id).toBe(roomId);
      expect(room.participants.size).toBe(0);
      expect(room.maxParticipants).toBe(2);
    });

    it("이미 존재하는 방을 생성하면 기존 방을 반환한다", () => {
      // Given: 이미 생성된 방
      const roomId = "room-1";
      const room1 = roomManager.createRoom(roomId);

      // When: 같은 ID로 방 생성 시도
      const room2 = roomManager.createRoom(roomId);

      // Then: 같은 방 객체 반환
      expect(room1).toBe(room2);
    });

    it("방을 조회할 수 있다", () => {
      // Given: 생성된 방
      const roomId = "room-1";
      roomManager.createRoom(roomId);

      // When: 방 조회
      const room = roomManager.getRoom(roomId);

      // Then: 방이 조회됨
      expect(room).toBeDefined();
      expect(room.id).toBe(roomId);
    });

    it("존재하지 않는 방을 조회하면 undefined를 반환한다", () => {
      // Given: 방이 없는 상태

      // When: 존재하지 않는 방 조회
      const room = roomManager.getRoom("non-existent");

      // Then: undefined 반환
      expect(room).toBeUndefined();
    });
  });

  describe("참가자 관리", () => {
    it("방에 참가자를 추가할 수 있다", () => {
      // Given: 방 ID와 참가자 ID
      const roomId = "room-1";
      const socketId = "socket-1";

      // When: 참가자 추가
      const result = roomManager.addParticipant(roomId, socketId);

      // Then: 추가 성공
      expect(result).toBe(true);
      expect(roomManager.getRoomParticipants(roomId)).toContain(socketId);
    });

    it("방 정원이 초과되면 참가자를 추가할 수 없다", () => {
      // Given: 이미 2명이 참가한 방
      const roomId = "room-1";
      roomManager.addParticipant(roomId, "socket-1");
      roomManager.addParticipant(roomId, "socket-2");

      // When: 3번째 참가자 추가 시도
      const result = roomManager.addParticipant(roomId, "socket-3");

      // Then: 추가 실패
      expect(result).toBe(false);
      expect(roomManager.getRoomParticipants(roomId)).toHaveLength(2);
    });

    it("참가자를 제거할 수 있다", () => {
      // Given: 참가자가 있는 방
      const roomId = "room-1";
      const socketId = "socket-1";
      roomManager.addParticipant(roomId, socketId);

      // When: 참가자 제거
      const result = roomManager.removeParticipant(roomId, socketId);

      // Then: 제거 성공
      expect(result).toBe(true);
      expect(roomManager.getRoomParticipants(roomId)).not.toContain(socketId);
    });

    it("방이 비어있으면 자동으로 삭제된다", () => {
      // Given: 참가자가 1명인 방
      const roomId = "room-1";
      const socketId = "socket-1";
      roomManager.addParticipant(roomId, socketId);

      // When: 마지막 참가자 제거
      roomManager.removeParticipant(roomId, socketId);

      // Then: 방이 삭제됨
      expect(roomManager.getRoom(roomId)).toBeUndefined();
    });

    it("방 정원 확인이 정확하다", () => {
      // Given: 방 생성
      const roomId = "room-1";
      roomManager.createRoom(roomId);

      // When & Then: 참가자 수에 따른 정원 확인
      expect(roomManager.isRoomFull(roomId)).toBe(false);

      roomManager.addParticipant(roomId, "socket-1");
      expect(roomManager.isRoomFull(roomId)).toBe(false);

      roomManager.addParticipant(roomId, "socket-2");
      expect(roomManager.isRoomFull(roomId)).toBe(true);
    });
  });

  describe("참가자 활동 추적", () => {
    it("참가자 활동 시간을 업데이트할 수 있다", () => {
      // Given: 참가자 ID
      const socketId = "socket-1";

      // When: 활동 시간 업데이트
      roomManager.updateParticipantActivity(socketId);

      // Then: 활동 시간이 기록됨
      expect(roomManager.participantActivity.has(socketId)).toBe(true);
    });

    it("참가자 활동 시간을 제거할 수 있다", () => {
      // Given: 활동 시간이 기록된 참가자
      const socketId = "socket-1";
      roomManager.updateParticipantActivity(socketId);

      // When: 활동 시간 제거
      roomManager.removeParticipantActivity(socketId);

      // Then: 활동 시간이 제거됨
      expect(roomManager.participantActivity.has(socketId)).toBe(false);
    });
  });

  describe("무응답 참가자 체크", () => {
    it("60초 이상 무응답인 참가자를 제거한다", () => {
      // Given: 방에 참가한 참가자
      const roomId = "room-1";
      const socketId = "socket-1";
      roomManager.addParticipant(roomId, socketId);
      roomManager.updateParticipantActivity(socketId);

      // 61초 전으로 활동 시간 설정
      const sixtyOneSecondsAgo = Date.now() - 61000;
      roomManager.participantActivity.set(socketId, sixtyOneSecondsAgo);

      // When: 무응답 참가자 체크
      const inactiveParticipants = roomManager.checkInactiveParticipants();

      // Then: 참가자가 제거됨
      expect(inactiveParticipants).toHaveLength(1);
      expect(inactiveParticipants[0].socketId).toBe(socketId);
      expect(inactiveParticipants[0].roomId).toBe(roomId);
      expect(roomManager.getRoomParticipants(roomId)).toHaveLength(0);
    });

    it("60초 미만 무응답인 참가자는 제거하지 않는다", () => {
      // Given: 방에 참가한 참가자
      const roomId = "room-1";
      const socketId = "socket-1";
      roomManager.addParticipant(roomId, socketId);
      roomManager.updateParticipantActivity(socketId);

      // 30초 전으로 활동 시간 설정
      const thirtySecondsAgo = Date.now() - 30000;
      roomManager.participantActivity.set(socketId, thirtySecondsAgo);

      // When: 무응답 참가자 체크
      const inactiveParticipants = roomManager.checkInactiveParticipants();

      // Then: 참가자가 제거되지 않음
      expect(inactiveParticipants).toHaveLength(0);
      expect(roomManager.getRoomParticipants(roomId)).toHaveLength(1);
    });

    it("여러 무응답 참가자를 동시에 제거한다", () => {
      // Given: 여러 방에 무응답 참가자들
      roomManager.addParticipant("room-1", "socket-1");
      roomManager.addParticipant("room-2", "socket-2");
      roomManager.updateParticipantActivity("socket-1");
      roomManager.updateParticipantActivity("socket-2");

      // 61초 전으로 활동 시간 설정
      const sixtyOneSecondsAgo = Date.now() - 61000;
      roomManager.participantActivity.set("socket-1", sixtyOneSecondsAgo);
      roomManager.participantActivity.set("socket-2", sixtyOneSecondsAgo);

      // When: 무응답 참가자 체크
      const inactiveParticipants = roomManager.checkInactiveParticipants();

      // Then: 모든 무응답 참가자가 제거됨
      expect(inactiveParticipants).toHaveLength(2);
      expect(roomManager.getRoomParticipants("room-1")).toHaveLength(0);
      expect(roomManager.getRoomParticipants("room-2")).toHaveLength(0);
    });
  });

  describe("타임아웃 체크", () => {
    it("타임아웃 체크가 자동으로 시작된다", () => {
      // Given & When: RoomManager 생성
      const manager = new RoomManager();

      // Then: 타임아웃 타이머가 설정됨
      expect(manager.timeoutTimer).not.toBeNull();

      // Cleanup
      manager.cleanup();
    });

    it("타임아웃 체크를 중지할 수 있다", () => {
      // Given: 타임아웃 체크가 실행 중인 RoomManager
      const manager = new RoomManager();
      expect(manager.timeoutTimer).not.toBeNull();

      // When: 타임아웃 체크 중지
      manager.stopTimeoutCheck();

      // Then: 타임아웃 타이머가 제거됨
      expect(manager.timeoutTimer).toBeNull();

      // Cleanup
      manager.cleanup();
    });
  });

  describe("유틸리티 메서드", () => {
    it("소켓 ID로 방 ID를 조회할 수 있다", () => {
      // Given: 방에 참가한 참가자
      const roomId = "room-1";
      const socketId = "socket-1";
      roomManager.addParticipant(roomId, socketId);

      // When: 소켓 ID로 방 ID 조회
      const foundRoomId = roomManager.getRoomIdBySocketId(socketId);

      // Then: 올바른 방 ID 반환
      expect(foundRoomId).toBe(roomId);
    });

    it("존재하지 않는 소켓 ID로 조회하면 null을 반환한다", () => {
      // Given: 방이 없는 상태

      // When: 존재하지 않는 소켓 ID로 조회
      const foundRoomId = roomManager.getRoomIdBySocketId("non-existent");

      // Then: null 반환
      expect(foundRoomId).toBeNull();
    });

    it("전체 방 목록을 조회할 수 있다", () => {
      // Given: 여러 방 생성
      roomManager.createRoom("room-1");
      roomManager.createRoom("room-2");

      // When: 전체 방 목록 조회
      const rooms = roomManager.getAllRooms();

      // Then: 모든 방 ID 반환
      expect(rooms).toHaveLength(2);
      expect(rooms).toContain("room-1");
      expect(rooms).toContain("room-2");
    });

    it("전체 방 개수를 조회할 수 있다", () => {
      // Given: 여러 방 생성
      roomManager.createRoom("room-1");
      roomManager.createRoom("room-2");

      // When: 전체 방 개수 조회
      const count = roomManager.getRoomCount();

      // Then: 올바른 개수 반환
      expect(count).toBe(2);
    });
  });

  describe("닉네임 관리", () => {
    it("참가자 닉네임을 설정할 수 있다", () => {
      // Given: 방에 참가한 참가자
      const roomId = "room-1";
      const socketId = "socket-1";
      const nickname = "홍길동";
      roomManager.addParticipant(roomId, socketId);

      // When: 닉네임 설정
      roomManager.setParticipantNickname(roomId, socketId, nickname);

      // Then: 닉네임이 저장됨
      const storedNickname = roomManager.getParticipantNickname(socketId);
      expect(storedNickname).toBe(nickname);
    });

    it("참가자 닉네임을 조회할 수 있다", () => {
      // Given: 닉네임이 설정된 참가자
      const roomId = "room-1";
      const socketId = "socket-1";
      const nickname = "홍길동";
      roomManager.addParticipant(roomId, socketId);
      roomManager.setParticipantNickname(roomId, socketId, nickname);

      // When: 닉네임 조회
      const result = roomManager.getParticipantNickname(socketId);

      // Then: 올바른 닉네임 반환
      expect(result).toBe(nickname);
    });

    it("닉네임이 설정되지 않은 참가자는 null을 반환한다", () => {
      // Given: 닉네임이 설정되지 않은 참가자
      const roomId = "room-1";
      const socketId = "socket-1";
      roomManager.addParticipant(roomId, socketId);

      // When: 닉네임 조회
      const result = roomManager.getParticipantNickname(socketId);

      // Then: null 반환
      expect(result).toBeNull();
    });

    it("존재하지 않는 참가자의 닉네임 조회 시 null을 반환한다", () => {
      // Given: 존재하지 않는 참가자

      // When: 닉네임 조회
      const result = roomManager.getParticipantNickname("non-existent");

      // Then: null 반환
      expect(result).toBeNull();
    });

    it("방의 모든 참가자 닉네임을 조회할 수 있다", () => {
      // Given: 여러 참가자가 있는 방
      const roomId = "room-1";
      roomManager.addParticipant(roomId, "socket-1");
      roomManager.addParticipant(roomId, "socket-2");
      roomManager.setParticipantNickname(roomId, "socket-1", "홍길동");
      roomManager.setParticipantNickname(roomId, "socket-2", "김철수");

      // When: 모든 참가자 닉네임 조회
      const nicknames = roomManager.getAllParticipantNicknames(roomId);

      // Then: 모든 닉네임이 반환됨
      expect(nicknames.size).toBe(2);
      expect(nicknames.get("socket-1")).toBe("홍길동");
      expect(nicknames.get("socket-2")).toBe("김철수");
    });

    it("참가자 제거 시 닉네임도 함께 삭제된다", () => {
      // Given: 닉네임이 설정된 참가자
      const roomId = "room-1";
      const socketId = "socket-1";
      roomManager.addParticipant(roomId, socketId);
      roomManager.setParticipantNickname(roomId, socketId, "홍길동");
      expect(roomManager.getParticipantNickname(socketId)).toBe("홍길동");

      // When: 참가자 제거
      roomManager.removeParticipant(roomId, socketId);

      // Then: 닉네임도 삭제됨
      expect(roomManager.getParticipantNickname(socketId)).toBeNull();
    });

    it("닉네임을 업데이트할 수 있다", () => {
      // Given: 닉네임이 설정된 참가자
      const roomId = "room-1";
      const socketId = "socket-1";
      roomManager.addParticipant(roomId, socketId);
      roomManager.setParticipantNickname(roomId, socketId, "홍길동");
      expect(roomManager.getParticipantNickname(socketId)).toBe("홍길동");

      // When: 닉네임 업데이트
      roomManager.setParticipantNickname(roomId, socketId, "김철수");

      // Then: 새 닉네임이 저장됨
      expect(roomManager.getParticipantNickname(socketId)).toBe("김철수");
    });

    it("존재하지 않는 방에 닉네임을 설정하면 아무 일도 일어나지 않는다", () => {
      // Given: 존재하지 않는 방

      // When: 닉네임 설정 시도
      roomManager.setParticipantNickname("non-existent", "socket-1", "홍길동");

      // Then: 에러 없이 처리됨 (로그만 출력)
      expect(roomManager.getParticipantNickname("socket-1")).toBeNull();
    });
  });

  describe("리소스 정리", () => {
    it("cleanup 메서드가 모든 리소스를 정리한다", () => {
      // Given: 방과 참가자가 있는 상태
      roomManager.createRoom("room-1");
      roomManager.addParticipant("room-1", "socket-1");
      roomManager.updateParticipantActivity("socket-1");

      // When: 리소스 정리
      roomManager.cleanup();

      // Then: 모든 리소스가 정리됨
      expect(roomManager.getRoomCount()).toBe(0);
      expect(roomManager.participantActivity.size).toBe(0);
      expect(roomManager.timeoutTimer).toBeNull();
    });
  });
});
