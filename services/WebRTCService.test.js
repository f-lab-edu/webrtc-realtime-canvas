/**
 * WebRTCService 테스트
 * P2P Mesh 다중 Peer 지원 기능 테스트
 */
import { describe, it, expect, beforeEach, jest } from "@jest/globals";

// SimplePeer 모킹 - 모듈 레벨에서 완전히 교체
const mockSimplePeer = jest.fn();
jest.unstable_mockModule("simple-peer", () => ({
  default: mockSimplePeer,
}));

// 모킹 후 WebRTCService import
const { default: WebRTCService } = await import("./WebRTCService.js");

// SimplePeer 모킹 팩토리
function createMockPeer(config) {
  const eventHandlers = {};
  const mockPeer = {
    _pc: {
      connectionState: "new",
      iceConnectionState: "new",
      getSenders: jest.fn(() => []),
      oniceconnectionstatechange: null,
      onconnectionstatechange: null,
    },
    signal: jest.fn(),
    destroy: jest.fn(),
    on: jest.fn((event, handler) => {
      eventHandlers[event] = handler;
    }),
    // 테스트용 헬퍼: 이벤트 수동 트리거
    _emit: (event, ...args) => {
      if (eventHandlers[event]) {
        eventHandlers[event](...args);
      }
    },
    _config: config,
  };
  return mockPeer;
}

describe("WebRTCService - P2P Mesh 지원", () => {
  let service;

  beforeEach(() => {
    service = new WebRTCService();
    jest.clearAllMocks();
    // SimplePeer 모킹 구현 설정
    mockSimplePeer.mockImplementation(createMockPeer);
  });

  describe("Peer 초기화", () => {
    it("initializePeer로 새로운 Peer를 생성할 수 있다", () => {
      // Given
      const socketId = "peer-1";
      const mockStream = { getAudioTracks: () => [], getVideoTracks: () => [] };

      // When
      service.initializePeer(socketId, true, mockStream);

      // Then
      expect(service.hasPeer(socketId)).toBe(true);
      expect(service.getPeerCount()).toBe(1);
    });

    it("다중 Peer를 생성할 수 있다", () => {
      // Given
      const mockStream = { getAudioTracks: () => [], getVideoTracks: () => [] };

      // When
      service.initializePeer("peer-1", true, mockStream);
      service.initializePeer("peer-2", false, mockStream);
      service.initializePeer("peer-3", false, mockStream);

      // Then
      expect(service.getPeerCount()).toBe(3);
      expect(service.getPeerIds()).toEqual(["peer-1", "peer-2", "peer-3"]);
    });

    it("기존 Peer가 있으면 재생성한다", () => {
      // Given
      const mockStream = { getAudioTracks: () => [], getVideoTracks: () => [] };
      service.initializePeer("peer-1", true, mockStream);
      const firstPeer = service.peers.get("peer-1");

      // When
      service.initializePeer("peer-1", false, mockStream);
      const secondPeer = service.peers.get("peer-1");

      // Then
      expect(firstPeer.destroy).toHaveBeenCalled();
      expect(secondPeer).not.toBe(firstPeer);
      expect(service.getPeerCount()).toBe(1);
    });
  });

  describe("시그널 처리 및 Early Candidates", () => {
    it("Peer 존재 시 시그널을 즉시 전달한다", () => {
      // Given
      const mockStream = { getAudioTracks: () => [], getVideoTracks: () => [] };
      service.initializePeer("peer-1", true, mockStream);
      const peer = service.peers.get("peer-1");
      const signalData = { type: "offer", sdp: "mock-sdp" };

      // When
      service.signal("peer-1", signalData);

      // Then
      expect(peer.signal).toHaveBeenCalledWith(signalData);
    });

    it("Peer 미존재 시 pendingSignals에 큐잉한다 (Early Candidates)", () => {
      // Given
      const signalData1 = { type: "offer", sdp: "mock-sdp" };
      const signalData2 = { type: "candidate", candidate: "mock-candidate-1" };
      const signalData3 = { type: "candidate", candidate: "mock-candidate-2" };

      // When: Peer 생성 전 시그널 수신
      service.signal("peer-1", signalData1);
      service.signal("peer-1", signalData2);
      service.signal("peer-1", signalData3);

      // Then: pendingSignals에 큐잉됨
      expect(service.pendingSignals.has("peer-1")).toBe(true);
      expect(service.pendingSignals.get("peer-1")).toHaveLength(3);
      expect(service.pendingSignals.get("peer-1")).toEqual([signalData1, signalData2, signalData3]);
    });

    it("Peer 생성 후 pendingSignals를 flush한다", () => {
      // Given: Peer 생성 전 시그널 3개 큐잉
      const signalData1 = { type: "offer", sdp: "mock-sdp" };
      const signalData2 = { type: "candidate", candidate: "mock-candidate-1" };
      const signalData3 = { type: "candidate", candidate: "mock-candidate-2" };

      service.signal("peer-1", signalData1);
      service.signal("peer-1", signalData2);
      service.signal("peer-1", signalData3);

      const mockStream = { getAudioTracks: () => [], getVideoTracks: () => [] };

      // When: Peer 생성 (initializePeer 내부에서 flushPendingSignals 호출)
      service.initializePeer("peer-1", false, mockStream);
      const peer = service.peers.get("peer-1");

      // Then: 큐에 쌓인 시그널이 순차적으로 처리됨
      expect(peer.signal).toHaveBeenCalledTimes(3);
      expect(peer.signal).toHaveBeenNthCalledWith(1, signalData1);
      expect(peer.signal).toHaveBeenNthCalledWith(2, signalData2);
      expect(peer.signal).toHaveBeenNthCalledWith(3, signalData3);

      // 큐 초기화 확인
      expect(service.pendingSignals.has("peer-1")).toBe(false);
    });

    it("pendingSignals 큐 순서가 보장된다", () => {
      // Given
      const signals = [
        { type: "offer", sdp: "mock-sdp" },
        { type: "candidate", candidate: "candidate-1" },
        { type: "candidate", candidate: "candidate-2" },
        { type: "candidate", candidate: "candidate-3" },
        { type: "answer", sdp: "mock-answer-sdp" },
      ];

      // When: 순차적으로 큐잉
      for (const signal of signals) {
        service.signal("peer-1", signal);
      }

      const mockStream = { getAudioTracks: () => [], getVideoTracks: () => [] };
      service.initializePeer("peer-1", false, mockStream);
      const peer = service.peers.get("peer-1");

      // Then: 큐잉 순서대로 처리됨
      expect(peer.signal).toHaveBeenCalledTimes(5);
      for (let i = 0; i < signals.length; i++) {
        expect(peer.signal).toHaveBeenNthCalledWith(i + 1, signals[i]);
      }
    });

    it("빈 큐를 flush해도 에러가 발생하지 않는다", () => {
      // Given
      const mockStream = { getAudioTracks: () => [], getVideoTracks: () => [] };
      service.initializePeer("peer-1", true, mockStream);

      // When: 빈 큐 flush (initializePeer 내부에서 자동 호출)
      // Then: 에러 없이 정상 처리됨
      expect(service.hasPeer("peer-1")).toBe(true);
    });
  });

  describe("ICE 상태 모니터링", () => {
    it("ICE 상태 변화 시 콜백이 호출된다", () => {
      // Given
      const mockStream = { getAudioTracks: () => [], getVideoTracks: () => [] };
      const iceStateChangeHandler = jest.fn();
      service.onIceStateChange(iceStateChangeHandler);

      service.initializePeer("peer-1", true, mockStream);
      const peer = service.peers.get("peer-1");

      // When: signal 이벤트 발생 (모니터링 설정 트리거)
      peer._emit("signal", { type: "offer", sdp: "mock-sdp" });

      // ICE 상태 변화 시뮬레이션
      peer._pc.iceConnectionState = "checking";
      peer._pc.oniceconnectionstatechange();

      // Then
      expect(iceStateChangeHandler).toHaveBeenCalledWith("peer-1", "checking");
    });

    it("여러 Peer의 ICE 상태를 독립적으로 모니터링한다", () => {
      // Given
      const mockStream = { getAudioTracks: () => [], getVideoTracks: () => [] };
      const iceStateChangeHandler = jest.fn();
      service.onIceStateChange(iceStateChangeHandler);

      service.initializePeer("peer-1", true, mockStream);
      service.initializePeer("peer-2", true, mockStream);

      const peer1 = service.peers.get("peer-1");
      const peer2 = service.peers.get("peer-2");

      // When: 각 Peer의 signal 이벤트 발생 (모니터링 설정)
      peer1._emit("signal", { type: "offer", sdp: "mock-sdp-1" });
      peer2._emit("signal", { type: "offer", sdp: "mock-sdp-2" });

      // 각각 다른 ICE 상태로 변경
      peer1._pc.iceConnectionState = "checking";
      peer1._pc.oniceconnectionstatechange();

      peer2._pc.iceConnectionState = "connected";
      peer2._pc.oniceconnectionstatechange();

      // Then
      expect(iceStateChangeHandler).toHaveBeenCalledWith("peer-1", "checking");
      expect(iceStateChangeHandler).toHaveBeenCalledWith("peer-2", "connected");
      expect(iceStateChangeHandler).toHaveBeenCalledTimes(2);
    });
  });

  describe("Peer 제거 및 리소스 정리", () => {
    it("removePeer로 특정 Peer를 제거할 수 있다", () => {
      // Given
      const mockStream = { getAudioTracks: () => [], getVideoTracks: () => [] };
      service.initializePeer("peer-1", true, mockStream);
      service.initializePeer("peer-2", false, mockStream);
      service.initializePeer("peer-3", false, mockStream);

      const peer1 = service.peers.get("peer-1");

      // When
      service.removePeer("peer-1");

      // Then
      expect(peer1.destroy).toHaveBeenCalled();
      expect(service.hasPeer("peer-1")).toBe(false);
      expect(service.getPeerCount()).toBe(2);
      expect(service.getPeerIds()).toEqual(["peer-2", "peer-3"]);
    });

    it("removePeer는 try-finally 패턴으로 리소스 정리를 보장한다", () => {
      // Given
      const mockStream = { getAudioTracks: () => [], getVideoTracks: () => [] };
      service.initializePeer("peer-1", true, mockStream);

      const peer = service.peers.get("peer-1");
      peer.destroy.mockImplementation(() => {
        throw new Error("destroy error");
      });

      // When: destroy에서 에러 발생
      service.removePeer("peer-1");

      // Then: 에러 발생해도 Map에서 제거됨
      expect(service.hasPeer("peer-1")).toBe(false);
      expect(service.pendingSignals.has("peer-1")).toBe(false);
    });

    it("removePeer는 pendingSignals도 정리한다", () => {
      // Given: pendingSignals에 큐잉된 상태
      service.signal("peer-1", { type: "offer", sdp: "mock-sdp" });
      expect(service.pendingSignals.has("peer-1")).toBe(true);

      const mockStream = { getAudioTracks: () => [], getVideoTracks: () => [] };
      service.initializePeer("peer-1", true, mockStream);

      // 새로운 시그널 큐잉 (테스트용)
      service.pendingSignals.set("peer-1", [{ type: "candidate" }]);

      // When
      service.removePeer("peer-1");

      // Then
      expect(service.pendingSignals.has("peer-1")).toBe(false);
    });

    it("destroyAll로 모든 Peer를 정리할 수 있다", () => {
      // Given
      const mockStream = { getAudioTracks: () => [], getVideoTracks: () => [] };
      service.initializePeer("peer-1", true, mockStream);
      service.initializePeer("peer-2", false, mockStream);
      service.initializePeer("peer-3", false, mockStream);

      const peer1 = service.peers.get("peer-1");
      const peer2 = service.peers.get("peer-2");
      const peer3 = service.peers.get("peer-3");

      // When
      service.destroyAll();

      // Then
      expect(peer1.destroy).toHaveBeenCalled();
      expect(peer2.destroy).toHaveBeenCalled();
      expect(peer3.destroy).toHaveBeenCalled();
      expect(service.getPeerCount()).toBe(0);
      expect(service.localStream).toBeNull();
    });
  });

  describe("이벤트 핸들러", () => {
    it("시그널 핸들러가 socketId와 함께 호출된다", () => {
      // Given
      const mockStream = { getAudioTracks: () => [], getVideoTracks: () => [] };
      const signalHandler = jest.fn();
      service.onSignal(signalHandler);

      service.initializePeer("peer-1", true, mockStream);
      const peer = service.peers.get("peer-1");

      // When
      const mockSignal = { type: "offer", sdp: "mock-sdp" };
      peer._emit("signal", mockSignal);

      // Then
      expect(signalHandler).toHaveBeenCalledWith("peer-1", mockSignal);
    });

    it("스트림 핸들러가 socketId와 함께 호출된다", () => {
      // Given
      const mockStream = { getAudioTracks: () => [], getVideoTracks: () => [] };
      const streamHandler = jest.fn();
      service.onStream(streamHandler);

      service.initializePeer("peer-1", false, mockStream);
      const peer = service.peers.get("peer-1");

      // When
      const remoteStream = {
        id: "remote-stream-1",
        active: true,
        getAudioTracks: () => [{ label: "audio", id: "audio-1", enabled: true, muted: false }],
        getVideoTracks: () => [{ label: "video", id: "video-1", enabled: true, muted: false }],
      };
      peer._emit("stream", remoteStream);

      // Then
      expect(streamHandler).toHaveBeenCalledWith("peer-1", remoteStream);
    });

    it("에러 핸들러가 socketId와 함께 호출된다", () => {
      // Given
      const mockStream = { getAudioTracks: () => [], getVideoTracks: () => [] };
      const errorHandler = jest.fn();
      service.onError(errorHandler);

      service.initializePeer("peer-1", true, mockStream);
      const peer = service.peers.get("peer-1");

      // When
      const mockError = new Error("WebRTC error");
      peer._emit("error", mockError);

      // Then
      expect(errorHandler).toHaveBeenCalledWith("peer-1", mockError);
    });

    it("연결 종료 핸들러가 socketId와 함께 호출된다", () => {
      // Given
      const mockStream = { getAudioTracks: () => [], getVideoTracks: () => [] };
      const closeHandler = jest.fn();
      service.onClose(closeHandler);

      service.initializePeer("peer-1", true, mockStream);
      const peer = service.peers.get("peer-1");

      // When
      peer._emit("close");

      // Then
      expect(closeHandler).toHaveBeenCalledWith("peer-1");
    });

    it("연결 성공 핸들러가 socketId와 함께 호출된다", () => {
      // Given
      const mockStream = { getAudioTracks: () => [], getVideoTracks: () => [] };
      const connectHandler = jest.fn();
      service.onConnect(connectHandler);

      service.initializePeer("peer-1", true, mockStream);
      const peer = service.peers.get("peer-1");

      // When
      peer._emit("connect");

      // Then
      expect(connectHandler).toHaveBeenCalledWith("peer-1");
    });
  });

  describe("트랙 교체 (화면 공유)", () => {
    it("replaceTrack으로 모든 Peer의 트랙을 교체할 수 있다", () => {
      // Given
      const mockStream = { getAudioTracks: () => [], getVideoTracks: () => [] };
      service.initializePeer("peer-1", true, mockStream);
      service.initializePeer("peer-2", true, mockStream);

      const peer1 = service.peers.get("peer-1");
      const peer2 = service.peers.get("peer-2");

      const mockSender1 = { track: { kind: "video" }, replaceTrack: jest.fn() };
      const mockSender2 = { track: { kind: "video" }, replaceTrack: jest.fn() };

      peer1._pc.getSenders.mockReturnValue([mockSender1]);
      peer2._pc.getSenders.mockReturnValue([mockSender2]);

      const newTrack = { kind: "video", label: "screen-share" };

      // When
      service.replaceTrack(newTrack);

      // Then
      expect(mockSender1.replaceTrack).toHaveBeenCalledWith(newTrack);
      expect(mockSender2.replaceTrack).toHaveBeenCalledWith(newTrack);
    });

    it("Sender가 없는 Peer는 스킵한다", () => {
      // Given
      const mockStream = { getAudioTracks: () => [], getVideoTracks: () => [] };
      service.initializePeer("peer-1", true, mockStream);

      const peer = service.peers.get("peer-1");
      peer._pc.getSenders.mockReturnValue([]); // Sender 없음

      const newTrack = { kind: "video", label: "screen-share" };

      // When & Then: 에러 없이 처리됨
      expect(() => service.replaceTrack(newTrack)).not.toThrow();
    });
  });

  describe("유틸리티 메서드", () => {
    it("getPeerCount로 연결된 Peer 수를 확인할 수 있다", () => {
      // Given
      const mockStream = { getAudioTracks: () => [], getVideoTracks: () => [] };

      // When & Then
      expect(service.getPeerCount()).toBe(0);

      service.initializePeer("peer-1", true, mockStream);
      expect(service.getPeerCount()).toBe(1);

      service.initializePeer("peer-2", false, mockStream);
      expect(service.getPeerCount()).toBe(2);

      service.removePeer("peer-1");
      expect(service.getPeerCount()).toBe(1);
    });

    it("getPeerIds로 모든 Peer ID를 가져올 수 있다", () => {
      // Given
      const mockStream = { getAudioTracks: () => [], getVideoTracks: () => [] };
      service.initializePeer("peer-1", true, mockStream);
      service.initializePeer("peer-2", false, mockStream);
      service.initializePeer("peer-3", false, mockStream);

      // When
      const peerIds = service.getPeerIds();

      // Then
      expect(peerIds).toEqual(["peer-1", "peer-2", "peer-3"]);
    });

    it("hasPeer로 Peer 존재 여부를 확인할 수 있다", () => {
      // Given
      const mockStream = { getAudioTracks: () => [], getVideoTracks: () => [] };
      service.initializePeer("peer-1", true, mockStream);

      // When & Then
      expect(service.hasPeer("peer-1")).toBe(true);
      expect(service.hasPeer("peer-2")).toBe(false);
    });

    it("getConnectionState로 특정 Peer의 연결 상태를 확인할 수 있다", () => {
      // Given
      const mockStream = { getAudioTracks: () => [], getVideoTracks: () => [] };
      service.initializePeer("peer-1", true, mockStream);

      const peer = service.peers.get("peer-1");
      peer._pc.connectionState = "connected";

      // When
      const state = service.getConnectionState("peer-1");

      // Then
      expect(state).toBe("connected");
    });

    it("getIceConnectionState로 특정 Peer의 ICE 상태를 확인할 수 있다", () => {
      // Given
      const mockStream = { getAudioTracks: () => [], getVideoTracks: () => [] };
      service.initializePeer("peer-1", true, mockStream);

      const peer = service.peers.get("peer-1");
      peer._pc.iceConnectionState = "checking";

      // When
      const state = service.getIceConnectionState("peer-1");

      // Then
      expect(state).toBe("checking");
    });
  });
});
