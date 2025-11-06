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
  const { socketService, roomId, participants } = useRoomContext();
  const { webrtcService, localStream, setRemoteStream } = useMediaContext();

  // WebRTC 연결 상태
  const [connectionState, setConnectionState] = useState("disconnected");
  const [isInitiator, setIsInitiator] = useState(false);

  // 중복 실행 방지를 위한 ref
  const isProcessingSignalRef = useRef(false);
  const hasInitializedRef = useRef(false);
  const isInitializingRef = useRef(false); // 초기화 진행 중 플래그
  const pendingOfferRef = useRef(null);
  const pendingConnectionRef = useRef(null); // 대기 중인 연결 정보 저장 (localStream 준비 대기)
  const targetSocketIdRef = useRef(null); // 연결 대상 소켓 ID 저장
  const listenersRegisteredRef = useRef(false); // 이벤트 리스너 등록 여부 플래그

  // 최신 값을 참조하기 위한 ref
  const localStreamRef = useRef(localStream);
  const socketServiceRef = useRef(socketService);
  const webrtcServiceRef = useRef(webrtcService);
  const setRemoteStreamRef = useRef(setRemoteStream);

  // ref 업데이트
  useEffect(() => {
    localStreamRef.current = localStream;
    socketServiceRef.current = socketService;
    webrtcServiceRef.current = webrtcService;
    setRemoteStreamRef.current = setRemoteStream;
  }, [localStream, socketService, webrtcService, setRemoteStream]);

  /**
   * WebRTC 연결 초기화
   */
  const initializeWebRTC = useCallback(
    (initiator, targetSocketId) => {
      // 기존 Peer가 있으면 먼저 정리 후 재초기화
      const currentPeer = webrtcServiceRef.current.peer;
      if (currentPeer && !currentPeer.destroyed) {
        console.warn("⚠️ 기존 Peer가 활성 상태입니다. 먼저 정리 후 재초기화합니다.");

        try {
          currentPeer.destroy();
          console.log("✅ 기존 Peer destroyed");
        } catch (error) {
          console.error("Peer 정리 중 오류:", error);
        }

        // Peer 참조 명시적 제거
        webrtcServiceRef.current.peer = null;
      }

      if (!localStreamRef.current) {
        console.error("로컬 스트림이 없습니다.");
        return;
      }

      if (hasInitializedRef.current) {
        console.warn("WebRTC가 이미 초기화되었습니다.");
        return;
      }

      if (isInitializingRef.current) {
        console.warn("WebRTC 초기화가 이미 진행 중입니다.");
        return;
      }

      if (!targetSocketId) {
        console.error("대상 소켓 ID가 없습니다.");
        return;
      }

      try {
        const role = initiator ? "발신자(Offer 생성)" : "수신자(Answer 생성)";
        console.log(
          `[initializeWebRTC] 🚀 WebRTC 초기화 시작\n` +
            `  - 역할: ${role}\n` +
            `  - initiator: ${initiator}\n` +
            `  - 대상 소켓: ${targetSocketId}\n` +
            `  - 타임스탬프: ${new Date().toISOString()}`
        );
        isInitializingRef.current = true;
        setIsInitiator(initiator);
        setConnectionState("connecting");
        targetSocketIdRef.current = targetSocketId;

        // Phase 16-1: 핸들러를 initialize() 전에 등록
        console.log("🎯 [useWebRTC] Phase 16-1: 핸들러 등록 (initialize 전)");

        // 1. 시그널 이벤트 핸들러 - 먼저 등록!
        webrtcServiceRef.current.onSignal((signal) => {
          if (!socketServiceRef.current || !targetSocketIdRef.current) {
            console.error("SocketService 또는 대상 소켓 ID가 없습니다.");
            return;
          }

          const target = targetSocketIdRef.current;

          if (signal.type === "offer") {
            console.log(`Offer 전송 -> ${target}`);
            socketServiceRef.current.emit("signal:offer", { to: target, signal });
          } else if (signal.type === "answer") {
            console.log(`Answer 전송 -> ${target}`);
            socketServiceRef.current.emit("signal:answer", { to: target, signal });
          } else {
            console.log(`ICE candidate 전송 -> ${target}`);
            socketServiceRef.current.emit("signal:ice-candidate", {
              to: target,
              candidate: signal,
            });
          }
        });

        // 2. 원격 스트림 수신 핸들러 - 먼저 등록!
        webrtcServiceRef.current.onStream((stream) => {
          console.log(`\n========== [useWebRTC Phase 16-1 onStream 핸들러] ==========`);
          console.log(`⏰ 타임스탬프: ${new Date().toISOString()}`);
          console.log(`🆔 Stream ID: ${stream.id}`);
          console.log(`📊 Stream 상태:`);
          console.log(`   - active: ${stream.active}`);
          console.log(`   - 비디오 트랙: ${stream.getVideoTracks().length}개`);
          console.log(`   - 오디오 트랙: ${stream.getAudioTracks().length}개`);

          const videoTracks = stream.getVideoTracks();
          const audioTracks = stream.getAudioTracks();

          console.log(`\n🎥 비디오 트랙 상세:`);
          videoTracks.forEach((track, i) => {
            console.log(`   [${i}] ${track.label}`);
            console.log(`       - id: ${track.id}`);
            console.log(`       - enabled: ${track.enabled}`);
            console.log(`       - muted: ${track.muted}`);
            console.log(`       - readyState: ${track.readyState}`);
          });

          console.log(`\n🎵 오디오 트랙 상세:`);
          audioTracks.forEach((track, i) => {
            console.log(`   [${i}] ${track.label}`);
            console.log(`       - id: ${track.id}`);
            console.log(`       - enabled: ${track.enabled}`);
            console.log(`       - muted: ${track.muted}`);
            console.log(`       - readyState: ${track.readyState}`);
          });

          console.log(`\n📡 setRemoteStream 호출 전:`);
          console.log(`   - 이전 remoteStream: ${setRemoteStreamRef.current.toString()}`);

          setRemoteStream(stream); // ✅ 직접 호출로 상태 업데이트
          setRemoteStreamRef.current(stream); // ref도 업데이트 (백업용)
          setConnectionState("connected");

          console.log(`✅ setRemoteStream 호출 완료`);
          console.log(`   - React 상태 업데이트 대기 중 (리렌더링 예상)`);
          console.log(`========== [useWebRTC onStream 종료] ==========\n`);
        });

        // 3. 연결 성공 핸들러 - 먼저 등록!
        webrtcServiceRef.current.onConnect(() => {
          console.log("✅ [useWebRTC Phase 16-1] peer.on('connect') 이벤트 수신");
          console.log("🎬 [useWebRTC] P2P 연결 완료, 비디오 재생 준비됨");
          setConnectionState("connected");

          // Phase 15: P2P 연결 완료 이벤트 발생
          window.dispatchEvent(new CustomEvent("webrtc-peer-connected"));
        });

        // 4. 에러 핸들러 - 먼저 등록!
        webrtcServiceRef.current.onError((error) => {
          console.error("❌ [useWebRTC] WebRTC 에러:", error);
          setConnectionState("disconnected");
        });

        // 5. 연결 종료 핸들러 - 먼저 등록!
        webrtcServiceRef.current.onClose(() => {
          console.log("🔌 [useWebRTC] WebRTC 연결 종료");
          setConnectionState("disconnected");
          setRemoteStreamRef.current(null);
        });

        // 6. WebRTCService 초기화 (핸들러 등록 후!)
        console.log("🚀 [useWebRTC Phase 16-1] WebRTC 초기화 시작 (핸들러 등록 완료)");
        webrtcServiceRef.current.initialize(initiator, localStreamRef.current);

        hasInitializedRef.current = true;
        isInitializingRef.current = false;
        console.log(
          `[initializeWebRTC] ✅ WebRTC 초기화 완료\n` +
            `  - Peer 상태: 활성\n` +
            `  - 시그널링 대기 중\n` +
            `  - 타임스탬프: ${new Date().toISOString()}`
        );
      } catch (error) {
        console.error(
          `[initializeWebRTC] ❌ WebRTC 초기화 에러\n` +
            `  - 에러: ${error.message}\n` +
            `  - Stack: ${error.stack}`
        );
        setConnectionState("disconnected");
        isInitializingRef.current = false;
      }
    },
    [setRemoteStream]
  );

  /**
   * 연결 시작 시도 함수
   * localStream이 준비되지 않았으면 대기열에 추가, 준비되었으면 즉시 연결 시작
   */
  const tryStartConnection = useCallback(
    (targetSocketId, asInitiator) => {
      const mySocketId = socketServiceRef.current?.socket?.id;
      const role = asInitiator ? "발신자(Offer 생성)" : "수신자(Answer 생성)";
      console.log(
        `[tryStartConnection] 연결 시도\n` +
          `  - 내 소켓: ${mySocketId}\n` +
          `  - 대상 소켓: ${targetSocketId}\n` +
          `  - 역할: ${role} (initiator: ${asInitiator})`
      );

      // 자기 자신인지 확인
      if (mySocketId === targetSocketId) {
        console.warn("[tryStartConnection] ❌ 자기 자신의 소켓 ID입니다. 무시");
        return false;
      }

      // localStream이 준비되지 않았으면 대기열에 추가
      if (!localStreamRef.current) {
        console.log(
          `[tryStartConnection] ⏳ 로컬 스트림 대기 중, 연결 대기열에 추가\n` +
            `  - 대기 정보: { target: ${targetSocketId}, initiator: ${asInitiator} }`
        );
        pendingConnectionRef.current = { targetSocketId, asInitiator };
        return false;
      }

      // 이미 초기화되었거나 초기화 중이면 무시
      if (hasInitializedRef.current || isInitializingRef.current) {
        console.warn(
          `[tryStartConnection] ⚠️ 이미 WebRTC 연결이 있거나 초기화 중입니다.\n` +
            `  - hasInitialized: ${hasInitializedRef.current}\n` +
            `  - isInitializing: ${isInitializingRef.current}`
        );
        return false;
      }

      // 연결 시작
      console.log(
        `[tryStartConnection] ✅ WebRTC 연결 시작\n` +
          `  - 역할: ${role}\n` +
          `  - 대상: ${targetSocketId}`
      );
      initializeWebRTC(asInitiator, targetSocketId);
      return true;
    },
    [initializeWebRTC]
  );

  /**
   * 시그널 데이터 처리
   */
  const handleSignal = useCallback((signalData) => {
    if (isProcessingSignalRef.current) {
      console.warn("시그널 처리 중입니다. 대기 중...");
      return;
    }

    if (!webrtcServiceRef.current.peer || webrtcServiceRef.current.peer.destroyed) {
      console.warn("Peer가 없거나 종료된 상태입니다. 시그널 무시");
      return;
    }

    // 시그널링 상태 확인
    const peer = webrtcServiceRef.current.peer;
    const signalingState = peer._pc?.signalingState;

    if (signalData.type === "offer" && signalingState === "stable") {
      console.log("Stable 상태에서 Offer 수신, 재협상 시작");
    } else if (signalData.type === "answer") {
      // Answer 시그널 처리 시 signalingState 재확인 (이중 안전장치)
      if (signalingState !== "have-local-offer") {
        console.warn(
          `[handleSignal] Answer 무시: 현재 상태가 have-local-offer가 아님 (${signalingState})`
        );
        return;
      }
      console.log(`[handleSignal] Answer 처리 진행 (상태: ${signalingState})`);
    }

    try {
      isProcessingSignalRef.current = true;
      webrtcServiceRef.current.signal(signalData);
      console.log("시그널 처리 완료:", signalData.type || "candidate");
    } catch (error) {
      console.error("시그널 처리 에러:", error);
    } finally {
      isProcessingSignalRef.current = false;
    }
  }, []);

  /**
   * localStream이 준비되면 대기 중인 offer 처리
   */
  useEffect(() => {
    if (localStream && pendingOfferRef.current) {
      console.log("로컬 스트림 준비 완료, 대기 중인 Offer 처리");
      const pendingOffer = pendingOfferRef.current;
      pendingOfferRef.current = null;

      const { from, signal } = pendingOffer;
      initializeWebRTC(false, from);

      const checkPeerReady = setInterval(() => {
        if (webrtcServiceRef.current.peer && !webrtcServiceRef.current.peer.destroyed) {
          clearInterval(checkPeerReady);
          console.log("Peer 준비 완료, 대기 중인 Offer 처리");
          handleSignal(signal);
        }
      }, 10);

      setTimeout(() => clearInterval(checkPeerReady), 1000);
    }
  }, [localStream, initializeWebRTC, handleSignal]);

  /**
   * Socket 이벤트 리스너 설정
   * socketService와 roomId가 준비된 후 등록 (localStream은 나중에 준비됨)
   */
  useEffect(() => {
    if (!socketService || !roomId) {
      return;
    }

    // 이미 등록된 리스너가 있는지 확인 (중복 등록 방지)
    if (listenersRegisteredRef.current) {
      console.warn("[useWebRTC] 이벤트 리스너가 이미 등록되어 있습니다. 중복 등록 무시");
      return;
    }

    console.log("[useWebRTC] 이벤트 리스너 등록");
    listenersRegisteredRef.current = true;

    // 새 참가자 입장 이벤트
    const handleParticipantJoined = (targetSocketId) => {
      console.log(`[이벤트] 새 참가자 입장: ${targetSocketId}`);
      // tryStartConnection 함수로 통합 처리 (선입장자가 initiator)
      tryStartConnection(targetSocketId, true);
    };

    // Offer 수신 이벤트
    const handleOffer = (data) => {
      const { from, signal } = data;
      console.log(`[이벤트] Offer 수신 from ${from}`);

      if (socketServiceRef.current.socket?.id === from) {
        console.warn("자기 자신으로부터 온 Offer입니다. 무시");
        return;
      }

      if (!localStreamRef.current) {
        console.warn("로컬 스트림이 아직 준비되지 않았습니다. Offer를 대기열에 저장");
        pendingOfferRef.current = data;
        return;
      }

      if (hasInitializedRef.current) {
        const peer = webrtcServiceRef.current.peer;
        const signalingState = peer?._pc?.signalingState;
        console.log(`이미 초기화됨 (상태: ${signalingState}), Offer 시그널 처리`);

        // stable 상태에서만 offer 처리 (재협상)
        if (signalingState === "stable") {
          handleSignal(signal);
        } else {
          console.warn(`Offer 무시 (현재 상태: ${signalingState})`);
        }
        return;
      }

      if (isInitializingRef.current) {
        console.warn("초기화 진행 중, Offer 무시");
        return;
      }

      initializeWebRTC(false, from);

      const checkPeerReady = setInterval(() => {
        if (webrtcServiceRef.current.peer && !webrtcServiceRef.current.peer.destroyed) {
          clearInterval(checkPeerReady);
          console.log("Peer 준비 완료, Offer 처리");
          handleSignal(signal);
        }
      }, 10);

      setTimeout(() => clearInterval(checkPeerReady), 1000);
    };

    // Answer 수신 이벤트
    const handleAnswer = (data) => {
      const { from } = data;
      console.log(`[이벤트] Answer 수신 from ${from}`);

      if (socketServiceRef.current.socket?.id === from) {
        console.warn("자기 자신으로부터 온 Answer입니다. 무시");
        return;
      }

      const peer = webrtcServiceRef.current.peer;
      const signalingState = peer?._pc?.signalingState;
      console.log(`Answer 처리 시도 (현재 상태: ${signalingState})`);

      // have-local-offer 상태가 아니면 Answer 무시 (중복 처리 방지)
      if (signalingState !== "have-local-offer") {
        console.warn(`Answer 무시: 현재 상태가 have-local-offer가 아님 (${signalingState})`);
        return;
      }

      handleSignal(data.signal);
    };

    // ICE candidate 수신 이벤트
    const handleIceCandidate = (data) => {
      const { from } = data;
      console.log(`[이벤트] ICE candidate 수신 from ${from}`);

      if (socketServiceRef.current.socket?.id === from) {
        console.warn("자기 자신으로부터 온 ICE candidate입니다. 무시");
        return;
      }

      handleSignal(data.candidate);
    };

    // 참가자 퇴장 이벤트
    const handleParticipantLeft = () => {
      console.log("참가자 퇴장, WebRTC 연결 강제 종료");

      // 즉시 Peer 파괴
      const currentPeer = webrtcServiceRef.current.peer;
      if (currentPeer) {
        try {
          if (!currentPeer.destroyed) {
            currentPeer.destroy();
            console.log("✅ Peer destroyed");
          }
        } catch (error) {
          console.error("Peer 정리 중 오류:", error);
        }

        // 명시적으로 null 할당
        webrtcServiceRef.current.peer = null;
      }

      setRemoteStreamRef.current(null);
      setConnectionState("disconnected");
      hasInitializedRef.current = false;
      isInitializingRef.current = false;
      targetSocketIdRef.current = null;

      console.log("✅ WebRTC 연결 정리 완료");
    };

    // 이벤트 리스너 등록 전에 기존 리스너 명시적 제거 (중복 방지)
    socketService.off("room:participant-joined", handleParticipantJoined);
    socketService.off("signal:offer", handleOffer);
    socketService.off("signal:answer", handleAnswer);
    socketService.off("signal:ice-candidate", handleIceCandidate);
    socketService.off("room:participant-left", handleParticipantLeft);
    console.log("[useWebRTC] 기존 이벤트 리스너 제거 (재등록 전)");

    // 이벤트 리스너 등록
    socketService.on("room:participant-joined", handleParticipantJoined);
    socketService.on("signal:offer", handleOffer);
    socketService.on("signal:answer", handleAnswer);
    socketService.on("signal:ice-candidate", handleIceCandidate);
    socketService.on("room:participant-left", handleParticipantLeft);

    // 클린업 함수
    return () => {
      console.log("[useWebRTC] 이벤트 리스너 제거");
      socketService.off("room:participant-joined", handleParticipantJoined);
      socketService.off("signal:offer", handleOffer);
      socketService.off("signal:answer", handleAnswer);
      socketService.off("signal:ice-candidate", handleIceCandidate);
      socketService.off("room:participant-left", handleParticipantLeft);
      listenersRegisteredRef.current = false; // 플래그 리셋
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socketService, roomId]); // socketService와 roomId가 변경될 때만 재등록

  /**
   * 기존 참가자 감지 및 연결 시작
   * 방 참가 시 participants 배열에 기존 참가자가 있으면 연결 시작
   * 후입장자는 수신자(initiator: false) 역할로 Answer를 생성
   */
  useEffect(() => {
    if (!participants || participants.length === 0) {
      return;
    }

    // 기존 참가자 (자신 제외)
    const otherParticipants = participants.filter((id) => id !== socketService?.socket?.id);

    if (otherParticipants.length > 0) {
      console.log(
        `[useWebRTC] 기존 참가자 감지: ${otherParticipants[0]}, 연결 시작 시도 (후입장자 역할)`
      );
      // 후입장자는 수신자(initiator: false)로 연결 - Offer를 기다려서 Answer 생성
      tryStartConnection(otherParticipants[0], false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [participants]); // participants가 변경될 때만 실행

  /**
   * localStream 준비 시 대기 중인 연결 처리
   */
  useEffect(() => {
    if (localStream && pendingConnectionRef.current) {
      const { targetSocketId, asInitiator } = pendingConnectionRef.current;
      console.log(
        `[useWebRTC] 로컬 스트림 준비 완료, 대기 중인 연결 시작 (target: ${targetSocketId})`
      );

      // 대기열 초기화
      pendingConnectionRef.current = null;

      // 아직 초기화되지 않았으면 연결 시작
      if (!hasInitializedRef.current && !isInitializingRef.current) {
        initializeWebRTC(asInitiator, targetSocketId);
      }
    }
  }, [localStream, initializeWebRTC]);

  /**
   * socketService, roomId, localStream 변경 감지 (참조용)
   */
  useEffect(() => {
    console.log(
      `[useWebRTC] 상태 변경 - roomId: ${roomId}, localStream: ${!!localStream}, participants: ${participants.length}`
    );
  }, [socketService, roomId, localStream, participants]);

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
