"use client";

import { useEffect, useRef } from "react";
import { useMediaContext, useRoomContext, useSFUContext } from "@/contexts";

/**
 * useSFU 커스텀 훅
 * SFU: 서버 중계 방식의 미디어 송수신을 담당
 *
 * 역할:
 * - SFU 초기화 (Device 로드, Transport 생성)
 * - localStream → Producer 생성
 * - 미디어 토글 시 SFU Producer pause/resume
 * - 정리 시 SFU 리소스 해제
 *
 * @see design/client-architecture.md
 */
function useSFU() {
  // ============ Context 의존성 ============
  const { socketService, roomId, isConnected } = useRoomContext();
  const { localStream, registerSFUCallbacks, unregisterSFUCallbacks } = useMediaContext();
  const {
    initializeSFU,
    produce,
    cleanup,
    sfuState,
    remoteStreams,
    screenShareStreams, // 원격 화면 공유 스트림
    pauseProducer,
    resumeProducer,
    closeProducer,
    localProducers,
    getProducerIdByKind,
  } = useSFUContext();

  // ============ Refs ============
  /** 초기화 완료 플래그 */
  const hasInitializedRef = useRef(false);

  /** Producer 생성 완료 플래그 */
  const hasProducedRef = useRef(false);

  /** 화면 공유 Producer ID */
  const screenShareProducerIdRef = useRef(null);

  /** 최신 값 참조용 refs */
  const localStreamRef = useRef(localStream);
  const sfuStateRef = useRef(sfuState);
  const localProducersRef = useRef(localProducers);

  // ref 업데이트
  useEffect(() => {
    localStreamRef.current = localStream;
  }, [localStream]);

  useEffect(() => {
    sfuStateRef.current = sfuState;
  }, [sfuState]);

  useEffect(() => {
    localProducersRef.current = localProducers;
  }, [localProducers]);

  // ============ SFU 초기화 ============

  /**
   * 방 연결 시 SFU 초기화
   * Device 로드 → Transport 생성 → 기존 Producer 구독
   */
  useEffect(() => {
    // 초기화 조건 확인
    if (!isConnected || !roomId || !socketService) {
      return;
    }

    // 이미 초기화됨
    if (hasInitializedRef.current) {
      return;
    }

    console.log("[useSFU] SFU 초기화 시작");
    hasInitializedRef.current = true;

    initializeSFU(roomId);
  }, [isConnected, roomId, socketService, initializeSFU]);

  // ============ Producer 생성 ============

  /**
   * localStream 준비 및 SFU ready 시 Producer 생성
   */
  useEffect(() => {
    // 조건 확인
    if (!localStream || sfuState !== "ready") {
      return;
    }

    // 이미 Producer 생성됨
    if (hasProducedRef.current) {
      return;
    }

    const createProducers = async () => {
      hasProducedRef.current = true;

      try {
        // 비디오 트랙 Producer 생성
        const videoTrack = localStream.getVideoTracks()[0];
        if (videoTrack) {
          console.log("[useSFU] 비디오 Producer 생성");
          await produce(videoTrack, { kind: "video" });
        }

        // 오디오 트랙 Producer 생성
        const audioTrack = localStream.getAudioTracks()[0];
        if (audioTrack) {
          console.log("[useSFU] 오디오 Producer 생성");
          await produce(audioTrack, { kind: "audio" });
        }
      } catch (err) {
        console.error("[useSFU] Producer 생성 실패:", err);
        hasProducedRef.current = false;
      }
    };

    createProducers();
  }, [localStream, sfuState, produce]);

  // ============ MediaContext 콜백 등록 ============

  /**
   * 미디어 토글 시 SFU Producer pause/resume
   * MediaContext의 toggleVideo/toggleAudio에서 호출됨
   */
  useEffect(() => {
    // SFU 준비 안됨
    if (sfuState !== "ready") {
      return;
    }

    // registerSFUCallbacks가 없으면 스킵 (MediaContext 수정 전)
    if (!registerSFUCallbacks) {
      console.warn("[useSFU] registerSFUCallbacks 없음 - MediaContext 업데이트 필요");
      return;
    }

    const callbacks = {
      /**
       * 비디오 토글 콜백
       * @param {boolean} enabled - 활성화 여부
       */
      onVideoToggle: async (enabled) => {
        const producerId = getProducerIdByKind("video");
        if (!producerId) {
          console.warn("[useSFU] 비디오 Producer 없음");
          return;
        }

        try {
          if (enabled) {
            console.log("[useSFU] 비디오 Producer resume");
            await resumeProducer(producerId);
          } else {
            console.log("[useSFU] 비디오 Producer pause");
            await pauseProducer(producerId);
          }
        } catch (err) {
          console.error("[useSFU] 비디오 토글 실패:", err);
        }
      },

      /**
       * 오디오 토글 콜백
       * @param {boolean} enabled - 활성화 여부
       */
      onAudioToggle: async (enabled) => {
        const producerId = getProducerIdByKind("audio");
        if (!producerId) {
          console.warn("[useSFU] 오디오 Producer 없음");
          return;
        }

        try {
          if (enabled) {
            console.log("[useSFU] 오디오 Producer resume");
            await resumeProducer(producerId);
          } else {
            console.log("[useSFU] 오디오 Producer pause");
            await pauseProducer(producerId);
          }
        } catch (err) {
          console.error("[useSFU] 오디오 토글 실패:", err);
        }
      },

      /**
       * 화면 공유 시작 콜백
       * @param {MediaStream} screenStream - 화면 공유 스트림
       */
      onScreenShareStart: async (screenStream) => {
        try {
          const videoTrack = screenStream.getVideoTracks()[0];
          if (!videoTrack) {
            console.warn("[useSFU] 화면 공유 비디오 트랙 없음");
            return;
          }

          console.log("[useSFU] 화면 공유 Producer 생성");
          const producerId = await produce(videoTrack, { kind: "video", screenShare: true });
          screenShareProducerIdRef.current = producerId;

          // Socket 이벤트로 화면 공유 상태 브로드캐스트 (socketId 명시적 포함)
          if (socketService) {
            const mySocketId = socketService.socket?.id;
            socketService.emit("screen-share:started", { roomId, socketId: mySocketId });
            console.log("[useSFU] 화면 공유 시작 이벤트 전송, socketId:", mySocketId);
          }
        } catch (err) {
          console.error("[useSFU] 화면 공유 Producer 생성 실패:", err);
        }
      },

      /**
       * 화면 공유 중지 콜백
       */
      onScreenShareStop: async () => {
        try {
          const producerId = screenShareProducerIdRef.current;
          if (producerId) {
            console.log("[useSFU] 화면 공유 Producer 종료");
            await closeProducer(producerId);
            screenShareProducerIdRef.current = null;
          }

          // Socket 이벤트로 화면 공유 중지 브로드캐스트 (socketId 명시적 포함)
          if (socketService) {
            const mySocketId = socketService.socket?.id;
            socketService.emit("screen-share:stopped", { roomId, socketId: mySocketId });
            console.log("[useSFU] 화면 공유 중지 이벤트 전송, socketId:", mySocketId);
          }
        } catch (err) {
          console.error("[useSFU] 화면 공유 Producer 종료 실패:", err);
        }
      },
    };

    // 콜백 등록
    registerSFUCallbacks(callbacks);

    // 정리 시 콜백 해제
    return () => {
      if (unregisterSFUCallbacks) {
        unregisterSFUCallbacks();
      }
    };
  }, [
    sfuState,
    registerSFUCallbacks,
    unregisterSFUCallbacks,
    getProducerIdByKind,
    pauseProducer,
    resumeProducer,
    closeProducer,
    produce,
    socketService,
    roomId,
  ]);

  // ============ 정리 ============

  /**
   * 컴포넌트 언마운트 시 SFU 리소스 정리
   */
  useEffect(() => {
    return () => {
      console.log("[useSFU] 정리: SFU 리소스 해제");
      hasInitializedRef.current = false;
      hasProducedRef.current = false;
      cleanup();
    };
  }, [cleanup]);

  // ============ 반환값 ============

  return {
    /** 원격 스트림 (VideoGrid 호환) */
    remoteStreams,
    /** 원격 화면 공유 스트림 (socketId → MediaStream) */
    screenShareStreams,
    /** SFU 상태: 'idle' | 'initializing' | 'ready' | 'error' */
    sfuState,
    /** 로컬 Producer 목록 */
    localProducers,
  };
}

export default useSFU;
