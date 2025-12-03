/**
 * webrtcUtils.js 테스트
 * Jest를 사용한 유틸리티 함수 단위 테스트
 */

// ESM 환경에서 jest 객체 접근
const jestObj = import.meta.jest;

import {
  checkInitializationState,
  cleanupPeer,
  getSignalingState,
  isProcessingSignal,
  isReconnecting,
  logWebRTCEvent,
} from "./webrtcUtils.js";

describe("webrtcUtils", () => {
  describe("cleanupPeer", () => {
    it("should return false if peerConnection is null", () => {
      // Given: Peer connection이 null
      const peerConnection = null;

      // When: cleanupPeer 호출
      const result = cleanupPeer(peerConnection);

      // Then: false 반환
      expect(result).toBe(false);
    });

    it("should destroy peer and return true when peer is not destroyed", () => {
      // Given: 활성 상태의 Peer connection
      const peerConnection = {
        destroyed: false,
        destroy: jestObj.fn(),
      };

      // When: cleanupPeer 호출
      const result = cleanupPeer(peerConnection);

      // Then: destroy 메서드 호출되고 true 반환
      expect(peerConnection.destroy).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it("should not destroy peer if already destroyed", () => {
      // Given: 이미 파괴된 Peer connection
      const peerConnection = {
        destroyed: true,
        destroy: jestObj.fn(),
      };

      // When: cleanupPeer 호출
      const result = cleanupPeer(peerConnection);

      // Then: destroy 메서드 호출되지 않고 true 반환
      expect(peerConnection.destroy).not.toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it("should clear webrtcServiceRef.current.peer if provided", () => {
      // Given: webrtcServiceRef와 활성 Peer connection
      const peerConnection = {
        destroyed: false,
        destroy: jestObj.fn(),
      };
      const webrtcServiceRef = {
        current: {
          peer: peerConnection,
        },
      };

      // When: cleanupPeer 호출
      cleanupPeer(peerConnection, webrtcServiceRef);

      // Then: webrtcServiceRef.current.peer가 null로 설정됨
      expect(webrtcServiceRef.current.peer).toBeNull();
    });

    it("should return false if destroy throws error", () => {
      // Given: destroy 메서드가 에러를 던지는 Peer connection
      const peerConnection = {
        destroyed: false,
        destroy: jestObj.fn(() => {
          throw new Error("Destroy failed");
        }),
      };

      // When: cleanupPeer 호출
      const result = cleanupPeer(peerConnection);

      // Then: false 반환
      expect(result).toBe(false);
    });
  });

  describe("isReconnecting", () => {
    it("should return false if reconnectionState is null", () => {
      // Given: reconnectionState가 null
      const reconnectionState = null;

      // When: isReconnecting 호출
      const result = isReconnecting(reconnectionState);

      // Then: false 반환
      expect(result).toBe(false);
    });

    it("should return true if isReconnecting is true", () => {
      // Given: isReconnecting이 true인 상태
      const reconnectionState = {
        isReconnecting: true,
        isRemoteReconnecting: false,
      };

      // When: isReconnecting 호출
      const result = isReconnecting(reconnectionState);

      // Then: true 반환
      expect(result).toBe(true);
    });

    it("should return true if isRemoteReconnecting is true", () => {
      // Given: isRemoteReconnecting이 true인 상태
      const reconnectionState = {
        isReconnecting: false,
        isRemoteReconnecting: true,
      };

      // When: isReconnecting 호출
      const result = isReconnecting(reconnectionState);

      // Then: true 반환
      expect(result).toBe(true);
    });

    it("should return false if both flags are false", () => {
      // Given: 모든 플래그가 false인 상태
      const reconnectionState = {
        isReconnecting: false,
        isRemoteReconnecting: false,
      };

      // When: isReconnecting 호출
      const result = isReconnecting(reconnectionState);

      // Then: false 반환
      expect(result).toBe(false);
    });
  });

  describe("isProcessingSignal", () => {
    it("should return false if signalState is null", () => {
      // Given: signalState가 null
      const signalState = null;

      // When: isProcessingSignal 호출
      const result = isProcessingSignal(signalState);

      // Then: false 반환
      expect(result).toBe(false);
    });

    it("should return true if isProcessingSignal is true", () => {
      // Given: isProcessingSignal이 true인 상태
      const signalState = {
        isProcessingSignal: true,
      };

      // When: isProcessingSignal 호출
      const result = isProcessingSignal(signalState);

      // Then: true 반환
      expect(result).toBe(true);
    });

    it("should return false if isProcessingSignal is false", () => {
      // Given: isProcessingSignal이 false인 상태
      const signalState = {
        isProcessingSignal: false,
      };

      // When: isProcessingSignal 호출
      const result = isProcessingSignal(signalState);

      // Then: false 반환
      expect(result).toBe(false);
    });
  });

  describe("checkInitializationState", () => {
    it("should return canInitialize: false if initState is null", () => {
      // Given: initState가 null
      const initState = null;

      // When: checkInitializationState 호출
      const result = checkInitializationState(initState);

      // Then: canInitialize가 false이고 이유가 있음
      expect(result.canInitialize).toBe(false);
      expect(result.reason).toBe("initState가 없습니다");
    });

    it("should return canInitialize: false if already initialized", () => {
      // Given: 이미 초기화된 상태
      const initState = {
        hasInitialized: true,
        isInitializing: false,
      };

      // When: checkInitializationState 호출
      const result = checkInitializationState(initState);

      // Then: canInitialize가 false
      expect(result.canInitialize).toBe(false);
      expect(result.reason).toBe("WebRTC가 이미 초기화되었습니다");
    });

    it("should return canInitialize: false if currently initializing", () => {
      // Given: 초기화 진행 중인 상태
      const initState = {
        hasInitialized: false,
        isInitializing: true,
      };

      // When: checkInitializationState 호출
      const result = checkInitializationState(initState);

      // Then: canInitialize가 false
      expect(result.canInitialize).toBe(false);
      expect(result.reason).toBe("WebRTC 초기화가 이미 진행 중입니다");
    });

    it("should return canInitialize: true if ready to initialize", () => {
      // Given: 초기화 가능한 상태
      const initState = {
        hasInitialized: false,
        isInitializing: false,
      };

      // When: checkInitializationState 호출
      const result = checkInitializationState(initState);

      // Then: canInitialize가 true
      expect(result.canInitialize).toBe(true);
      expect(result.reason).toBeNull();
    });
  });

  describe("getSignalingState", () => {
    it("should return null if peer is null", () => {
      // Given: peer가 null
      const peer = null;

      // When: getSignalingState 호출
      const result = getSignalingState(peer);

      // Then: null 반환
      expect(result).toBeNull();
    });

    it("should return null if peer._pc is null", () => {
      // Given: peer._pc가 없는 peer
      const peer = {};

      // When: getSignalingState 호출
      const result = getSignalingState(peer);

      // Then: null 반환
      expect(result).toBeNull();
    });

    it("should return signalingState if available", () => {
      // Given: signalingState를 가진 peer
      const peer = {
        _pc: {
          signalingState: "stable",
        },
      };

      // When: getSignalingState 호출
      const result = getSignalingState(peer);

      // Then: 'stable' 반환
      expect(result).toBe("stable");
    });

    it("should return null if signalingState is undefined", () => {
      // Given: signalingState가 undefined인 peer
      const peer = {
        _pc: {},
      };

      // When: getSignalingState 호출
      const result = getSignalingState(peer);

      // Then: null 반환
      expect(result).toBeNull();
    });
  });

  describe("logWebRTCEvent", () => {
    let consoleSpy;

    beforeEach(() => {
      consoleSpy = jestObj.spyOn(console, "log").mockImplementation(() => {});
    });

    afterEach(() => {
      consoleSpy.mockRestore();
    });

    it("should log offer event", () => {
      // Given: offer 이벤트 정보
      const details = {
        direction: "송신",
        myNickname: "사용자1",
        targetNickname: "사용자2",
      };

      // When: logWebRTCEvent 호출
      logWebRTCEvent("offer", details);

      // Then: console.log 호출됨
      expect(consoleSpy).toHaveBeenCalled();
      expect(consoleSpy.mock.calls[0][0]).toContain("OFFER");
      expect(consoleSpy.mock.calls[0][0]).toContain("사용자1");
      expect(consoleSpy.mock.calls[0][0]).toContain("사용자2");
    });

    it("should log reconnecting event", () => {
      // Given: reconnecting 이벤트 정보
      const details = {
        handler: "reconnectMedia",
        extra: "추가 정보",
      };

      // When: logWebRTCEvent 호출
      logWebRTCEvent("reconnecting", details);

      // Then: console.log 호출됨
      expect(consoleSpy).toHaveBeenCalled();
      expect(consoleSpy.mock.calls[0][0]).toContain("재연결 시작");
    });

    it("should log initialize event", () => {
      // Given: initialize 이벤트 정보
      const details = {
        role: "발신자(Offer 생성)",
        initiator: true,
        targetSocketId: "socket123",
      };

      // When: logWebRTCEvent 호출
      logWebRTCEvent("initialize", details);

      // Then: console.log 호출됨
      expect(consoleSpy).toHaveBeenCalled();
      expect(consoleSpy.mock.calls[0][0]).toContain("WebRTC 초기화 시작");
      expect(consoleSpy.mock.calls[0][0]).toContain("socket123");
    });

    it("should log default event", () => {
      // Given: 알 수 없는 이벤트
      const details = { info: "test" };

      // When: logWebRTCEvent 호출
      logWebRTCEvent("unknown", details);

      // Then: console.log 호출됨
      expect(consoleSpy).toHaveBeenCalledWith("[WebRTC Event] unknown:", details);
    });
  });
});
