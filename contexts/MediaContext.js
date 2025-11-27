"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import WebRTCService from "@/services/WebRTCService";

/**
 * MediaContext
 * 로컬/원격 스트림, 비디오/오디오 활성화 상태를 관리하는 Context
 */
const MediaContext = createContext(null);

/**
 * MediaProvider 컴포넌트
 * 미디어 스트림 및 WebRTCService 인스턴스를 관리
 */
export function MediaProvider({ children }) {
  // 미디어 스트림 상태
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);

  // 미디어 제어 상태
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);

  // Optional 미디어 지원 상태
  const [participationMode, setParticipationMode] = useState("participant"); // 'viewer' | 'participant'
  const [hasMediaPermission, setHasMediaPermission] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false); // 미디어 디바이스 재초기화 중 플래그
  const [reconnectionError, setReconnectionError] = useState(null);

  // WebRTC 재연결 상태 (useWebRTC에서 이동)
  const [webrtcReconnectionState, setWebrtcReconnectionState] = useState({
    isReconnecting: false, // WebRTC P2P 재연결 진행 중
    isRemoteReconnecting: false, // 상대방 재연결 중
    reconnectTimeout: null, // 재연결 타임아웃 타이머
    targetSocketId: null, // 연결 대상 소켓 ID
  });

  // WebRTC 초기화 상태 머신 (useWebRTC에서 이동)
  const [webrtcInitState, setWebrtcInitState] = useState({
    status: "idle", // 'idle' | 'initializing' | 'ready' | 'error'
    isProcessingSignal: false, // 시그널 처리 중
    pendingOffer: null, // 대기 중인 Offer
    pendingConnection: null, // 대기 중인 연결 정보 { targetSocketId, asInitiator }
  });

  // WebRTCService 인스턴스 (ref로 관리하여 재생성 방지)
  const webrtcServiceRef = useRef(null);

  // 화면 공유 스트림 임시 저장
  const screenStreamRef = useRef(null);
  const originalVideoTrackRef = useRef(null);

  // WebRTC 재연결 콜백 함수 저장 (useWebRTC에서 제공)
  const reconnectMediaRef = useRef(null);

  // WebRTCService 인스턴스 초기화
  if (!webrtcServiceRef.current) {
    webrtcServiceRef.current = new WebRTCService();
  }

  /**
   * useWebRTC에서 제공하는 reconnectMedia 콜백 함수 등록
   * @param {Function} reconnectMediaFn - reconnectMedia(newStream) 함수
   */
  const setReconnectMediaCallback = useCallback((reconnectMediaFn) => {
    reconnectMediaRef.current = reconnectMediaFn;
    console.log("[MediaContext] reconnectMedia 콜백 등록 완료");
  }, []);

  /**
   * WebRTC 재연결 시작
   * @param {string} targetSocketId - 연결 대상 소켓 ID
   * @param {number} timestamp - 재연결 시작 타임스탬프
   */
  const startWebRTCReconnection = useCallback((targetSocketId, timestamp = Date.now()) => {
    console.log(
      `[MediaContext] WebRTC 재연결 시작 - 대상: ${targetSocketId}, timestamp: ${timestamp}`
    );

    // 타임아웃 설정 (10초)
    const timeoutId = setTimeout(() => {
      console.error("❌ [MediaContext] WebRTC 재연결 타임아웃 (10초)");
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
    console.log("[MediaContext] WebRTC 재연결 완료");

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
    console.log("[MediaContext] 상대방 WebRTC 재연결 감지");

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
    console.log("[MediaContext] WebRTC 재연결 상태 초기화");

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

  /**
   * WebRTC 초기화 시작
   */
  const startWebRTCInitialization = useCallback(() => {
    console.log("[MediaContext] WebRTC 초기화 시작");
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
    console.log("[MediaContext] WebRTC 초기화 완료");
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
    console.error("[MediaContext] WebRTC 초기화 에러:", errorMessage);
    setWebrtcInitState((prev) => ({
      ...prev,
      status: "error",
    }));
  }, []);

  /**
   * WebRTC 초기화 상태 리셋
   */
  const resetWebRTCInitState = useCallback(() => {
    console.log("[MediaContext] WebRTC 초기화 상태 리셋");
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

  /**
   * 로컬 미디어 스트림 초기화 (웹캠 + 마이크)
   * @returns {Promise<MediaStream>}
   */
  const initializeMedia = useCallback(async () => {
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

      setLocalStream(stream);
      setIsVideoEnabled(true);
      setIsAudioEnabled(true);

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
  }, []);

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

  /**
   * 미디어 스트림 재초기화 (디바이스 변경 시 사용)
   * @param {string} videoDeviceId - 선택된 비디오 디바이스 ID
   * @param {string} audioDeviceId - 선택된 오디오 디바이스 ID
   * @returns {Promise<MediaStream>}
   */
  const reinitializeMedia = useCallback(
    async (videoDeviceId, audioDeviceId) => {
      // 이전 스트림 백업 (롤백용)
      const previousStream = localStream;

      try {
        console.log("\n========== [MediaContext] 미디어 스트림 재초기화 시작 ==========");
        setIsReconnecting(true);
        setReconnectionError(null);

        // 1. 기존 localStream 정리 (tracks stop)
        if (localStream) {
          console.log("🧹 기존 로컬 스트림 정리 중...");
          localStream.getTracks().forEach((track) => {
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
              setLocalStream(previousStream);
              console.log("✅ 이전 스트림 복원 완료");
            }

            throw new Error(`WebRTC 재연결 실패: ${reconnectError.message}`);
          }
        } else {
          console.log("⚠️ reconnectMedia 콜백이 등록되지 않음 (WebRTC 재연결 스킵)");
        }

        // 4. Context 상태 업데이트
        setLocalStream(newStream);
        setIsVideoEnabled(true);
        setIsAudioEnabled(true);
        setParticipationMode("participant");
        setHasMediaPermission(true);
        setIsReconnecting(false);

        console.log("========== [MediaContext] 미디어 스트림 재초기화 완료 ==========\n");
        return newStream;
      } catch (error) {
        console.error("❌ [MediaContext] 미디어 스트림 재초기화 실패:", error);

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
        if (previousStream && !localStream) {
          console.log("🔙 에러 발생, 이전 스트림 복원");
          setLocalStream(previousStream);
        }

        throw error;
      }
    },
    [localStream]
  );

  /**
   * 특정 디바이스로 미디어 스트림 초기화
   * @param {string} videoDeviceId - 선택된 비디오 디바이스 ID
   * @param {string} audioDeviceId - 선택된 오디오 디바이스 ID
   * @returns {Promise<MediaStream>}
   */
  const initializeMediaWithDevice = useCallback(async (videoDeviceId, audioDeviceId) => {
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

      setLocalStream(stream);
      setIsVideoEnabled(true);
      setIsAudioEnabled(true);

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
  }, []);

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
      videoTrack.enabled = !videoTrack.enabled;
      setIsVideoEnabled(videoTrack.enabled);
      console.log(`비디오 ${videoTrack.enabled ? "활성화" : "비활성화"}`);
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
      audioTrack.enabled = !audioTrack.enabled;
      setIsAudioEnabled(audioTrack.enabled);
      console.log(`오디오 ${audioTrack.enabled ? "활성화" : "비활성화"}`);
    }
  }, [localStream]);

  /**
   * 화면 공유 시작
   * @returns {Promise<void>}
   */
  const stopScreenShare = useCallback(() => {
    try {
      if (!isScreenSharing) {
        console.log("화면 공유 중이 아닙니다.");
        return;
      }

      console.log("화면 공유 중지");

      const webrtcService = webrtcServiceRef.current;
      const screenStream = screenStreamRef.current;

      // 화면 공유 스트림 중지
      if (screenStream) {
        screenStream.getTracks().forEach((track) => {
          track.stop();
        });
        screenStreamRef.current = null;
      }

      // 원래 비디오 트랙으로 복원
      const currentScreenTrack = webrtcService.getCurrentVideoTrack();
      const originalVideoTrack = originalVideoTrackRef.current;

      if (currentScreenTrack && originalVideoTrack) {
        webrtcService.replaceTrack(currentScreenTrack, originalVideoTrack);
        originalVideoTrackRef.current = null;
      }

      setIsScreenSharing(false);
      console.log("화면 공유 중지 완료");
    } catch (error) {
      console.error("화면 공유 중지 에러:", error);
    }
  }, [isScreenSharing]);

  const startScreenShare = useCallback(async () => {
    try {
      if (isScreenSharing) {
        console.log("이미 화면 공유 중입니다.");
        return;
      }

      console.log("화면 공유 시작");

      // 화면 공유 스트림 획득
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          cursor: "always",
        },
        audio: false,
      });

      const screenTrack = screenStream.getVideoTracks()[0];
      const webrtcService = webrtcServiceRef.current;

      // 현재 비디오 트랙 저장
      const currentVideoTrack = webrtcService.getCurrentVideoTrack();
      if (currentVideoTrack) {
        originalVideoTrackRef.current = currentVideoTrack;
      }

      // WebRTC 연결에서 비디오 트랙 교체
      if (currentVideoTrack) {
        webrtcService.replaceTrack(currentVideoTrack, screenTrack);
      }

      // 화면 공유 중지 이벤트 처리 (사용자가 브라우저 UI에서 중지)
      const handleScreenEnded = () => {
        console.log("화면 공유가 사용자에 의해 중지됨");
        stopScreenShare();
      };
      screenTrack.onended = handleScreenEnded;

      screenStreamRef.current = screenStream;
      setIsScreenSharing(true);
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
  }, [isScreenSharing, stopScreenShare]);

  /**
   * 모든 미디어 스트림 정리
   */
  const cleanupMedia = useCallback(() => {
    try {
      console.log("미디어 리소스 정리 시작");

      // 로컬 스트림 정리
      if (localStream) {
        localStream.getTracks().forEach((track) => {
          track.stop();
          console.log(`트랙 중지: ${track.kind}`);
        });
        setLocalStream(null);
      }

      // 화면 공유 스트림 정리
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((track) => {
          track.stop();
        });
        screenStreamRef.current = null;
      }

      // 원격 스트림 정리
      setRemoteStream(null);

      // 상태 초기화
      setIsVideoEnabled(true);
      setIsAudioEnabled(true);
      setIsScreenSharing(false);
      originalVideoTrackRef.current = null;

      console.log("미디어 리소스 정리 완료");
    } catch (error) {
      console.error("미디어 정리 에러:", error);
    }
  }, [localStream]);

  // 컴포넌트 언마운트 시 정리
  useEffect(() => {
    return () => {
      cleanupMedia();
    };
  }, [cleanupMedia]);

  const value = {
    // 스트림 상태
    localStream,
    remoteStream,
    setRemoteStream,

    // 미디어 제어 상태
    isVideoEnabled,
    isAudioEnabled,
    isScreenSharing,

    // Optional 미디어 지원 상태
    participationMode,
    setParticipationMode,
    hasMediaPermission,
    setHasMediaPermission,
    isReconnecting,
    reconnectionError,
    setReconnectionError,

    // WebRTC 재연결 상태 (useWebRTC에서 사용)
    webrtcReconnectionState,
    startWebRTCReconnection,
    completeWebRTCReconnection,
    startRemoteWebRTCReconnection,
    setTargetSocketId,
    resetWebRTCReconnectionState,

    // WebRTC 초기화 상태 머신 (useWebRTC에서 사용)
    webrtcInitState,
    startWebRTCInitialization,
    completeWebRTCInitialization,
    setWebRTCInitializationError,
    resetWebRTCInitState,
    setSignalProcessing,
    setPendingOffer,
    setPendingConnection,

    // WebRTCService 인스턴스
    webrtcService: webrtcServiceRef.current,

    // 미디어 제어 함수
    initializeMedia,
    toggleVideo,
    toggleAudio,
    startScreenShare,
    stopScreenShare,
    cleanupMedia,

    // 디바이스 선택 함수
    getAvailableDevices,
    initializeMediaWithDevice,
    reinitializeMedia,
    switchToParticipantMode,

    // WebRTC 재연결 콜백 등록
    setReconnectMediaCallback,
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
