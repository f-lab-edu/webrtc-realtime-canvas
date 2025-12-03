/**
 * RoomManager 테스트
 * P2P Mesh 다중 참가자 지원 기능 테스트
 */
import RoomManager from "./RoomManager.js";

// Jest globals는 injectGlobals: true로 자동 주입됨
// describe, it, expect, beforeEach, afterEach는 전역으로 사용 가능

describe("RoomManager - P2P Mesh 지원", () => {
  let roomManager;

  beforeEach(() => {
    roomManager = new RoomManager(6); // 최대 6명
  });

  afterEach(() => {
    roomManager.cleanup();
  });

  describe("방 생성", () => {
    it("최대 인원을 지정하여 방을 생성할 수 있다", () => {
      // Given: 최대 4명으로 제한된 방
      const roomId = "test-room";
      const socketId = "socket-1";
      const nickname = "사용자1";

      // When: 방 생성
      const result = roomManager.createRoom(roomId, socketId, nickname, 4);

      // Then: 성공 및 최대 인원 확인
      expect(result.success).toBe(true);

      const roomInfo = roomManager.getRoomInfo(roomId);
      expect(roomInfo.maxSize).toBe(4);
      expect(roomInfo.currentSize).toBe(1);
      expect(roomInfo.hostSocketId).toBe(socketId);
    });

    it("호스트에게 자동으로 화면 공유 권한이 부여된다", () => {
      // Given
      const roomId = "test-room";
      const socketId = "socket-1";
      const nickname = "사용자1";

      // When
      roomManager.createRoom(roomId, socketId, nickname);

      // Then
      const hasPermission = roomManager.hasScreenSharePermission(roomId, socketId);
      expect(hasPermission).toBe(true);
    });
  });

  describe("다중 참가자 참가", () => {
    it("4명까지 방에 참가할 수 있다", () => {
      // Given: 최대 4명 방
      const roomId = "test-room";
      roomManager.createRoom(roomId, "socket-1", "사용자1", 4);

      // When: 3명 추가 참가
      const result2 = roomManager.joinRoom(roomId, "socket-2", "사용자2");
      const result3 = roomManager.joinRoom(roomId, "socket-3", "사용자3");
      const result4 = roomManager.joinRoom(roomId, "socket-4", "사용자4");

      // Then: 모두 성공
      expect(result2.success).toBe(true);
      expect(result3.success).toBe(true);
      expect(result4.success).toBe(true);

      const roomInfo = roomManager.getRoomInfo(roomId);
      expect(roomInfo.currentSize).toBe(4);
    });

    it("정원 초과 시 참가가 거부된다", () => {
      // Given: 최대 4명 방이 가득 참
      const roomId = "test-room";
      roomManager.createRoom(roomId, "socket-1", "사용자1", 4);
      roomManager.joinRoom(roomId, "socket-2", "사용자2");
      roomManager.joinRoom(roomId, "socket-3", "사용자3");
      roomManager.joinRoom(roomId, "socket-4", "사용자4");

      // When: 5번째 참가자 시도
      const result = roomManager.joinRoom(roomId, "socket-5", "사용자5");

      // Then: 실패
      expect(result.success).toBe(false);
      expect(result.reason).toBe("ROOM_FULL");
      expect(result.currentSize).toBe(4);
      expect(result.maxSize).toBe(4);
    });
  });

  describe("기존 참가자 목록 조회", () => {
    it("새 참가자에게 기존 참가자 목록을 반환한다", () => {
      // Given: 2명이 이미 참가한 방
      const roomId = "test-room";
      roomManager.createRoom(roomId, "socket-1", "사용자1", 6);
      roomManager.joinRoom(roomId, "socket-2", "사용자2");

      // When: 3번째 참가자 입장
      const result = roomManager.joinRoom(roomId, "socket-3", "사용자3");

      // Then: 기존 참가자 2명 목록 반환
      expect(result.success).toBe(true);
      expect(result.participants).toHaveLength(2);
      expect(result.participants).toContain("socket-1");
      expect(result.participants).toContain("socket-2");
      expect(result.participants).not.toContain("socket-3"); // 자신은 제외
    });
  });

  describe("참가자 퇴장 및 호스트 승계", () => {
    it("호스트가 퇴장하면 다음 참가자가 호스트가 된다", () => {
      // Given: 3명이 참가한 방 (socket-1이 호스트)
      const roomId = "test-room";
      roomManager.createRoom(roomId, "socket-1", "사용자1", 6);
      roomManager.joinRoom(roomId, "socket-2", "사용자2");
      roomManager.joinRoom(roomId, "socket-3", "사용자3");

      // When: 호스트 퇴장
      const result = roomManager.leaveRoom("socket-1");

      // Then: 호스트 승계
      expect(result.wasHost).toBe(true);
      expect(result.newHostId).toBe("socket-2");
      expect(result.remainingParticipants).toHaveLength(2);

      const roomInfo = roomManager.getRoomInfo(roomId);
      expect(roomInfo.hostSocketId).toBe("socket-2");
    });

    it("새 호스트에게 자동으로 화면 공유 권한이 부여된다", () => {
      // Given
      const roomId = "test-room";
      roomManager.createRoom(roomId, "socket-1", "사용자1", 6);
      roomManager.joinRoom(roomId, "socket-2", "사용자2");

      // When
      roomManager.leaveRoom("socket-1");

      // Then
      const hasPermission = roomManager.hasScreenSharePermission(roomId, "socket-2");
      expect(hasPermission).toBe(true);
    });

    it("중간 참가자가 퇴장해도 방은 유지된다", () => {
      // Given: 3명이 참가한 방
      const roomId = "test-room";
      roomManager.createRoom(roomId, "socket-1", "사용자1", 6);
      roomManager.joinRoom(roomId, "socket-2", "사용자2");
      roomManager.joinRoom(roomId, "socket-3", "사용자3");

      // When: 중간 참가자 퇴장
      roomManager.leaveRoom("socket-2");

      // Then: 방은 존재하고 2명 남음
      const roomInfo = roomManager.getRoomInfo(roomId);
      expect(roomInfo).not.toBeNull();
      expect(roomInfo.currentSize).toBe(2);
      expect(roomInfo.participants).toContain("socket-1");
      expect(roomInfo.participants).toContain("socket-3");
      expect(roomInfo.participants).not.toContain("socket-2");
    });

    it("모든 참가자가 퇴장하면 방이 삭제된다", () => {
      // Given: 2명이 참가한 방
      const roomId = "test-room";
      roomManager.createRoom(roomId, "socket-1", "사용자1", 6);
      roomManager.joinRoom(roomId, "socket-2", "사용자2");

      // When: 모든 참가자 퇴장
      roomManager.leaveRoom("socket-1");
      roomManager.leaveRoom("socket-2");

      // Then: 방 삭제됨
      const roomInfo = roomManager.getRoomInfo(roomId);
      expect(roomInfo).toBeNull();
    });
  });

  describe("호스트 권한 관리", () => {
    it("호스트를 수동으로 이전할 수 있다", () => {
      // Given
      const roomId = "test-room";
      roomManager.createRoom(roomId, "socket-1", "사용자1", 6);
      roomManager.joinRoom(roomId, "socket-2", "사용자2");

      // When
      const result = roomManager.transferHost(roomId, "socket-2");

      // Then
      expect(result.success).toBe(true);
      expect(result.oldHost).toBe("socket-1");
      expect(result.newHost).toBe("socket-2");

      const roomInfo = roomManager.getRoomInfo(roomId);
      expect(roomInfo.hostSocketId).toBe("socket-2");
    });
  });

  describe("화면 공유 권한 관리", () => {
    it("화면 공유 권한을 부여할 수 있다", () => {
      // Given
      const roomId = "test-room";
      roomManager.createRoom(roomId, "socket-1", "사용자1", 6);
      roomManager.joinRoom(roomId, "socket-2", "사용자2");

      // When
      const result = roomManager.grantScreenSharePermission(roomId, "socket-2");

      // Then
      expect(result.success).toBe(true);
      const hasPermission = roomManager.hasScreenSharePermission(roomId, "socket-2");
      expect(hasPermission).toBe(true);
    });

    it("화면 공유 권한을 회수할 수 있다", () => {
      // Given
      const roomId = "test-room";
      roomManager.createRoom(roomId, "socket-1", "사용자1", 6);
      roomManager.joinRoom(roomId, "socket-2", "사용자2");
      roomManager.grantScreenSharePermission(roomId, "socket-2");

      // When
      const result = roomManager.revokeScreenSharePermission(roomId, "socket-2");

      // Then
      expect(result.success).toBe(true);
      const hasPermission = roomManager.hasScreenSharePermission(roomId, "socket-2");
      expect(hasPermission).toBe(false);
    });

    it("호스트의 화면 공유 권한은 회수할 수 없다", () => {
      // Given
      const roomId = "test-room";
      roomManager.createRoom(roomId, "socket-1", "사용자1", 6);

      // When
      const result = roomManager.revokeScreenSharePermission(roomId, "socket-1");

      // Then
      expect(result.success).toBe(false);
      expect(result.reason).toBe("CANNOT_REVOKE_HOST_PERMISSION");
    });
  });

  describe("닉네임 관리", () => {
    it("방의 모든 참가자 닉네임을 조회할 수 있다", () => {
      // Given: 3명이 참가한 방
      const roomId = "test-room";
      roomManager.createRoom(roomId, "socket-1", "앨리스", 6);
      roomManager.joinRoom(roomId, "socket-2", "밥");
      roomManager.joinRoom(roomId, "socket-3", "찰리");

      // When: 닉네임 조회
      const nicknames = roomManager.getRoomNicknames(roomId);

      // Then: 3명의 닉네임 반환
      expect(nicknames).toEqual({
        "socket-1": "앨리스",
        "socket-2": "밥",
        "socket-3": "찰리",
      });
    });

    it("참가자 닉네임을 설정할 수 있다", () => {
      // Given
      const socketId = "socket-1";

      // When
      roomManager.setParticipantNickname(socketId, "테스트유저");

      // Then
      const nickname = roomManager.getParticipantNickname(socketId);
      expect(nickname).toBe("테스트유저");
    });
  });

  describe("리소스 정리", () => {
    it("cleanup 메서드가 모든 리소스를 정리한다", () => {
      // Given
      roomManager.createRoom("room-1", "socket-1", "사용자1", 6);
      roomManager.createRoom("room-2", "socket-2", "사용자2", 6);

      // When
      roomManager.cleanup();

      // Then
      expect(roomManager.getRoomCount()).toBe(0);
      expect(roomManager.getAllRooms()).toHaveLength(0);
    });
  });

  describe("SFU Producer 관리", () => {
    it("Producer ID를 추가할 수 있다", () => {
      // Given: 방에 참가한 사용자
      const roomId = "test-room";
      const socketId = "socket-1";
      roomManager.createRoom(roomId, socketId, "사용자1", 6);

      // When: Producer ID 추가
      roomManager.addProducerId(socketId, "producer-1");
      roomManager.addProducerId(socketId, "producer-2");

      // Then: Producer 목록에 포함
      const producerIds = roomManager.getProducerIdsBySocketId(socketId);
      expect(producerIds).toContain("producer-1");
      expect(producerIds).toContain("producer-2");
      expect(producerIds).toHaveLength(2);
    });

    it("Producer ID를 제거할 수 있다", () => {
      // Given: Producer가 있는 사용자
      const socketId = "socket-1";
      roomManager.createRoom("test-room", socketId, "사용자1", 6);
      roomManager.addProducerId(socketId, "producer-1");
      roomManager.addProducerId(socketId, "producer-2");

      // When: Producer ID 제거
      roomManager.removeProducerId(socketId, "producer-1");

      // Then: 제거된 Producer는 목록에 없음
      const producerIds = roomManager.getProducerIdsBySocketId(socketId);
      expect(producerIds).not.toContain("producer-1");
      expect(producerIds).toContain("producer-2");
      expect(producerIds).toHaveLength(1);
    });

    it("방의 다른 참가자들의 Producer 목록을 조회할 수 있다", () => {
      // Given: 3명이 참가하고 각자 Producer 보유
      const roomId = "test-room";
      roomManager.createRoom(roomId, "socket-1", "앨리스", 6);
      roomManager.joinRoom(roomId, "socket-2", "밥");
      roomManager.joinRoom(roomId, "socket-3", "찰리");

      roomManager.addProducerId("socket-1", "producer-1-video");
      roomManager.addProducerId("socket-1", "producer-1-audio");
      roomManager.addProducerId("socket-2", "producer-2-video");
      roomManager.addProducerId("socket-3", "producer-3-video");

      // When: socket-2 관점에서 다른 참가자의 Producer 조회
      const producers = roomManager.getProducersInRoom(roomId, "socket-2");

      // Then: socket-1, socket-3의 Producer만 포함 (socket-2 자신 제외)
      expect(producers).toHaveLength(3);
      expect(
        producers.some((p) => p.socketId === "socket-1" && p.producerId === "producer-1-video")
      ).toBe(true);
      expect(
        producers.some((p) => p.socketId === "socket-1" && p.producerId === "producer-1-audio")
      ).toBe(true);
      expect(
        producers.some((p) => p.socketId === "socket-3" && p.producerId === "producer-3-video")
      ).toBe(true);
      // socket-2 자신의 Producer는 포함되지 않음
      expect(producers.some((p) => p.socketId === "socket-2")).toBe(false);
    });

    it("참가자 퇴장 시 Producer 정보도 정리된다", () => {
      // Given: Producer가 있는 사용자
      const roomId = "test-room";
      const socketId = "socket-1";
      roomManager.createRoom(roomId, socketId, "사용자1", 6);
      roomManager.addProducerId(socketId, "producer-1");

      // When: 방 퇴장
      roomManager.leaveRoom(socketId);

      // Then: Producer 정보도 정리됨
      const producerIds = roomManager.getProducerIdsBySocketId(socketId);
      expect(producerIds).toHaveLength(0);
    });

    it("존재하지 않는 socketId의 Producer 조회 시 빈 배열 반환", () => {
      // Given/When
      const producerIds = roomManager.getProducerIdsBySocketId("non-existent");

      // Then
      expect(producerIds).toHaveLength(0);
    });

    it("존재하지 않는 방의 Producer 조회 시 빈 배열 반환", () => {
      // Given/When
      const producers = roomManager.getProducersInRoom("non-existent-room", "socket-1");

      // Then
      expect(producers).toHaveLength(0);
    });
  });
});
