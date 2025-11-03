"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMediaContext } from "@/contexts/MediaContext";
import { useRoomContext } from "@/contexts/RoomContext";

/**
 * useWebRTC 커스텀 훅
 * WebRTC 연결 초기화, 시그널링, ICE candidate 처리를 담당
 */
function useWebRTC() {
  // Context에서 필요한 값 가져오기
  const { socketService, roomId } = useRoomContext();
  const { webrtcService, localStream, setRemoteStream } = useMediaContext();

  // WebRTC 연결 상태
  const [connectionState, setConnectionState] = useState("disconnected"); // 'connecting' | 'connected' | 'disconnected'
  const [isInitiator, setIsInitiator] = useState(false);

  // 시그널링 처리 중복 방지를 위한 ref
  const isProcessingSignalRef = useRef(false);
  const hasInitializedRef = useRef(false);

  /**
   * WebRTC 연결 초기화
   * @param {boolean} initiator - offer를 생성하는 측인지 여부
   */
  const initializeWebRTC = useCallback(
    (initiator) => {
      if (!localStream) {
        console.error("로컬 스트림이 없습니다.");
        return;
      }

      if (hasInitializedRef.current) {
        console.warn("WebRTC가 이미 초기화되었습니다.");
        return;
      }

      try {
        console.log(`WebRTC 초기화 시작 (initiator: ${initiator})`);
        setIsInitiator(initiator);
        setConnectionState("connecting");

        // WebRTCService 초기화
        webrtcService.initialize(initiator, localStream);

        // 시그널 이벤트 핸들러 등록 (SDP offer/answer, ICE candidate)
        webrtcService.onSignal((signal) => {
          if (!socketService || !roomId) {
            console.error("SocketService 또는 roomId가 없습니다.");
            return;
          }

          // 시그널 타입에 따라 다른 이벤트로 전송
          if (signal.type === "offer") {
            console.log("Offer 전송");
            socketService.emit("signal:offer", {
              roomId,
              signal,
            });
          } else if (signal.type === "answer") {
            console.log("Answer 전송");
            socketService.emit("signal:answer", {
              roomId,
              signal,
            });
          } else {
            // ICE candidate
            console.log("ICE candidate 전송");
            socketService.emit("signal:ice-candidate", {
              roomId,
              candidate: signal,
            });
          }
        });

        // 원격 스트림 수신 핸들러
        webrtcService.onStream((stream) => {
          console.log("원격 스트림 수신");
          setRemoteStream(stream);
        });

        // 연결 성공 핸들러
        webrtcService.onConnect(() => {
          console.log("WebRTC P2P 연결 성공");
          setConnectionState("connected");
        });

        // 에러 핸들러
        webrtcService.onError((error) => {
          console.error("WebRTC 에러:", error);
          setConnectionState("disconnected");
        });

        // 연결 종료 핸들러
        webrtcService.onClose(() => {
          console.log("WebRTC 연결 종료");
          setConnectionState("disconnected");
          setRemoteStream(null);
        });

        hasInitializedRef.current = true;
        console.log("WebRTC 초기화 완료");
      } catch (error) {
        console.error("WebRTC 초기화 에러:", error);
        setConnectionState("disconnected");
      }
    },
    [localStream, webrtcService, socketService, roomId, setRemoteStream]
  );

  /**
   * 시그널 데이터 처리
   * @param {Object} signalData - SDP 또는 ICE candidate 데이터
   */
  const handleSignal = useCallback(
    (signalData) => {
      if (isProcessingSignalRef.current) {
        console.warn("시그널 처리 중입니다. 대기 중...");
        return;
      }

      try {
        isProcessingSignalRef.current = true;
        webrtcService.signal(signalData);
        console.log("시그널 처리 완료:", signalData.type || "candidate");
      } catch (error) {
        console.error("시그널 처리 에러:", error);
      } finally {
        isProcessingSignalRef.current = false;
      }
    },
    [webrtcService]
  );

  /**
   * Socket 이벤트 리스너 설정
   */
  useEffect(() => {
    if (!socketService || !roomId) {
      return;
    }

    // 새 참가자 입장 이벤트 (Initiator 측)
    const handleParticipantJoined = () => {
      console.log("새 참가자 입장, WebRTC 연결 시작 (initiator: true)");

      // 이미 초기화되었으면 무시
      if (hasInitializedRef.current) {
        console.warn("WebRTC가 이미 초기화되어 있습니다.");
        return;
      }

      // Initiator로 WebRTC 초기화 (offer 생성)
      initializeWebRTC(true);
    };

    // Offer 수신 이벤트 (Non-initiator 측)
    const handleOffer = (data) => {
      console.log("Offer 수신");

      // 이미 초기화되었으면 시그널만 처리
      if (hasInitializedRef.current) {
        handleSignal(data.signal);
        return;
      }

      // Non-initiator로 WebRTC 초기화 후 offer 처리
      initializeWebRTC(false);

      // 초기화 후 약간의 지연을 두고 offer 처리
      setTimeout(() => {
        handleSignal(data.signal);
      }, 100);
    };

    // Answer 수신 이벤트
    const handleAnswer = (data) => {
      console.log("Answer 수신");
      handleSignal(data.signal);
    };

    // ICE candidate 수신 이벤트
    const handleIceCandidate = (data) => {
      console.log("ICE candidate 수신");
      handleSignal(data.candidate);
    };

    // 참가자 퇴장 이벤트
    const handleParticipantLeft = () => {
      console.log("참가자 퇴장, WebRTC 연결 종료");

      // WebRTC 연결 정리
      webrtcService.destroy();
      setRemoteStream(null);
      setConnectionState("disconnected");
      hasInitializedRef.current = false;
    };

    // 이벤트 리스너 등록
    socketService.on("room:participant-joined", handleParticipantJoined);
    socketService.on("signal:offer", handleOffer);
    socketService.on("signal:answer", handleAnswer);
    socketService.on("signal:ice-candidate", handleIceCandidate);
    socketService.on("room:participant-left", handleParticipantLeft);

    // 클린업 함수
    return () => {
      socketService.off("room:participant-joined", handleParticipantJoined);
      socketService.off("signal:offer", handleOffer);
      socketService.off("signal:answer", handleAnswer);
      socketService.off("signal:ice-candidate", handleIceCandidate);
      socketService.off("room:participant-left", handleParticipantLeft);
    };
  }, [socketService, roomId, initializeWebRTC, handleSignal, webrtcService, setRemoteStream]);

  /**
   * 컴포넌트 언마운트 시 WebRTC 정리
   */
  useEffect(() => {
    return () => {
      if (hasInitializedRef.current) {
        console.log("useWebRTC 정리: WebRTC 연결 종료");
        webrtcService.destroy();
        hasInitializedRef.current = false;
      }
    };
  }, [webrtcService]);

  return {
    connectionState,
    isInitiator,
    initializeWebRTC,
  };
}

export default useWebRTC;
