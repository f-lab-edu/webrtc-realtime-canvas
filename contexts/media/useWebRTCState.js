"use client";

import { useCallback, useState } from "react";

/**
 * useWebRTCState 커스텀 훅
 * WebRTC 재연결 상태 및 초기화 상태 머신을 관리
 *
 * @returns {Object} WebRTC 상태 및 제어 함수
 */
export function useWebRTCState() {
  // ============ WebRTC 재연결 상태 ============
  const [webrtcReconnectionState, setWebrtcReconnectionState] = useState({
    isReconnecting: false, // WebRTC P2P 재연결 진행 중
    isRemoteReconnecting: false, // 상대방 재연결 중
    reconnectTimeout: null, // 재연결 타임아웃 타이머
    targetSocketId: null, // 연결 대상 소켓 ID
  });

  // ============ WebRTC 초기화 상태 머신 ============
  const [webrtcInitState, setWebrtcInitState] = useState({
    status: "idle", // 'idle' | 'initializing' | 'ready' | 'error'
    isProcessingSignal: false, // 시그널 처리 중
    pendingOffer: null, // 대기 중인 Offer
    pendingConnection: null, // 대기 중인 연결 정보 { targetSocketId, asInitiator }
  });

  // ============ 재연결 관련 함수 ============

  /**
   * WebRTC 재연결 시작
   * @param {string} targetSocketId - 연결 대상 소켓 ID
   * @param {number} timestamp - 재연결 시작 타임스탬프
   */
  const startWebRTCReconnection = useCallback((targetSocketId, timestamp = Date.now()) => {
    console.log(
      `[useWebRTCState] WebRTC 재연결 시작 - 대상: ${targetSocketId}, timestamp: ${timestamp}`
    );

    // 타임아웃 설정 (10초)
    const timeoutId = setTimeout(() => {
      console.error("❌ [useWebRTCState] WebRTC 재연결 타임아웃 (10초)");
      setWebrtcReconnectionState((prev) => ({
        ...prev,
        isReconnecting: false,
        reconnectTimeout: null,
      }));
    }, 10000);

    setWebrtcReconnectionState({
      isReconnecting: true,
      isRemoteReconnecting: false,
      reconnectTimeout: timeoutId,
      targetSocketId,
    });
  }, []);

  /**
   * WebRTC 재연결 완료
   */
  const completeWebRTCReconnection = useCallback(() => {
    console.log("[useWebRTCState] WebRTC 재연결 완료");

    setWebrtcReconnectionState((prev) => {
      // 타임아웃 클리어
      if (prev.reconnectTimeout) {
        clearTimeout(prev.reconnectTimeout);
      }

      return {
        isReconnecting: false,
        isRemoteReconnecting: false,
        reconnectTimeout: null,
        targetSocketId: prev.targetSocketId, // targetSocketId는 유지 (연결 유지)
      };
    });
  }, []);

  /**
   * 상대방 재연결 시작 감지
   */
  const startRemoteWebRTCReconnection = useCallback(() => {
    console.log("[useWebRTCState] 상대방 WebRTC 재연결 감지");

    setWebrtcReconnectionState((prev) => {
      // 내 재연결 타임아웃 클리어 (상대방이 우선권 가짐)
      if (prev.reconnectTimeout) {
        clearTimeout(prev.reconnectTimeout);
      }

      return {
        ...prev,
        isReconnecting: false, // 내 재연결 취소
        isRemoteReconnecting: true, // 상대방 재연결 대기
        reconnectTimeout: null,
      };
    });
  }, []);

  /**
   * targetSocketId 설정
   * @param {string} socketId - 연결 대상 소켓 ID
   */
  const setTargetSocketId = useCallback((socketId) => {
    setWebrtcReconnectionState((prev) => ({
      ...prev,
      targetSocketId: socketId,
    }));
  }, []);

  /**
   * WebRTC 재연결 상태 초기화
   */
  const resetWebRTCReconnectionState = useCallback(() => {
    console.log("[useWebRTCState] WebRTC 재연결 상태 초기화");

    setWebrtcReconnectionState((prev) => {
      // 타임아웃 클리어
      if (prev.reconnectTimeout) {
        clearTimeout(prev.reconnectTimeout);
      }

      return {
        isReconnecting: false,
        isRemoteReconnecting: false,
        reconnectTimeout: null,
        targetSocketId: null,
      };
    });
  }, []);

  // ============ 초기화 상태 머신 함수 ============

  /**
   * WebRTC 초기화 시작
   */
  const startWebRTCInitialization = useCallback(() => {
    console.log("[useWebRTCState] WebRTC 초기화 시작");
    setWebrtcInitState({
      status: "initializing",
      isProcessingSignal: false,
      pendingOffer: null,
      pendingConnection: null,
    });
  }, []);

  /**
   * WebRTC 초기화 완료
   */
  const completeWebRTCInitialization = useCallback(() => {
    console.log("[useWebRTCState] WebRTC 초기화 완료");
    setWebrtcInitState((prev) => ({
      ...prev,
      status: "ready",
    }));
  }, []);

  /**
   * WebRTC 초기화 에러
   * @param {string} errorMessage - 에러 메시지
   */
  const setWebRTCInitializationError = useCallback((errorMessage) => {
    console.error("[useWebRTCState] WebRTC 초기화 에러:", errorMessage);
    setWebrtcInitState((prev) => ({
      ...prev,
      status: "error",
    }));
  }, []);

  /**
   * WebRTC 초기화 상태 리셋
   */
  const resetWebRTCInitState = useCallback(() => {
    console.log("[useWebRTCState] WebRTC 초기화 상태 리셋");
    setWebrtcInitState({
      status: "idle",
      isProcessingSignal: false,
      pendingOffer: null,
      pendingConnection: null,
    });
  }, []);

  /**
   * 시그널 처리 중 플래그 설정
   * @param {boolean} isProcessing - 처리 중 여부
   */
  const setSignalProcessing = useCallback((isProcessing) => {
    setWebrtcInitState((prev) => ({
      ...prev,
      isProcessingSignal: isProcessing,
    }));
  }, []);

  /**
   * pending Offer 설정
   * @param {Object|null} offer - Offer 데이터 { from, signal }
   */
  const setPendingOffer = useCallback((offer) => {
    setWebrtcInitState((prev) => ({
      ...prev,
      pendingOffer: offer,
    }));
  }, []);

  /**
   * pending Connection 설정
   * @param {Object|null} connection - 연결 정보 { targetSocketId, asInitiator }
   */
  const setPendingConnection = useCallback((connection) => {
    setWebrtcInitState((prev) => ({
      ...prev,
      pendingConnection: connection,
    }));
  }, []);

  return {
    // 재연결 상태
    webrtcReconnectionState,
    startWebRTCReconnection,
    completeWebRTCReconnection,
    startRemoteWebRTCReconnection,
    setTargetSocketId,
    resetWebRTCReconnectionState,

    // 초기화 상태 머신
    webrtcInitState,
    startWebRTCInitialization,
    completeWebRTCInitialization,
    setWebRTCInitializationError,
    resetWebRTCInitState,
    setSignalProcessing,
    setPendingOffer,
    setPendingConnection,
  };
}

export default useWebRTCState;
