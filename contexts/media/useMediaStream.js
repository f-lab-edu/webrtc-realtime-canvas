"use client";

import { useCallback, useRef, useState } from "react";
import WebRTCService from "@/services/WebRTCService";

/**
 * useMediaStream 커스텀 훅
 * 로컬/원격 미디어 스트림 및 비디오/오디오 토글을 관리
 *
 * @returns {Object} 미디어 스트림 상태 및 제어 함수
 */
export function useMediaStream() {
  // ============ 스트림 상태 ============
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState(new Map()); // Map<socketId, MediaStream>

  // ============ 미디어 제어 상태 ============
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);

  // ============ Refs ============
  const webrtcServiceRef = useRef(null);

  // SFU 콜백 함수 저장 (useSFU에서 제공)
  const sfuCallbacksRef = useRef({
    onVideoToggle: null,
    onAudioToggle: null,
  });

  // WebRTC 재연결 콜백 함수 저장 (useWebRTC에서 제공)
  const reconnectMediaRef = useRef(null);

  // WebRTCService 인스턴스 초기화
  if (!webrtcServiceRef.current) {
    webrtcServiceRef.current = new WebRTCService();
  }

  // ============ 콜백 등록 함수 ============

  /**
   * useWebRTC에서 제공하는 reconnectMedia 콜백 함수 등록
   * @param {Function} reconnectMediaFn - reconnectMedia(newStream) 함수
   */
  const setReconnectMediaCallback = useCallback((reconnectMediaFn) => {
    reconnectMediaRef.current = reconnectMediaFn;
    console.log("[useMediaStream] reconnectMedia 콜백 등록 완료");
  }, []);

  /**
   * SFU 비디오/오디오 토글 콜백 등록
   * @param {Object} callbacks - { onVideoToggle, onAudioToggle }
   */
  const registerStreamCallbacks = useCallback((callbacks) => {
    sfuCallbacksRef.current = {
      onVideoToggle: callbacks.onVideoToggle || null,
      onAudioToggle: callbacks.onAudioToggle || null,
    };
  }, []);

  // ============ 미디어 제어 함수 ============

  /**
   * 비디오 활성화/비활성화 토글
   */
  const toggleVideo = useCallback(() => {
    if (!localStream) {
      console.log("로컬 스트림이 없습니다.");
      return;
    }

    const videoTrack = localStream.getVideoTracks()[0];
    if (videoTrack) {
      const newState = !videoTrack.enabled;
      videoTrack.enabled = newState;
      setIsVideoEnabled(newState);
      console.log(`비디오 ${newState ? "활성화" : "비활성화"}`);

      // SFU 콜백 호출 (Producer pause/resume)
      if (sfuCallbacksRef.current.onVideoToggle) {
        sfuCallbacksRef.current.onVideoToggle(newState);
      }
    }
  }, [localStream]);

  /**
   * 오디오 활성화/비활성화 토글
   */
  const toggleAudio = useCallback(() => {
    if (!localStream) {
      console.log("로컬 스트림이 없습니다.");
      return;
    }

    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) {
      const newState = !audioTrack.enabled;
      audioTrack.enabled = newState;
      setIsAudioEnabled(newState);
      console.log(`오디오 ${newState ? "활성화" : "비활성화"}`);

      // SFU 콜백 호출 (Producer pause/resume)
      if (sfuCallbacksRef.current.onAudioToggle) {
        sfuCallbacksRef.current.onAudioToggle(newState);
      }
    }
  }, [localStream]);

  // ============ 원격 스트림 관리 ============

  /**
   * 원격 스트림 추가 (P2P Mesh)
   * @param {string} socketId - 참가자 Socket ID
   * @param {MediaStream} stream - 원격 미디어 스트림
   */
  const addRemoteStream = useCallback((socketId, stream) => {
    console.log(`원격 스트림 추가: ${socketId}`);
    setRemoteStreams((prev) => new Map(prev).set(socketId, stream));
  }, []);

  /**
   * 원격 스트림 제거 (P2P Mesh)
   * @param {string} socketId - 참가자 Socket ID
   */
  const removeRemoteStream = useCallback((socketId) => {
    console.log(`원격 스트림 제거: ${socketId}`);
    setRemoteStreams((prev) => {
      const next = new Map(prev);
      next.delete(socketId);
      return next;
    });
  }, []);

  // ============ 스트림 정리 ============

  /**
   * 로컬 스트림 정리
   */
  const cleanupLocalStream = useCallback(() => {
    if (localStream) {
      localStream.getTracks().forEach((track) => {
        track.stop();
        console.log(`트랙 중지: ${track.kind}`);
      });
      setLocalStream(null);
    }
  }, [localStream]);

  /**
   * 원격 스트림 정리
   */
  const cleanupRemoteStreams = useCallback(() => {
    remoteStreams.forEach((stream, socketId) => {
      console.log(`원격 스트림 정리: ${socketId}`);
      stream.getTracks().forEach((track) => {
        track.stop();
      });
    });
    setRemoteStreams(new Map());
  }, [remoteStreams]);

  /**
   * WebRTC Peer 연결 정리
   */
  const cleanupWebRTCPeers = useCallback(() => {
    if (webrtcServiceRef.current) {
      console.log("모든 WebRTC Peer 연결 종료");
      webrtcServiceRef.current.destroyAll();
    }
  }, []);

  /**
   * 상태 초기화
   */
  const resetStreamState = useCallback(() => {
    setIsVideoEnabled(true);
    setIsAudioEnabled(true);
  }, []);

  return {
    // 스트림 상태
    localStream,
    setLocalStream,
    // 1:1 호환성 레이어: remoteStreams Map의 첫 번째 스트림을 remoteStream으로 제공
    remoteStream: remoteStreams.size > 0 ? Array.from(remoteStreams.values())[0] : null,
    remoteStreams,

    // 미디어 제어 상태
    isVideoEnabled,
    setIsVideoEnabled,
    isAudioEnabled,
    setIsAudioEnabled,

    // 미디어 제어 함수
    toggleVideo,
    toggleAudio,

    // 원격 스트림 관리
    addRemoteStream,
    removeRemoteStream,

    // 정리 함수
    cleanupLocalStream,
    cleanupRemoteStreams,
    cleanupWebRTCPeers,
    resetStreamState,

    // WebRTCService 인스턴스
    webrtcService: webrtcServiceRef.current,

    // 콜백 등록
    setReconnectMediaCallback,
    reconnectMediaRef,
    registerStreamCallbacks,
    sfuCallbacksRef,
  };
}

export default useMediaStream;
