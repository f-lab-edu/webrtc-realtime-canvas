"use client";

import { useCallback, useEffect, useRef } from "react";
import { useMediaContext } from "@/contexts/MediaContext";
import { useRoomContext } from "@/contexts/RoomContext";

/**
 * useWebRTC 커스텀 훅
 * P2P Mesh: 다중 Peer 연결 초기화, 시그널링, ICE candidate 처리를 담당
 */
function useWebRTC() {
  // Context에서 필요한 값 가져오기
  const { socketService, roomId, participants } = useRoomContext();
  const { webrtcService, localStream, remoteStreams, addRemoteStream, removeRemoteStream } =
    useMediaContext();

  // 중복 실행 방지 플래그
  const hasInitializedRef = useRef(false);
  const isInitializingRef = useRef(false);

  // 최신 값을 참조하기 위한 ref
  const localStreamRef = useRef(localStream);
  const socketServiceRef = useRef(socketService);
  const webrtcServiceRef = useRef(webrtcService);

  // ref 업데이트
  useEffect(() => {
    localStreamRef.current = localStream;
    socketServiceRef.current = socketService;
    webrtcServiceRef.current = webrtcService;
  }, [localStream, socketService, webrtcService]);

  /**
   * WebRTCService 이벤트 핸들러 설정 (한 번만 실행)
   * signal, stream, connect, error, close, iceStateChange 이벤트 처리
   */
  useEffect(() => {
    if (!webrtcService) {
      return;
    }

    console.log("[useWebRTC] WebRTCService 이벤트 핸들러 설정");

    // 1. Signal 이벤트: Peer가 시그널 데이터를 생성할 때 서버로 전송
    webrtcService.onSignal((socketId, signal) => {
      if (!socketServiceRef.current) {
        console.error("SocketService가 없습니다.");
        return;
      }

      console.log(`[송신] WebRTC ${signal.type} -> ${socketId}`);

      if (signal.type === "offer") {
        socketServiceRef.current.emit("signal:offer", { to: socketId, signal });
      } else if (signal.type === "answer") {
        socketServiceRef.current.emit("signal:answer", { to: socketId, signal });
      } else {
        // ICE candidate
        socketServiceRef.current.emit("signal:ice-candidate", {
          to: socketId,
          candidate: signal,
        });
      }
    });

    // 2. Stream 이벤트: 원격 스트림 수신
    webrtcService.onStream((socketId, stream) => {
      console.log(`[수신] 원격 스트림 수신 from ${socketId}`);
      console.log(`  - stream ID: ${stream.id}`);
      console.log(`  - 비디오 트랙: ${stream.getVideoTracks().length}개`);
      console.log(`  - 오디오 트랙: ${stream.getAudioTracks().length}개`);

      addRemoteStream(socketId, stream);
    });

    // 3. Connect 이벤트: P2P 연결 완료
    webrtcService.onConnect((socketId) => {
      console.log(`✅ [useWebRTC] P2P 연결 완료: ${socketId}`);
    });

    // 4. Error 이벤트: WebRTC 에러
    webrtcService.onError((socketId, error) => {
      console.error(`❌ [useWebRTC] WebRTC 에러 from ${socketId}:`, error);
    });

    // 5. Close 이벤트: 연결 종료
    webrtcService.onClose((socketId) => {
      console.log(`🔌 [useWebRTC] WebRTC 연결 종료: ${socketId}`);
      removeRemoteStream(socketId);
    });

    // 6. ICE 상태 변경 이벤트
    webrtcService.onIceStateChange((socketId, state) => {
      console.log(`[ICE State] ${socketId}: ${state}`);
    });
  }, [webrtcService, addRemoteStream, removeRemoteStream]);

  /**
   * room:joined 핸들러 (기존 참가자와 연결)
   * 나(신규 참가자)가 기존 참가자들에게 offer 전송
   */
  const handleRoomJoined = useCallback(
    (data) => {
      console.log("[room:joined] 방 참가 성공:", data);

      const { participants: existingParticipants } = data;
      const mySocketId = socketServiceRef.current?.socket?.id;

      if (!existingParticipants || existingParticipants.length === 0) {
        console.log("기존 참가자가 없습니다.");
        return;
      }

      // 자신을 제외한 기존 참가자들과 연결
      const otherParticipants = existingParticipants.filter((p) => p !== mySocketId);

      if (otherParticipants.length === 0) {
        console.log("연결할 다른 참가자가 없습니다.");
        return;
      }

      if (!localStreamRef.current) {
        console.warn("로컬 스트림이 아직 준비되지 않았습니다. 연결을 나중에 시도합니다.");
        return;
      }

      console.log(`기존 참가자 ${otherParticipants.length}명과 연결 시작 (나는 initiator)`);

      // 기존 참가자들에게 Offer 전송 (initiator: true)
      otherParticipants.forEach((participantSocketId) => {
        console.log(`[P2P Mesh] 연결 초기화: ${participantSocketId} (initiator: true)`);
        webrtcServiceRef.current.initializePeer(
          participantSocketId,
          true,
          localStreamRef.current
        );
      });
    },
    []
  );

  /**
   * room:participant-joined 핸들러 (새 참가자 연결)
   * 기존 참가자인 나는 새 참가자의 offer를 기다림 (initiator: false)
   */
  const handleParticipantJoined = useCallback(
    (data) => {
      const newParticipantSocketId = typeof data === "string" ? data : data.socketId;
      const newParticipantNickname = typeof data === "object" ? data.nickname : null;

      console.log(
        `[room:participant-joined] 새 참가자 입장: ${newParticipantSocketId} (${newParticipantNickname || "알 수 없음"})`
      );

      const mySocketId = socketServiceRef.current?.socket?.id;

      // 자기 자신인 경우 무시
      if (mySocketId === newParticipantSocketId) {
        console.log("자기 자신의 입장 이벤트입니다. 무시");
        return;
      }

      if (!localStreamRef.current) {
        console.warn("로컬 스트림이 아직 준비되지 않았습니다. 연결을 나중에 시도합니다.");
        return;
      }

      // 새 참가자의 Offer를 기다림 (initiator: false)
      console.log(`[P2P Mesh] Peer 준비: ${newParticipantSocketId} (initiator: false, Offer 대기)`);
      webrtcServiceRef.current.initializePeer(
        newParticipantSocketId,
        false,
        localStreamRef.current
      );
    },
    []
  );

  /**
   * WebRTC 시그널 핸들러들
   * WebRTCService.signal()로 직접 전달 (시그널 큐가 WebRTCService에서 처리됨)
   */
  const handleOffer = useCallback((data) => {
    const { from, signal } = data;
    console.log(`[수신] WebRTC Offer <- ${from}`);

    // WebRTCService에 시그널 전달 (자동으로 큐잉 또는 즉시 처리)
    webrtcServiceRef.current.signal(from, signal);
  }, []);

  const handleAnswer = useCallback((data) => {
    const { from, signal } = data;
    console.log(`[수신] WebRTC Answer <- ${from}`);

    // WebRTCService에 시그널 전달
    webrtcServiceRef.current.signal(from, signal);
  }, []);

  const handleIceCandidate = useCallback((data) => {
    const { from, candidate } = data;
    console.log(`[수신] ICE Candidate <- ${from}`);

    // WebRTCService에 시그널 전달
    webrtcServiceRef.current.signal(from, candidate);
  }, []);

  /**
   * room:participant-left 핸들러
   * 참가자 퇴장 시 해당 Peer 제거 및 원격 스트림 제거
   */
  const handleParticipantLeft = useCallback(
    (socketId) => {
      console.log(`[room:participant-left] 참가자 퇴장: ${socketId}`);

      // WebRTCService에서 Peer 제거
      webrtcServiceRef.current.removePeer(socketId);

      // MediaContext에서 원격 스트림 제거
      removeRemoteStream(socketId);
    },
    [removeRemoteStream]
  );

  /**
   * Socket 이벤트 리스너 설정
   */
  useEffect(() => {
    if (!socketService || !roomId) {
      return;
    }

    console.log("[useWebRTC] Socket 이벤트 리스너 등록");

    // 이벤트 리스너 등록
    socketService.on("room:joined", handleRoomJoined);
    socketService.on("room:participant-joined", handleParticipantJoined);
    socketService.on("signal:offer", handleOffer);
    socketService.on("signal:answer", handleAnswer);
    socketService.on("signal:ice-candidate", handleIceCandidate);
    socketService.on("room:participant-left", handleParticipantLeft);

    // 클린업 함수
    return () => {
      console.log("[useWebRTC] Socket 이벤트 리스너 제거");
      socketService.off("room:joined", handleRoomJoined);
      socketService.off("room:participant-joined", handleParticipantJoined);
      socketService.off("signal:offer", handleOffer);
      socketService.off("signal:answer", handleAnswer);
      socketService.off("signal:ice-candidate", handleIceCandidate);
      socketService.off("room:participant-left", handleParticipantLeft);
    };
  }, [
    socketService,
    roomId,
    handleRoomJoined,
    handleParticipantJoined,
    handleOffer,
    handleAnswer,
    handleIceCandidate,
    handleParticipantLeft,
  ]);

  /**
   * 컴포넌트 언마운트 시 모든 WebRTC 연결 정리
   */
  useEffect(() => {
    return () => {
      console.log("[useWebRTC] 정리: 모든 WebRTC 연결 종료");
      webrtcService.destroyAll();
    };
  }, [webrtcService]);

  return {
    remoteStreams, // P2P Mesh: 다중 원격 스트림
  };
}

export default useWebRTC;
