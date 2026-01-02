"use client";

import { useCallback, useRef, useState } from "react";

/**
 * useScreenShare 커스텀 훅
 * 화면 공유 기능을 관리
 *
 * @returns {Object} 화면 공유 상태 및 제어 함수
 */
export function useScreenShare() {
  // ============ 화면 공유 상태 ============
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [screenStream, setScreenStream] = useState(null);

  // ============ Refs ============
  /** 화면 공유 스트림 임시 저장 */
  const screenStreamRef = useRef(null);

  /** 원본 비디오 트랙 저장 (P2P 전환 시 사용) */
  const originalVideoTrackRef = useRef(null);

  /** SFU 콜백 함수 저장 (useSFU에서 제공) */
  const sfuCallbacksRef = useRef({
    onScreenShareStart: null,
    onScreenShareStop: null,
  });

  // ============ 콜백 등록 함수 ============

  /**
   * SFU 화면 공유 콜백 등록
   * @param {Object} callbacks - { onScreenShareStart, onScreenShareStop }
   */
  const registerScreenShareCallbacks = useCallback((callbacks) => {
    sfuCallbacksRef.current = {
      onScreenShareStart: callbacks.onScreenShareStart || null,
      onScreenShareStop: callbacks.onScreenShareStop || null,
    };
    console.log("[useScreenShare] 화면 공유 콜백 등록 완료");
  }, []);

  /**
   * SFU 화면 공유 콜백 해제
   */
  const unregisterScreenShareCallbacks = useCallback(() => {
    sfuCallbacksRef.current = {
      onScreenShareStart: null,
      onScreenShareStop: null,
    };
    console.log("[useScreenShare] 화면 공유 콜백 해제");
  }, []);

  // ============ 화면 공유 제어 함수 ============

  /**
   * 화면 공유 중지
   */
  const stopScreenShare = useCallback(() => {
    try {
      if (!isScreenSharing) {
        console.log("화면 공유 중이 아닙니다.");
        return;
      }

      console.log("화면 공유 중지");

      // 1️⃣ SFU 콜백 먼저 호출 (화면 공유 Producer 제거 + Socket 이벤트)
      // 상태 변경 전에 호출하여 이벤트 순서 보장
      if (sfuCallbacksRef.current.onScreenShareStop) {
        sfuCallbacksRef.current.onScreenShareStop();
      }

      // 2️⃣ 상태 플래그 해제 (렌더링 전환 트리거)
      setIsScreenSharing(false);
      setScreenStream(null);

      // 3️⃣ 스트림 정리
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((track) => {
          track.stop();
        });
        screenStreamRef.current = null;
      }

      // Note: SFU 방식에서는 P2P replaceTrack 불필요 (Producer만 관리)

      console.log("화면 공유 중지 완료");
    } catch (error) {
      console.error("화면 공유 중지 에러:", error);
    }
  }, [isScreenSharing]);

  /**
   * 화면 공유 시작
   * @param {boolean} hasScreenSharePermission - 화면 공유 권한 여부
   * @param {boolean} isHost - 호스트 여부
   * @returns {Promise<void>}
   */
  const startScreenShare = useCallback(
    async (hasScreenSharePermission = false, isHost = false) => {
      try {
        // 권한 체크: hasScreenSharePermission 또는 isHost 필요
        if (!hasScreenSharePermission && !isHost) {
          const errorMessage = "화면 공유 권한이 없습니다. 호스트에게 권한을 요청하세요.";
          console.error(errorMessage);
          alert(errorMessage);
          throw new Error(errorMessage);
        }

        if (isScreenSharing) {
          console.log("이미 화면 공유 중입니다.");
          return;
        }

        console.log("화면 공유 시작");

        // 화면 공유 스트림 획득
        const newScreenStream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            cursor: "always",
          },
          audio: false,
        });

        const screenTrack = newScreenStream.getVideoTracks()[0];

        // 화면 공유 중지 이벤트 처리 (사용자가 브라우저 UI에서 중지)
        const handleScreenEnded = () => {
          console.log("화면 공유가 사용자에 의해 중지됨");
          stopScreenShare();
        };
        screenTrack.onended = handleScreenEnded;

        // 상태 업데이트
        screenStreamRef.current = newScreenStream;
        setScreenStream(newScreenStream);
        setIsScreenSharing(true);

        // SFU 콜백 호출 (화면 공유 Producer 생성 + Socket 이벤트)
        if (sfuCallbacksRef.current.onScreenShareStart) {
          await sfuCallbacksRef.current.onScreenShareStart(newScreenStream);
        }

        // Note: SFU 방식에서는 P2P replaceTrack 불필요 (Producer만 관리)

        console.log("화면 공유 시작 완료");
      } catch (error) {
        console.error("화면 공유 시작 실패:", error);

        if (error.name === "NotAllowedError") {
          console.log("사용자가 화면 공유를 거부했습니다.");
        } else {
          alert(`화면 공유 실패: ${error.message}`);
        }

        throw error;
      }
    },
    [isScreenSharing, stopScreenShare]
  );

  // ============ 정리 함수 ============

  /**
   * 화면 공유 스트림 정리
   */
  const cleanupScreenShare = useCallback(() => {
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((track) => {
        track.stop();
      });
      screenStreamRef.current = null;
    }
    setScreenStream(null);
    setIsScreenSharing(false);
    originalVideoTrackRef.current = null;
  }, []);

  /**
   * 화면 공유 상태 초기화
   */
  const resetScreenShareState = useCallback(() => {
    setIsScreenSharing(false);
    setScreenStream(null);
    originalVideoTrackRef.current = null;
  }, []);

  return {
    // 화면 공유 상태
    isScreenSharing,
    screenStream,

    // 화면 공유 제어 함수
    startScreenShare,
    stopScreenShare,

    // 정리 함수
    cleanupScreenShare,
    resetScreenShareState,

    // 콜백 등록/해제
    registerScreenShareCallbacks,
    unregisterScreenShareCallbacks,
    sfuCallbacksRef,

    // Refs (내부 접근용)
    screenStreamRef,
    originalVideoTrackRef,
  };
}

export default useScreenShare;
