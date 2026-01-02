"use client";

import { useCallback, useRef, useState } from "react";

/**
 * useMediaDevices 커스텀 훅
 * 미디어 디바이스 관리 (카메라, 마이크 목록 조회 및 선택)
 *
 * @param {Object} mediaStreamHook - useMediaStream 훅 반환값
 * @returns {Object} 디바이스 관리 상태 및 함수
 */
export function useMediaDevices(mediaStreamHook) {
  // ============ 상태 ============
  const [participationMode, setParticipationMode] = useState("participant"); // 'viewer' | 'participant'
  const [hasMediaPermission, setHasMediaPermission] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [reconnectionError, setReconnectionError] = useState(null);

  // ============ Refs ============
  /** WebRTC 재연결 콜백 함수 저장 (useWebRTC에서 제공) */
  const reconnectMediaRef = useRef(null);

  // ============ 콜백 등록 함수 ============

  /**
   * useWebRTC에서 제공하는 reconnectMedia 콜백 함수 등록
   * @param {Function} reconnectMediaFn - reconnectMedia(newStream) 함수
   */
  const setReconnectMediaCallback = useCallback((reconnectMediaFn) => {
    reconnectMediaRef.current = reconnectMediaFn;
    console.log("[useMediaDevices] reconnectMedia 콜백 등록 완료");
  }, []);

  // ============ 디바이스 조회 함수 ============

  /**
   * 사용 가능한 미디어 디바이스 목록 조회
   * @returns {Promise<{videoDevices: Array, audioDevices: Array}>}
   */
  const getAvailableDevices = useCallback(async () => {
    try {
      console.log("디바이스 목록 조회 시작");

      const devices = await navigator.mediaDevices.enumerateDevices();

      const videoDevices = devices
        .filter((device) => device.kind === "videoinput")
        .map((device) => ({
          deviceId: device.deviceId,
          label: device.label || `카메라 ${device.deviceId.slice(0, 8)}`,
        }));

      const audioDevices = devices
        .filter((device) => device.kind === "audioinput")
        .map((device) => ({
          deviceId: device.deviceId,
          label: device.label || `마이크 ${device.deviceId.slice(0, 8)}`,
        }));

      console.log(`비디오 디바이스: ${videoDevices.length}개`);
      // biome-ignore lint/suspicious/useIterableCallbackReturn: print info
      videoDevices.forEach((d, i) => console.log(`  [${i}] ${d.label} (${d.deviceId})`));

      console.log(`오디오 디바이스: ${audioDevices.length}개`);
      // biome-ignore lint/suspicious/useIterableCallbackReturn: print info
      audioDevices.forEach((d, i) => console.log(`  [${i}] ${d.label} (${d.deviceId})`));

      return { videoDevices, audioDevices };
    } catch (error) {
      console.error("디바이스 목록 조회 실패:", error);
      throw error;
    }
  }, []);

  // ============ 미디어 초기화 함수 ============

  /**
   * 로컬 미디어 스트림 초기화 (웹캠 + 마이크)
   * @returns {Promise<MediaStream>}
   */
  const initializeMedia = useCallback(async () => {
    // mediaStreamHook 필수 체크
    if (!mediaStreamHook) {
      throw new Error("[useMediaDevices] mediaStreamHook이 필요합니다.");
    }

    try {
      console.log("미디어 스트림 초기화 시작");

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      console.log("미디어 스트림 획득 성공");

      // 오디오/비디오 트랙 확인
      const audioTracks = stream.getAudioTracks();
      const videoTracks = stream.getVideoTracks();

      console.log(`로컬 스트림 트랙 정보:`);
      console.log(
        `- 비디오 트랙: ${videoTracks.length}개`,
        videoTracks.map((t) => `${t.label} (enabled: ${t.enabled})`)
      );
      console.log(
        `- 오디오 트랙: ${audioTracks.length}개`,
        audioTracks.map((t) => `${t.label} (enabled: ${t.enabled})`)
      );

      if (audioTracks.length === 0) {
        console.log("⚠️ 오디오 트랙이 없습니다!");
      }

      // mediaStreamHook을 통해 상태 업데이트
      mediaStreamHook.setLocalStream(stream);
      mediaStreamHook.setIsVideoEnabled(true);
      mediaStreamHook.setIsAudioEnabled(true);

      return stream;
    } catch (error) {
      console.error("미디어 스트림 초기화 실패:", error);

      // 에러 타입별 처리
      if (error.name === "NotAllowedError") {
        alert("카메라와 마이크 권한이 필요합니다. 브라우저 설정에서 권한을 허용해주세요.");
      } else if (error.name === "NotFoundError") {
        alert("카메라 또는 마이크를 찾을 수 없습니다. 장치가 연결되어 있는지 확인해주세요.");
      } else {
        alert(`미디어 장치 접근 실패: ${error.message}`);
      }

      throw error;
    }
  }, [mediaStreamHook]);

  /**
   * 특정 디바이스로 미디어 스트림 초기화
   * @param {string} videoDeviceId - 선택된 비디오 디바이스 ID
   * @param {string} audioDeviceId - 선택된 오디오 디바이스 ID
   * @returns {Promise<MediaStream>}
   */
  const initializeMediaWithDevice = useCallback(
    async (videoDeviceId, audioDeviceId) => {
      // mediaStreamHook 필수 체크
      if (!mediaStreamHook) {
        throw new Error("[useMediaDevices] mediaStreamHook이 필요합니다.");
      }

      try {
        console.log("선택된 디바이스로 미디어 초기화 시작");
        console.log(`  - 비디오 디바이스: ${videoDeviceId}`);
        console.log(`  - 오디오 디바이스: ${audioDeviceId}`);

        const constraints = {
          video: videoDeviceId
            ? {
                deviceId: { exact: videoDeviceId },
                width: { ideal: 1280 },
                height: { ideal: 720 },
              }
            : {
                width: { ideal: 1280 },
                height: { ideal: 720 },
              },
          audio: audioDeviceId
            ? {
                deviceId: { exact: audioDeviceId },
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
              }
            : {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
              },
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);

        console.log("미디어 스트림 획득 성공");

        // 트랙 정보 로깅
        const audioTracks = stream.getAudioTracks();
        const videoTracks = stream.getVideoTracks();

        console.log(`로컬 스트림 트랙 정보:`);
        console.log(
          `- 비디오 트랙: ${videoTracks.length}개`,
          videoTracks.map((t) => `${t.label} (enabled: ${t.enabled})`)
        );
        console.log(
          `- 오디오 트랙: ${audioTracks.length}개`,
          audioTracks.map((t) => `${t.label} (enabled: ${t.enabled})`)
        );

        // mediaStreamHook을 통해 상태 업데이트
        mediaStreamHook.setLocalStream(stream);
        mediaStreamHook.setIsVideoEnabled(true);
        mediaStreamHook.setIsAudioEnabled(true);

        return stream;
      } catch (error) {
        console.error("선택된 디바이스로 초기화 실패:", error);

        // 에러 타입별 처리
        if (error.name === "NotAllowedError") {
          alert("카메라와 마이크 권한이 필요합니다. 브라우저 설정에서 권한을 허용해주세요.");
        } else if (error.name === "NotFoundError") {
          alert("선택한 디바이스를 찾을 수 없습니다. 다른 디바이스를 선택해주세요.");
        } else if (error.name === "NotReadableError") {
          alert(
            `선택한 디바이스가 사용 중입니다.\n다른 브라우저나 애플리케이션에서 디바이스를 사용하고 있는지 확인해주세요.\n\n오류: ${error.message}`
          );
        } else {
          alert(`미디어 장치 접근 실패: ${error.message}`);
        }

        throw error;
      }
    },
    [mediaStreamHook]
  );

  /**
   * 미디어 스트림 재초기화 (디바이스 변경 시 사용)
   * @param {string} videoDeviceId - 선택된 비디오 디바이스 ID
   * @param {string} audioDeviceId - 선택된 오디오 디바이스 ID
   * @returns {Promise<MediaStream>}
   */
  const reinitializeMedia = useCallback(
    async (videoDeviceId, audioDeviceId) => {
      // mediaStreamHook 필수 체크
      if (!mediaStreamHook) {
        throw new Error("[useMediaDevices] mediaStreamHook이 필요합니다.");
      }

      // 이전 스트림 백업 (롤백용)
      const previousStream = mediaStreamHook.localStream;

      try {
        console.log("\n========== [useMediaDevices] 미디어 스트림 재초기화 시작 ==========");
        setIsReconnecting(true);
        setReconnectionError(null);

        // 1. 기존 localStream 정리 (tracks stop)
        if (mediaStreamHook.localStream) {
          console.log("🧹 기존 로컬 스트림 정리 중...");
          mediaStreamHook.localStream.getTracks().forEach((track) => {
            track.stop();
            console.log(`  - 트랙 중지: ${track.kind} - ${track.label}`);
          });
        }

        // 2. 새 디바이스로 스트림 생성 (재연결 전에 먼저 생성)
        console.log("🎥 새 디바이스로 스트림 생성 시작");
        console.log(`  - 비디오 디바이스: ${videoDeviceId}`);
        console.log(`  - 오디오 디바이스: ${audioDeviceId}`);

        const constraints = {
          video: videoDeviceId
            ? {
                deviceId: { exact: videoDeviceId },
                width: { ideal: 1280 },
                height: { ideal: 720 },
              }
            : {
                width: { ideal: 1280 },
                height: { ideal: 720 },
              },
          audio: audioDeviceId
            ? {
                deviceId: { exact: audioDeviceId },
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
              }
            : {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
              },
        };

        const newStream = await navigator.mediaDevices.getUserMedia(constraints);

        console.log("✅ 새 미디어 스트림 획득 성공");

        // 트랙 정보 로깅
        const audioTracks = newStream.getAudioTracks();
        const videoTracks = newStream.getVideoTracks();

        console.log("📊 새 로컬 스트림 트랙 정보:");
        console.log(
          `  - 비디오 트랙: ${videoTracks.length}개`,
          videoTracks.map((t) => `${t.label} (enabled: ${t.enabled})`)
        );
        console.log(
          `  - 오디오 트랙: ${audioTracks.length}개`,
          audioTracks.map((t) => `${t.label} (enabled: ${t.enabled})`)
        );

        // 3. ⚠️ 중요: WebRTC 재연결 트리거 (newStream 전달)
        if (reconnectMediaRef.current) {
          console.log("🔄 WebRTC 재연결 트리거 (reconnectMedia 호출)");
          console.log(`  - newStream ID: ${newStream.id}`);

          try {
            // reconnectMedia는 async지만 await하지 않음
            // (WebRTC 연결은 이벤트 기반으로 비동기 처리됨)
            reconnectMediaRef.current(newStream);
            console.log("✅ reconnectMedia 호출 완료 (비동기 처리 시작)");
          } catch (reconnectError) {
            console.error("❌ reconnectMedia 호출 실패:", reconnectError);

            // 롤백: 이전 스트림 복원
            console.log("🔙 롤백: 이전 스트림 복원 시도");
            if (previousStream) {
              mediaStreamHook.setLocalStream(previousStream);
              console.log("✅ 이전 스트림 복원 완료");
            }

            throw new Error(`WebRTC 재연결 실패: ${reconnectError.message}`);
          }
        } else {
          console.log("⚠️ reconnectMedia 콜백이 등록되지 않음 (WebRTC 재연결 스킵)");
        }

        // 4. Context 상태 업데이트
        mediaStreamHook.setLocalStream(newStream);
        mediaStreamHook.setIsVideoEnabled(true);
        mediaStreamHook.setIsAudioEnabled(true);
        setParticipationMode("participant");
        setHasMediaPermission(true);
        setIsReconnecting(false);

        console.log("========== [useMediaDevices] 미디어 스트림 재초기화 완료 ==========\n");
        return newStream;
      } catch (error) {
        console.error("❌ [useMediaDevices] 미디어 스트림 재초기화 실패:", error);

        // 에러 타입별 처리
        let errorMessage = "미디어 장치 재초기화 실패";

        if (error.name === "NotAllowedError") {
          errorMessage =
            "카메라와 마이크 권한이 필요합니다. 브라우저 설정에서 권한을 허용해주세요.";
        } else if (error.name === "NotFoundError") {
          errorMessage = "선택한 디바이스를 찾을 수 없습니다. 다른 디바이스를 선택해주세요.";
        } else if (error.name === "NotReadableError") {
          errorMessage = `선택한 디바이스가 사용 중입니다.\n다른 브라우저나 애플리케이션에서 디바이스를 사용하고 있는지 확인해주세요.`;
        } else {
          errorMessage = `미디어 장치 접근 실패: ${error.message}`;
        }

        setReconnectionError(errorMessage);
        setIsReconnecting(false);

        // 롤백: 이전 스트림 복원 (에러 발생 시)
        if (previousStream && !mediaStreamHook.localStream) {
          console.log("🔙 에러 발생, 이전 스트림 복원");
          mediaStreamHook.setLocalStream(previousStream);
        }

        throw error;
      }
    },
    [mediaStreamHook]
  );

  /**
   * 시청자 모드에서 일반 참여자 모드로 전환
   * @param {string} videoDeviceId - 선택된 비디오 디바이스 ID
   * @param {string} audioDeviceId - 선택된 오디오 디바이스 ID
   * @returns {Promise<MediaStream>}
   */
  const switchToParticipantMode = useCallback(
    async (videoDeviceId, audioDeviceId) => {
      try {
        // 시청자 모드 체크
        if (participationMode !== "viewer") {
          console.log("이미 참여자 모드입니다.");
          return null;
        }

        console.log("시청자 → 참여자 모드 전환 시작");

        // reinitializeMedia 호출
        const newStream = await reinitializeMedia(videoDeviceId, audioDeviceId);

        console.log("참여자 모드 전환 완료");
        return newStream;
      } catch (error) {
        console.error("참여자 모드 전환 실패:", error);

        // 사용자 알림
        alert(`참여자 모드로 전환할 수 없습니다.\n${error.message || "알 수 없는 오류"}`);

        throw error;
      }
    },
    [participationMode, reinitializeMedia]
  );

  // ============ 상태 초기화 ============

  /**
   * 디바이스 상태 초기화
   */
  const resetDeviceState = useCallback(() => {
    setParticipationMode("participant");
    setHasMediaPermission(false);
    setIsReconnecting(false);
    setReconnectionError(null);
  }, []);

  return {
    // Optional 미디어 지원 상태
    participationMode,
    setParticipationMode,
    hasMediaPermission,
    setHasMediaPermission,
    isReconnecting,
    reconnectionError,
    setReconnectionError,

    // 디바이스 조회/선택 함수
    getAvailableDevices,
    initializeMedia,
    initializeMediaWithDevice,
    reinitializeMedia,
    switchToParticipantMode,

    // WebRTC 재연결 콜백 등록
    setReconnectMediaCallback,
    reconnectMediaRef,

    // 상태 초기화
    resetDeviceState,
  };
}

export default useMediaDevices;
