/**
 * Socket 이벤트 핸들러 테스트
 */

// ESM 환경에서 jest 객체 접근
const jestObj = import.meta.jest;

import RoomManager from "../managers/RoomManager.js";
import registerSocketHandlers from "./socketHandler.js";

describe("Socket 이벤트 핸들러", () => {
  let mockIo;
  let mockSocket;
  let roomManager;

  beforeEach(() => {
    // RoomManager 인스턴스 생성
    roomManager = new RoomManager();

    // Mock Socket.io 서버
    mockIo = {
      to: jestObj.fn().mockReturnThis(),
      emit: jestObj.fn(),
    };

    // Mock Socket
    mockSocket = {
      id: "socket-123",
      on: jestObj.fn(),
      emit: jestObj.fn(),
      join: jestObj.fn(),
      leave: jestObj.fn(),
      to: jestObj.fn().mockReturnThis(),
    };
  });

  afterEach(() => {
    // RoomManager 리소스 정리
    if (roomManager) {
      roomManager.cleanup();
    }
  });

  describe("room:join 이벤트", () => {
    it("유효한 방 ID로 참가하면 성공 응답을 보낸다", () => {
      // Given: Socket 핸들러가 등록됨
      registerSocketHandlers(mockIo, mockSocket, roomManager);
      const joinHandler = mockSocket.on.mock.calls.find((call) => call[0] === "room:join")[1];

      // When: 방 참가 이벤트 발생
      joinHandler({ roomId: "room-1", nickname: "테스트유저" });

      // Then: 성공 응답 전송
      expect(mockSocket.join).toHaveBeenCalledWith("room-1");
      expect(mockSocket.emit).toHaveBeenCalledWith(
        "room:joined",
        expect.objectContaining({
          roomId: "room-1",
          participants: [],
        })
      );
    });

    it("방 정원이 초과되면 room:full 이벤트를 보낸다", () => {
      // Given: 이미 6명이 참가한 방 (최대 인원)
      roomManager.createRoom("room-1", "host-socket");
      roomManager.joinRoom("room-1", "user-1", "유저1");
      roomManager.joinRoom("room-1", "user-2", "유저2");
      roomManager.joinRoom("room-1", "user-3", "유저3");
      roomManager.joinRoom("room-1", "user-4", "유저4");
      roomManager.joinRoom("room-1", "user-5", "유저5");

      registerSocketHandlers(mockIo, mockSocket, roomManager);
      const joinHandler = mockSocket.on.mock.calls.find((call) => call[0] === "room:join")[1];

      // When: 7번째 참가자가 입장 시도
      joinHandler({ roomId: "room-1", nickname: "유저6" });

      // Then: room:full 이벤트 전송
      expect(mockSocket.emit).toHaveBeenCalledWith("room:full", {
        currentSize: 6,
        maxSize: 6,
      });
      expect(mockSocket.join).not.toHaveBeenCalled();
    });

    it("유효하지 않은 방 ID로 참가하면 에러를 보낸다", () => {
      // Given: Socket 핸들러가 등록됨
      registerSocketHandlers(mockIo, mockSocket, roomManager);
      const joinHandler = mockSocket.on.mock.calls.find((call) => call[0] === "room:join")[1];

      // When: 유효하지 않은 방 ID로 참가 시도
      joinHandler({ roomId: null });

      // Then: 에러 응답 전송
      expect(mockSocket.emit).toHaveBeenCalledWith(
        "error",
        expect.objectContaining({
          message: "잘못된 요청 형식입니다",
        })
      );
    });
  });

  describe("room:leave 이벤트", () => {
    it("방에서 나가면 참가자가 제거되고 알림이 전송된다", () => {
      // Given: 호스트가 방을 생성한 상태
      roomManager.createRoom("room-1", mockSocket.id);
      registerSocketHandlers(mockIo, mockSocket, roomManager);
      const leaveHandler = mockSocket.on.mock.calls.find((call) => call[0] === "room:leave")[1];

      // When: 방 퇴장 이벤트 발생
      leaveHandler({ roomId: "room-1" });

      // Then: 소켓에서 방 나가기 및 방 삭제 (호스트가 나가서 빈 방이 됨)
      expect(mockSocket.leave).toHaveBeenCalledWith("room-1");
      expect(roomManager.getRoomInfo("room-1")).toBeNull();
    });
  });

  describe("signal:offer 이벤트", () => {
    it("offer를 대상 소켓에게 중계한다", () => {
      // Given: Socket 핸들러가 등록됨
      registerSocketHandlers(mockIo, mockSocket, roomManager);
      const offerHandler = mockSocket.on.mock.calls.find((call) => call[0] === "signal:offer")[1];

      // When: offer 이벤트 발생
      const offerData = {
        to: "target-socket",
        signal: { type: "offer", sdp: "mock-sdp" },
      };
      offerHandler(offerData);

      // Then: 대상 소켓에게 offer 전달
      expect(mockIo.to).toHaveBeenCalledWith("target-socket");
      expect(mockIo.emit).toHaveBeenCalledWith("signal:offer", {
        from: mockSocket.id,
        signal: offerData.signal,
      });
    });

    it("유효하지 않은 데이터로 호출하면 에러를 보낸다", () => {
      // Given: Socket 핸들러가 등록됨
      registerSocketHandlers(mockIo, mockSocket, roomManager);
      const offerHandler = mockSocket.on.mock.calls.find((call) => call[0] === "signal:offer")[1];

      // When: 유효하지 않은 데이터로 호출
      offerHandler({ to: "target" }); // signal 누락

      // Then: 에러 응답 전송
      expect(mockSocket.emit).toHaveBeenCalledWith("error", {
        message: "잘못된 시그널 데이터",
      });
    });
  });

  describe("signal:answer 이벤트", () => {
    it("answer를 대상 소켓에게 중계한다", () => {
      // Given: Socket 핸들러가 등록됨
      registerSocketHandlers(mockIo, mockSocket, roomManager);
      const answerHandler = mockSocket.on.mock.calls.find((call) => call[0] === "signal:answer")[1];

      // When: answer 이벤트 발생
      const answerData = {
        to: "target-socket",
        signal: { type: "answer", sdp: "mock-sdp" },
      };
      answerHandler(answerData);

      // Then: 대상 소켓에게 answer 전달
      expect(mockIo.to).toHaveBeenCalledWith("target-socket");
      expect(mockIo.emit).toHaveBeenCalledWith("signal:answer", {
        from: mockSocket.id,
        signal: answerData.signal,
      });
    });
  });

  describe("signal:ice-candidate 이벤트", () => {
    it("ICE candidate를 대상 소켓에게 중계한다", () => {
      // Given: Socket 핸들러가 등록됨
      registerSocketHandlers(mockIo, mockSocket, roomManager);
      const iceHandler = mockSocket.on.mock.calls.find(
        (call) => call[0] === "signal:ice-candidate"
      )[1];

      // When: ICE candidate 이벤트 발생
      const iceData = {
        to: "target-socket",
        candidate: { candidate: "mock-candidate" },
      };
      iceHandler(iceData);

      // Then: 대상 소켓에게 ICE candidate 전달
      expect(mockIo.to).toHaveBeenCalledWith("target-socket");
      expect(mockIo.emit).toHaveBeenCalledWith("signal:ice-candidate", {
        from: mockSocket.id,
        candidate: iceData.candidate,
      });
    });
  });

  describe("whiteboard:event 이벤트", () => {
    it("화이트보드 이벤트를 방의 다른 참가자들에게 중계한다", () => {
      // Given: 호스트로 방을 생성한 상태
      roomManager.createRoom("room-1", mockSocket.id);
      registerSocketHandlers(mockIo, mockSocket, roomManager);
      const whiteboardHandler = mockSocket.on.mock.calls.find(
        (call) => call[0] === "whiteboard:event"
      )[1];

      // When: 화이트보드 이벤트 발생
      const eventData = {
        roomId: "room-1",
        event: {
          type: "path:created",
          data: { x: 100, y: 200 },
        },
      };
      whiteboardHandler(eventData);

      // Then: 방의 다른 참가자들에게 이벤트 중계
      expect(mockSocket.to).toHaveBeenCalledWith("room-1");
      expect(mockSocket.emit).toHaveBeenCalledWith("whiteboard:event", {
        roomId: "room-1",
        from: mockSocket.id,
        event: eventData.event,
      });
    });

    it("유효하지 않은 데이터로 호출하면 에러를 보낸다", () => {
      // Given: 호스트로 방을 생성한 상태
      roomManager.createRoom("room-1", mockSocket.id);
      registerSocketHandlers(mockIo, mockSocket, roomManager);
      const whiteboardHandler = mockSocket.on.mock.calls.find(
        (call) => call[0] === "whiteboard:event"
      )[1];

      // When: 유효하지 않은 데이터로 호출
      whiteboardHandler({ roomId: "room-1" }); // event 누락

      // Then: 에러 응답 전송
      expect(mockSocket.emit).toHaveBeenCalledWith("error", {
        message: "잘못된 화이트보드 이벤트 데이터",
      });
    });
  });

  describe("disconnect 이벤트", () => {
    it("연결이 끊어지면 자동으로 방에서 제거된다", () => {
      // Given: 방에 참가한 상태
      registerSocketHandlers(mockIo, mockSocket, roomManager);
      const joinHandler = mockSocket.on.mock.calls.find((call) => call[0] === "room:join")[1];
      joinHandler({ roomId: "room-1" });

      // When: 연결 해제
      const disconnectHandler = mockSocket.on.mock.calls.find(
        (call) => call[0] === "disconnect"
      )[1];
      disconnectHandler("client disconnect");

      // Then: 방에서 제거됨
      expect(roomManager.getRoomParticipants("room-1")).toHaveLength(0);
    });
  });
});
