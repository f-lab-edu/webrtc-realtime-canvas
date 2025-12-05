"use client";

import { createContext, useCallback, useContext, useEffect } from "react";
import { useMediaDevices } from "./media/useMediaDevices";
import { useMediaStream } from "./media/useMediaStream";
import { useScreenShare } from "./media/useScreenShare";
import { useWebRTCState } from "./media/useWebRTCState";

/**
 * MediaContext
 * 로컬/원격 스트림, 비디오/오디오 활성화 상태를 관리하는 Context
 *
 * 모듈 분리 구조:
 * - useMediaStream: 로컬/원격 미디어 스트림 관리
 * - useMediaDevices: 디바이스 목록/선택
 * - useScreenShare: 화면 공유 전용
 * - useWebRTCState: WebRTC 재연결 상태 머신
 */
const MediaContext = createContext(null);

/**
 * MediaProvider 컴포넌트
 * 미디어 스트림 및 WebRTCService 인스턴스를 관리
 */
export function MediaProvider({ children }) {
  // ============ Custom Hooks 통합 ============

  // 1. 미디어 스트림 관리
  const mediaStream = useMediaStream();

  // 2. WebRTC 상태 관리
  const webrtcState = useWebRTCState();

  // 3. 화면 공유 관리
  const screenShare = useScreenShare();

  // 4. 디바이스 관리 (mediaStream 의존)
  const mediaDevices = useMediaDevices(mediaStream);

  // ============ SFU 콜백 통합 등록 ============

  /**
   * useSFU에서 제공하는 SFU 콜백 등록
   * 비디오/오디오 토글 + 화면 공유 콜백을 각 훅에 분배
   *
   * @param {Object} callbacks - { onVideoToggle, onAudioToggle, onScreenShareStart, onScreenShareStop }
   */
  const registerSFUCallbacks = useCallback(
    (callbacks) => {
      // 미디어 스트림 훅에 비디오/오디오 콜백 등록
      mediaStream.registerStreamCallbacks({
        onVideoToggle: callbacks.onVideoToggle || null,
        onAudioToggle: callbacks.onAudioToggle || null,
      });

      // 화면 공유 훅에 화면 공유 콜백 등록
      screenShare.registerScreenShareCallbacks({
        onScreenShareStart: callbacks.onScreenShareStart || null,
        onScreenShareStop: callbacks.onScreenShareStop || null,
      });

      console.log("[MediaContext] SFU 콜백 등록 완료");
    },
    [mediaStream.registerStreamCallbacks, screenShare.registerScreenShareCallbacks]
  );

  /**
   * SFU 콜백 해제
   */
  const unregisterSFUCallbacks = useCallback(() => {
    mediaStream.registerStreamCallbacks({
      onVideoToggle: null,
      onAudioToggle: null,
    });

    screenShare.unregisterScreenShareCallbacks();

    console.log("[MediaContext] SFU 콜백 해제");
  }, [mediaStream.registerStreamCallbacks, screenShare.unregisterScreenShareCallbacks]);

  // ============ 통합 정리 함수 ============

  /**
   * 모든 미디어 스트림 정리
   */
  const cleanupMedia = useCallback(() => {
    try {
      console.log("미디어 리소스 정리 시작");

      // 1. 로컬 스트림 정리
      mediaStream.cleanupLocalStream();

      // 2. 원격 스트림 정리
      mediaStream.cleanupRemoteStreams();

      // 3. WebRTC Peer 정리
      mediaStream.cleanupWebRTCPeers();

      // 4. 화면 공유 정리
      screenShare.cleanupScreenShare();

      // 5. 스트림 상태 초기화
      mediaStream.resetStreamState();

      // 6. WebRTC 상태 초기화
      webrtcState.resetWebRTCInitState();
      webrtcState.resetWebRTCReconnectionState();

      // 7. 디바이스 상태 초기화
      mediaDevices.resetDeviceState();

      console.log("미디어 리소스 정리 완료");
    } catch (error) {
      console.error("미디어 정리 에러:", error);
    }
  }, [
    mediaStream.cleanupLocalStream,
    mediaStream.cleanupRemoteStreams,
    mediaStream.cleanupWebRTCPeers,
    mediaStream.resetStreamState,
    screenShare.cleanupScreenShare,
    webrtcState.resetWebRTCInitState,
    webrtcState.resetWebRTCReconnectionState,
    mediaDevices.resetDeviceState,
  ]);

  // 컴포넌트 언마운트 시 정리
  // biome-ignore lint/correctness/useExhaustiveDependencies: clean-up only
  useEffect(() => {
    return () => {
      cleanupMedia();
    };
  }, []);

  // ============ Context Value 구성 ============

  const value = {
    // ========== 스트림 상태 ==========
    localStream: mediaStream.localStream,
    setLocalStream: mediaStream.setLocalStream,
    // 1:1 호환성 레이어: remoteStreams Map의 첫 번째 스트림을 remoteStream으로 제공
    remoteStream:
      mediaStream.remoteStreams.size > 0 ? Array.from(mediaStream.remoteStreams.values())[0] : null,
    remoteStreams: mediaStream.remoteStreams,
    addRemoteStream: mediaStream.addRemoteStream,
    removeRemoteStream: mediaStream.removeRemoteStream,

    // ========== 미디어 제어 상태 ==========
    isVideoEnabled: mediaStream.isVideoEnabled,
    isAudioEnabled: mediaStream.isAudioEnabled,
    isScreenSharing: screenShare.isScreenSharing,
    screenStream: screenShare.screenStream,

    // ========== Optional 미디어 지원 상태 ==========
    participationMode: mediaDevices.participationMode,
    setParticipationMode: mediaDevices.setParticipationMode,
    hasMediaPermission: mediaDevices.hasMediaPermission,
    setHasMediaPermission: mediaDevices.setHasMediaPermission,
    isReconnecting: mediaDevices.isReconnecting,
    reconnectionError: mediaDevices.reconnectionError,
    setReconnectionError: mediaDevices.setReconnectionError,

    // ========== WebRTC 재연결 상태 ==========
    webrtcReconnectionState: webrtcState.webrtcReconnectionState,
    startWebRTCReconnection: webrtcState.startWebRTCReconnection,
    completeWebRTCReconnection: webrtcState.completeWebRTCReconnection,
    startRemoteWebRTCReconnection: webrtcState.startRemoteWebRTCReconnection,
    setTargetSocketId: webrtcState.setTargetSocketId,
    resetWebRTCReconnectionState: webrtcState.resetWebRTCReconnectionState,

    // ========== WebRTC 초기화 상태 머신 ==========
    webrtcInitState: webrtcState.webrtcInitState,
    startWebRTCInitialization: webrtcState.startWebRTCInitialization,
    completeWebRTCInitialization: webrtcState.completeWebRTCInitialization,
    setWebRTCInitializationError: webrtcState.setWebRTCInitializationError,
    resetWebRTCInitState: webrtcState.resetWebRTCInitState,
    setSignalProcessing: webrtcState.setSignalProcessing,
    setPendingOffer: webrtcState.setPendingOffer,
    setPendingConnection: webrtcState.setPendingConnection,

    // ========== WebRTCService 인스턴스 ==========
    webrtcService: mediaStream.webrtcService,

    // ========== 미디어 제어 함수 ==========
    initializeMedia: mediaDevices.initializeMedia,
    toggleVideo: mediaStream.toggleVideo,
    toggleAudio: mediaStream.toggleAudio,
    startScreenShare: screenShare.startScreenShare,
    stopScreenShare: screenShare.stopScreenShare,
    cleanupMedia,

    // ========== 디바이스 선택 함수 ==========
    getAvailableDevices: mediaDevices.getAvailableDevices,
    initializeMediaWithDevice: mediaDevices.initializeMediaWithDevice,
    reinitializeMedia: mediaDevices.reinitializeMedia,
    switchToParticipantMode: mediaDevices.switchToParticipantMode,

    // ========== WebRTC 재연결 콜백 등록 ==========
    setReconnectMediaCallback: mediaDevices.setReconnectMediaCallback,

    // ========== SFU 콜백 등록/해제 ==========
    registerSFUCallbacks,
    unregisterSFUCallbacks,
  };

  return <MediaContext.Provider value={value}>{children}</MediaContext.Provider>;
}

/**
 * MediaContext를 사용하는 커스텀 훅
 * @returns {Object} MediaContext 값
 */
export function useMediaContext() {
  const context = useContext(MediaContext);

  if (!context) {
    throw new Error("useMediaContext는 MediaProvider 내부에서만 사용할 수 있습니다.");
  }

  return context;
}

export default MediaContext;
