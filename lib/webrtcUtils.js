/**
 * WebRTC 유틸리티 함수 모음
 * useWebRTC 훅에서 사용되는 공통 로직을 추출
 */

/**
 * Peer 연결 정리 유틸리티
 * @param {Object} peerConnection - SimplePeer 인스턴스
 * @param {Object} webrtcServiceRef - WebRTCService ref (선택적)
 * @returns {boolean} 정리 성공 여부
 */
export const cleanupPeer = (peerConnection, webrtcServiceRef = null) => {
  if (!peerConnection) {
    return false;
  }

  try {
    if (!peerConnection.destroyed) {
      peerConnection.destroy();
      console.log("✅ Peer destroyed");
    }

    // webrtcServiceRef가 제공되면 peer 참조 제거
    if (webrtcServiceRef) {
      webrtcServiceRef.current.peer = null;
    }

    return true;
  } catch (error) {
    console.error("Peer 정리 중 오류:", error);
    return false;
  }
};

/**
 * WebRTC 이벤트 로깅 유틸리티
 * @param {string} eventType - 이벤트 타입 ('offer' | 'answer' | 'candidate' | 'reconnecting' | 'reconnected' | 'initialize')
 * @param {Object} details - 로그 상세 정보
 */
export const logWebRTCEvent = (eventType, details) => {
  const timestamp = new Date().toISOString();

  switch (eventType) {
    case "offer":
    case "answer":
    case "candidate":
      console.log(
        `[${details.direction || "송수신"}] [${details.myNickname || "알 수 없음"}] ` +
          `${eventType.toUpperCase()} ${details.direction === "송신" ? "->" : "<-"} ` +
          `${details.targetNickname || "알 수 없음"}`
      );
      break;

    case "reconnecting":
      console.log(
        `\n========== [${details.handler || "reconnectMedia"}] 재연결 시작 ==========\n` +
          `⏰ 타임스탬프: ${timestamp}\n` +
          `${details.extra || ""}`
      );
      break;

    case "reconnected":
      console.log(
        `\n========== [${details.handler || "handleMediaReconnected"}] 재연결 완료 ==========\n` +
          `⏰ 수신 타임스탬프: ${timestamp}\n` +
          `👤 발신자: ${details.from || "알 수 없음"}`
      );
      break;

    case "initialize":
      console.log(
        `[initializeWebRTC] 🚀 WebRTC 초기화 시작\n` +
          `  - 역할: ${details.role}\n` +
          `  - initiator: ${details.initiator}\n` +
          `  - 대상 소켓: ${details.targetSocketId}\n` +
          `  - 타임스탬프: ${timestamp}`
      );
      break;

    default:
      console.log(`[WebRTC Event] ${eventType}:`, details);
  }
};

/**
 * 재연결 상태 체크 유틸리티
 * @param {Object} reconnectionState - 재연결 상태 객체 { isReconnecting, isRemoteReconnecting }
 * @returns {boolean} 재연결 중 여부
 */
export const isReconnecting = (reconnectionState) => {
  if (!reconnectionState) return false;

  return reconnectionState.isReconnecting || reconnectionState.isRemoteReconnecting;
};

/**
 * 시그널 처리 중 체크 유틸리티
 * @param {Object} signalState - 시그널 상태 객체 { isProcessingSignal }
 * @returns {boolean} 시그널 처리 중 여부
 */
export const isProcessingSignal = (signalState) => {
  if (!signalState) return false;

  return signalState.isProcessingSignal;
};

/**
 * 초기화 상태 체크 유틸리티
 * @param {Object} initState - 초기화 상태 객체 { hasInitialized, isInitializing }
 * @returns {Object} 초기화 상태 정보 { canInitialize, reason }
 */
export const checkInitializationState = (initState) => {
  if (!initState) {
    return {
      canInitialize: false,
      reason: "initState가 없습니다",
    };
  }

  if (initState.hasInitialized) {
    return {
      canInitialize: false,
      reason: "WebRTC가 이미 초기화되었습니다",
    };
  }

  if (initState.isInitializing) {
    return {
      canInitialize: false,
      reason: "WebRTC 초기화가 이미 진행 중입니다",
    };
  }

  return {
    canInitialize: true,
    reason: null,
  };
};

/**
 * SimplePeer 시그널링 상태 체크 유틸리티
 * @param {Object} peer - SimplePeer 인스턴스
 * @returns {string|null} 시그널링 상태 ('stable' | 'have-local-offer' | 'have-remote-offer' | null)
 */
export const getSignalingState = (peer) => {
  if (!peer || !peer._pc) {
    return null;
  }

  return peer._pc.signalingState || null;
};
