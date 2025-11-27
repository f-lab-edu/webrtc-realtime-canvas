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
  const { socketService, roomId, participants, nickname, participantNicknames } = useRoomContext();
  const {
    webrtcService,
    localStream,
    setRemoteStream,
    participationMode,
    setReconnectMediaCallback,
    webrtcReconnectionState,
    startWebRTCReconnection,
    completeWebRTCReconnection,
    startRemoteWebRTCReconnection,
    setTargetSocketId,
    resetWebRTCReconnectionState,
    webrtcInitState,
    startWebRTCInitialization,
    completeWebRTCInitialization,
    setWebRTCInitializationError,
    resetWebRTCInitState,
    setSignalProcessing,
    setPendingOffer,
    setPendingConnection,
  } = useMediaContext();

  // WebRTC 연결 상태
  const [connectionState, setConnectionState] = useState("disconnected");
  const [isInitiator, setIsInitiator] = useState(false);

  // 모든 초기화 관련 ref는 MediaContext의 webrtcInitState로 대체됨
  // - hasInitialized → webrtcInitState.status === 'ready'
  // - isInitializing → webrtcInitState.status === 'initializing'
  // - isProcessingSignal → webrtcInitState.isProcessingSignal
  // - pendingOffer → webrtcInitState.pendingOffer
  // - pendingConnection → webrtcInitState.pendingConnection

  // 재연결 관련 ref는 MediaContext의 webrtcReconnectionState로 대체됨
  // - targetSocketId → webrtcReconnectionState.targetSocketId
  // - isReconnecting → webrtcReconnectionState.isReconnecting
  // - isRemoteReconnecting → webrtcReconnectionState.isRemoteReconnecting
  // - reconnectTimeout → webrtcReconnectionState.reconnectTimeout

  // 최신 값을 참조하기 위한 ref
  const localStreamRef = useRef(localStream);
  const socketServiceRef = useRef(socketService);
  const webrtcServiceRef = useRef(webrtcService);
  const setRemoteStreamRef = useRef(setRemoteStream);
  const nicknameRef = useRef(nickname);
  const participantNicknamesRef = useRef(participantNicknames);
  const participationModeRef = useRef(participationMode);

  // ref 업데이트
  useEffect(() => {
    localStreamRef.current = localStream;
    socketServiceRef.current = socketService;
    webrtcServiceRef.current = webrtcService;
    setRemoteStreamRef.current = setRemoteStream;
    nicknameRef.current = nickname;
    participantNicknamesRef.current = participantNicknames;
    participationModeRef.current = participationMode;
  }, [
    localStream,
    socketService,
    webrtcService,
    setRemoteStream,
    nickname,
    participantNicknames,
    participationMode,
  ]);

  /**
   * WebRTC 연결 초기화
   */
  const initializeWebRTC = useCallback(
    (initiator, targetSocketId) => {
      // 기존 Peer가 있으면 먼저 정리 후 재초기화
      const currentPeer = webrtcServiceRef.current.peer;
      if (currentPeer && !currentPeer.destroyed) {
        console.log("⚠️ 기존 Peer가 활성 상태입니다. 먼저 정리 후 재초기화합니다.");

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

      // 상태 머신 체크
      if (webrtcInitState.status === "ready") {
        console.log("WebRTC가 이미 초기화되었습니다.");
        return;
      }

      if (webrtcInitState.status === "initializing") {
        console.log("WebRTC 초기화가 이미 진행 중입니다.");
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

        // MediaContext 함수로 초기화 시작
        startWebRTCInitialization();
        setIsInitiator(initiator);
        setConnectionState("connecting");
        setTargetSocketId(targetSocketId); // MediaContext 함수 사용

        // 핸들러를 initialize() 전에 등록
        console.log("🎯 [useWebRTC] 핸들러 등록 (initialize 전)");

        // 1. 시그널 이벤트 핸들러 - 먼저 등록!
        webrtcServiceRef.current.onSignal((signal) => {
          // targetSocketId는 initializeWebRTC의 파라미터 값 사용 (closure로 캡처됨)
          if (!socketServiceRef.current || !targetSocketId) {
            console.error("SocketService 또는 대상 소켓 ID가 없습니다.");
            return;
          }
          const myNickname = nicknameRef.current || "알 수 없음";
          const targetNickname =
            participantNicknamesRef.current.get(targetSocketId) || "알 수 없음";

          // 서버는 to 필드로 socketId 문자열을 기대함
          if (signal.type === "offer") {
            console.log(`[송신] [${myNickname}] WebRTC Offer -> ${targetNickname}`);
            socketServiceRef.current.emit("signal:offer", { to: targetSocketId, signal });
          } else if (signal.type === "answer") {
            console.log(`[송신] [${myNickname}] WebRTC Answer -> ${targetNickname}`);
            socketServiceRef.current.emit("signal:answer", { to: targetSocketId, signal });
          } else {
            console.log(`[송신] [${myNickname}] ICE Candidate -> ${targetNickname}`);
            socketServiceRef.current.emit("signal:ice-candidate", {
              to: targetSocketId,
              candidate: signal,
            });
          }
        });

        // 2. 원격 스트림 수신 핸들러 - 먼저 등록!
        webrtcServiceRef.current.onStream((stream) => {
          console.log(`\n========== [useWebRTC onStream 핸들러] ==========`);
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
          console.log(`   - stream 객체:`, stream);
          console.log(`   - stream.id:`, stream.id);
          console.log(`   - stream.active:`, stream.active);

          setRemoteStream(stream); // ✅ 직접 호출로 상태 업데이트
          setConnectionState("connected");

          console.log(`✅ setRemoteStream 호출 완료`);
          console.log(`   - 전달된 stream:`, stream);
          console.log(`   - React 상태 업데이트 대기 중 (리렌더링 예상)`);
          console.log(`========== [useWebRTC onStream 종료] ==========\n`);
        });

        // 3. 연결 성공 핸들러 - 먼저 등록!
        webrtcServiceRef.current.onConnect(() => {
          console.log("✅ [useWebRTC] peer.on('connect') 이벤트 수신");
          console.log("🎬 [useWebRTC] P2P 연결 완료, 비디오 재생 준비됨");
          setConnectionState("connected");

          // P2P 연결 완료 이벤트 발생
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
        console.log("🚀 [useWebRTC] WebRTC 초기화 시작 (핸들러 등록 완료)");
        webrtcServiceRef.current.initialize(initiator, localStreamRef.current);

        // MediaContext 함수로 초기화 완료
        completeWebRTCInitialization();

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
        setWebRTCInitializationError(error.message);
      }
    },
    [
      setRemoteStream,
      setTargetSocketId,
      webrtcInitState.status,
      startWebRTCInitialization,
      completeWebRTCInitialization,
      setWebRTCInitializationError,
    ]
  );

  /**
   * 연결 시작 시도 함수
   * localStream이 준비되지 않았으면 participationMode 체크 후 처리
   */
  const tryStartConnection = useCallback(
    (targetSocketId, asInitiator) => {
      const mySocketId = socketServiceRef.current?.socket?.id;
      const role = asInitiator ? "발신자(Offer 생성)" : "수신자(Answer 생성)";
      const currentMode = participationModeRef.current;

      console.log(
        `[tryStartConnection] 연결 시도\n` +
          `  - 내 소켓: ${mySocketId}\n` +
          `  - 대상 소켓: ${targetSocketId}\n` +
          `  - 역할: ${role} (initiator: ${asInitiator})\n` +
          `  - 참여 모드: ${currentMode}`
      );

      // 자기 자신인지 확인
      if (mySocketId === targetSocketId) {
        console.log("[tryStartConnection] ❌ 자기 자신의 소켓 ID입니다. 무시");
        return false;
      }

      // localStream이 준비되지 않았으면 participationMode 체크
      if (!localStreamRef.current) {
        // 시청자 모드면 빈 스트림으로 연결
        if (currentMode === "viewer") {
          console.log(
            `[tryStartConnection] ✅ 시청자 모드, 빈 스트림으로 WebRTC 연결 시작\n` +
              `  - 대상: ${targetSocketId}`
          );
          // localStream을 null로 전달 (WebRTCService가 빈 MediaStream 생성)
          initializeWebRTC(asInitiator, targetSocketId);
          return true;
        }

        // 일반 참여자 모드면 대기열에 추가
        console.log(
          `[tryStartConnection] ⏳ 로컬 스트림 대기 중, 연결 대기열에 추가\n` +
            `  - 대기 정보: { target: ${targetSocketId}, initiator: ${asInitiator} }`
        );
        setPendingConnection({ targetSocketId, asInitiator });
        return false;
      }

      // 이미 초기화되었거나 초기화 중이면 무시
      const isReady = webrtcInitState.status === "ready";
      const isInitializing = webrtcInitState.status === "initializing";

      if (isReady || isInitializing) {
        console.log(
          `[tryStartConnection] ⚠️ 이미 WebRTC 연결이 있거나 초기화 중입니다.\n` +
            `  - status: ${webrtcInitState.status}`
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
    [initializeWebRTC, webrtcInitState.status, setPendingConnection]
  );

  /**
   * 시그널 데이터 처리
   */
  const handleSignal = useCallback(
    (signalData) => {
      if (webrtcInitState.isProcessingSignal) {
        console.log("시그널 처리 중입니다. 대기 중...");
        return;
      }

      if (!webrtcServiceRef.current.peer || webrtcServiceRef.current.peer.destroyed) {
        console.log("Peer가 없거나 종료된 상태입니다. 시그널 무시");
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
          console.log(
            `[handleSignal] Answer 무시: 현재 상태가 have-local-offer가 아님 (${signalingState})`
          );
          return;
        }
        console.log(`[handleSignal] Answer 처리 진행 (상태: ${signalingState})`);
      }

      try {
        setSignalProcessing(true);
        webrtcServiceRef.current.signal(signalData);
        console.log("시그널 처리 완료:", signalData.type || "candidate");
      } catch (error) {
        console.error("시그널 처리 에러:", error);
      } finally {
        setSignalProcessing(false);
      }
    },
    [webrtcInitState.isProcessingSignal, setSignalProcessing]
  );

  /**
   * localStream이 준비되면 대기 중인 offer 처리
   */
  useEffect(() => {
    if (localStream && webrtcInitState.pendingOffer) {
      console.log("로컬 스트림 준비 완료, 대기 중인 Offer 처리");
      const pendingOffer = webrtcInitState.pendingOffer;
      setPendingOffer(null); // 대기열 초기화

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
  }, [localStream, webrtcInitState.pendingOffer, initializeWebRTC, handleSignal, setPendingOffer]);

  /**
   * 새 참가자 입장 이벤트 핸들러
   */
  const handleParticipantJoined = useCallback(
    (data) => {
      // 서버에서 { socketId, nickname } 형태로 전달됨
      const targetSocketId = typeof data === "string" ? data : data.socketId;
      const targetNickname = typeof data === "object" ? data.nickname : null;

      console.log(`[이벤트] 새 참가자 입장: ${targetSocketId} (${targetNickname || "알 수 없음"})`);

      // 닉네임 정보가 있으면 저장
      if (targetNickname) {
        participantNicknamesRef.current.set(targetSocketId, targetNickname);
      }

      // tryStartConnection 함수로 통합 처리 (선입장자가 initiator)
      tryStartConnection(targetSocketId, true);
    },
    [tryStartConnection]
  );

  /**
   * Offer 수신 이벤트 핸들러
   */
  const handleOffer = useCallback(
    (data) => {
      const { from, signal } = data;
      const myNickname = nicknameRef.current || "알 수 없음";
      const senderNickname = participantNicknamesRef.current.get(from) || "알 수 없음";
      console.log(`[수신] [${myNickname}] WebRTC Offer <- ${senderNickname}`);

      if (socketServiceRef.current.socket?.id === from) {
        console.log("자기 자신으로부터 온 Offer입니다. 무시");
        return;
      }

      if (!localStreamRef.current) {
        console.log("로컬 스트림이 아직 준비되지 않았습니다. Offer를 대기열에 저장");
        setPendingOffer(data);
        return;
      }

      const isReady = webrtcInitState.status === "ready";
      const isInitializing = webrtcInitState.status === "initializing";

      if (isReady) {
        const peer = webrtcServiceRef.current.peer;
        const signalingState = peer?._pc?.signalingState;
        console.log(`이미 초기화됨 (상태: ${signalingState}), Offer 시그널 처리`);

        // stable 상태에서만 offer 처리 (재협상)
        if (signalingState === "stable") {
          handleSignal(signal);
        } else {
          console.log(`Offer 무시 (현재 상태: ${signalingState})`);
        }
        return;
      }

      if (isInitializing) {
        console.log("초기화 진행 중, Offer 무시");
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
    },
    [initializeWebRTC, handleSignal, webrtcInitState.status, setPendingOffer]
  );

  /**
   * Answer 수신 이벤트 핸들러
   */
  const handleAnswer = useCallback(
    (data) => {
      const { from } = data;
      const myNickname = nicknameRef.current || "알 수 없음";
      const senderNickname = participantNicknamesRef.current.get(from) || "알 수 없음";
      console.log(`[수신] [${myNickname}] WebRTC Answer <- ${senderNickname}`);

      if (socketServiceRef.current.socket?.id === from) {
        console.log("자기 자신으로부터 온 Answer입니다. 무시");
        return;
      }

      const peer = webrtcServiceRef.current.peer;
      const signalingState = peer?._pc?.signalingState;
      console.log(`Answer 처리 시도 (현재 상태: ${signalingState})`);

      // have-local-offer 상태가 아니면 Answer 무시 (중복 처리 방지)
      if (signalingState !== "have-local-offer") {
        console.log(`Answer 무시: 현재 상태가 have-local-offer가 아님 (${signalingState})`);
        return;
      }

      handleSignal(data.signal);
    },
    [handleSignal]
  );

  /**
   * ICE candidate 수신 이벤트 핸들러
   */
  const handleIceCandidate = useCallback(
    (data) => {
      const { from } = data;
      const myNickname = nicknameRef.current || "알 수 없음";
      const senderNickname = participantNicknamesRef.current.get(from) || "알 수 없음";
      console.log(`[수신] [${myNickname}] ICE Candidate <- ${senderNickname}`);

      if (socketServiceRef.current.socket?.id === from) {
        console.log("자기 자신으로부터 온 ICE candidate입니다. 무시");
        return;
      }

      handleSignal(data.candidate);
    },
    [handleSignal]
  );

  /**
   * media:reconnecting 수신 이벤트 핸들러
   * 상대방이 디바이스 변경으로 재연결을 시작했을 때 호출됨
   */
  const handleMediaReconnecting = useCallback(
    (data) => {
      const { from, timestamp } = data;
      console.log(`\n========== [handleMediaReconnecting] 상대방 재연결 시작 ==========`);
      console.log(`⏰ 수신 타임스탬프: ${new Date().toISOString()}`);
      console.log(`👤 발신자: ${from}`);
      console.log(`🕐 상대방 timestamp: ${timestamp}`);

      // 동시 재연결 감지 (타임스탬프 비교)
      if (webrtcReconnectionState.isReconnecting) {
        const myTimestamp = Date.now();
        console.log(`⚠️ 동시 재연결 감지!`);
        console.log(`   - 내 timestamp: ${myTimestamp}`);
        console.log(`   - 상대방 timestamp: ${timestamp}`);

        // 먼저 시작한 쪽이 우선권 (낮은 timestamp)
        if (timestamp < myTimestamp) {
          console.log(`✅ 상대방이 먼저 시작, 내 재연결 취소하고 대기 모드`);

          // MediaContext 함수로 상대방 재연결 대기 모드 설정
          startRemoteWebRTCReconnection();

          // 기존 Peer 정리
          const currentPeer = webrtcServiceRef.current.peer;
          if (currentPeer && !currentPeer.destroyed) {
            currentPeer.destroy();
            webrtcServiceRef.current.peer = null;
          }

          // 초기화 상태 리셋
          resetWebRTCInitState();
        } else {
          console.log(`✅ 내가 먼저 시작, 계속 진행`);
          return;
        }
      } else {
        // 동시 재연결 아님, 일반 대기 모드
        console.log(`📥 상대방 재연결 대기 모드 진입`);

        // MediaContext 함수로 상대방 재연결 대기 모드 설정
        startRemoteWebRTCReconnection();

        // 기존 Peer 정리
        const currentPeer = webrtcServiceRef.current.peer;
        if (currentPeer && !currentPeer.destroyed) {
          console.log(`🔨 기존 Peer 정리`);
          currentPeer.destroy();
          webrtcServiceRef.current.peer = null;
        }

        // 초기화 상태 리셋
        resetWebRTCInitState();
      }

      console.log(`========== [handleMediaReconnecting] 대기 모드 설정 완료 ==========\n`);
    },
    [webrtcReconnectionState.isReconnecting, startRemoteWebRTCReconnection, resetWebRTCInitState]
  );

  /**
   * media:reconnected 수신 이벤트 핸들러
   * 상대방이 재연결을 완료했을 때 호출됨
   */
  const handleMediaReconnected = useCallback(
    (data) => {
      const { from } = data;
      console.log(`\n========== [handleMediaReconnected] 상대방 재연결 완료 ==========`);
      console.log(`⏰ 수신 타임스탬프: ${new Date().toISOString()}`);
      console.log(`👤 발신자: ${from}`);

      // MediaContext 함수로 재연결 완료 처리
      completeWebRTCReconnection();

      console.log(`✅ 재연결 완료 처리됨`);
      console.log(`========== [handleMediaReconnected] 종료 ==========\n`);
    },
    [completeWebRTCReconnection]
  );

  /**
   * 참가자 퇴장 이벤트 핸들러
   * 재연결 중 상대방 이탈 처리 추가
   */
  const handleParticipantLeft = useCallback(() => {
    console.log("참가자 퇴장, WebRTC 연결 강제 종료");

    // MediaContext 함수로 재연결 상태 초기화
    resetWebRTCReconnectionState();

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

    // 초기화 상태 리셋
    resetWebRTCInitState();

    console.log("✅ WebRTC 연결 정리 완료");
  }, [resetWebRTCReconnectionState, resetWebRTCInitState]);

  /**
   * 미디어 재연결 함수
   * 디바이스 변경 시 호출되며, Peer를 파괴하고 새 스트림으로 재연결
   *
   * @param {MediaStream|null} newStream - 새 미디어 스트림 (MediaContext에서 전달)
   */
  const reconnectMedia = useCallback(
    async (newStream = null) => {
      console.log(`\n========== [reconnectMedia] 재연결 시작 ==========`);
      console.log(`⏰ 타임스탬프: ${new Date().toISOString()}`);
      console.log(`🆕 newStream 제공됨: ${!!newStream}`);

      // 재연결 중 플래그 설정
      if (webrtcReconnectionState.isReconnecting) {
        console.log("⚠️ 이미 재연결 진행 중입니다.");
        return;
      }

      // targetSocketId 확인
      const targetSocketId = webrtcReconnectionState.targetSocketId;
      if (!targetSocketId) {
        console.error("❌ 대상 소켓 ID가 없습니다. 재연결 취소");
        return;
      }

      // socketService 확인
      if (!socketServiceRef.current) {
        console.error("❌ SocketService가 없습니다. 재연결 취소");
        return;
      }

      try {
        const timestamp = Date.now();

        // MediaContext 함수로 재연결 시작
        startWebRTCReconnection(targetSocketId, timestamp);

        // 1. 재연결 시작 시그널링 송신
        console.log(`📡 [reconnectMedia] media:reconnecting 이벤트 송신`);
        console.log(`   - 대상: ${targetSocketId}`);
        console.log(`   - timestamp: ${timestamp}`);

        socketServiceRef.current.emit("media:reconnecting", {
          to: targetSocketId,
          timestamp,
        });

        // 2. 기존 Peer 파괴
        const currentPeer = webrtcServiceRef.current.peer;
        if (currentPeer) {
          console.log(`🔨 [reconnectMedia] 기존 Peer 파괴 시작`);
          try {
            if (!currentPeer.destroyed) {
              currentPeer.destroy();
              console.log("✅ Peer destroyed");
            }
          } catch (error) {
            console.error("Peer 파괴 중 오류:", error);
          }

          // Peer 참조 명시적 제거
          webrtcServiceRef.current.peer = null;
        }

        // 3. 초기화 상태 리셋 (재초기화 허용)
        resetWebRTCInitState();

        // 4. ⚠️ 중요: newStream이 전달되면 localStreamRef 즉시 업데이트 (Race condition 방지)
        if (newStream) {
          console.log(`✅ [reconnectMedia] newStream을 localStreamRef에 즉시 반영`);
          console.log(`   - 기존 stream ID: ${localStreamRef.current?.id || "없음"}`);
          console.log(`   - 새 stream ID: ${newStream.id}`);
          localStreamRef.current = newStream;
        }

        // 5. 300ms 지연 (소켓 이벤트 전파 시간 확보)
        await new Promise((resolve) => setTimeout(resolve, 300));

        // 6. isInitiator 플래그 유지 (기존 역할 그대로)
        const currentInitiator = isInitiator;
        console.log(`🔄 [reconnectMedia] 재연결 시도`);
        console.log(`   - 역할 유지: ${currentInitiator ? "발신자(Offer)" : "수신자(Answer)"}`);
        console.log(`   - 대상: ${targetSocketId}`);

        // 7. WebRTC 재초기화
        initializeWebRTC(currentInitiator, targetSocketId);

        console.log(`========== [reconnectMedia] 재연결 절차 완료 ==========\n`);
      } catch (error) {
        console.error("❌ [reconnectMedia] 재연결 중 오류:", error);
        // MediaContext 함수로 재연결 완료 (에러 시에도 상태 정리)
        completeWebRTCReconnection();
        throw error;
      }
    },
    [
      isInitiator,
      initializeWebRTC,
      webrtcReconnectionState.isReconnecting,
      webrtcReconnectionState.targetSocketId,
      startWebRTCReconnection,
      completeWebRTCReconnection,
      resetWebRTCInitState,
    ]
  );

  /**
   * Socket 이벤트 리스너 설정
   * socketService와 roomId가 준비된 후 등록 (localStream은 나중에 준비됨)
   */
  useEffect(() => {
    if (!socketService || !roomId) {
      return;
    }

    console.log("[useWebRTC] 이벤트 리스너 등록");

    // 이벤트 리스너 등록
    socketService.on("room:participant-joined", handleParticipantJoined);
    socketService.on("signal:offer", handleOffer);
    socketService.on("signal:answer", handleAnswer);
    socketService.on("signal:ice-candidate", handleIceCandidate);
    socketService.on("room:participant-left", handleParticipantLeft);
    socketService.on("media:reconnecting", handleMediaReconnecting);
    socketService.on("media:reconnected", handleMediaReconnected);

    // 클린업 함수
    return () => {
      console.log("[useWebRTC] 이벤트 리스너 제거");
      socketService.off("room:participant-joined", handleParticipantJoined);
      socketService.off("signal:offer", handleOffer);
      socketService.off("signal:answer", handleAnswer);
      socketService.off("signal:ice-candidate", handleIceCandidate);
      socketService.off("room:participant-left", handleParticipantLeft);
      socketService.off("media:reconnecting", handleMediaReconnecting);
      socketService.off("media:reconnected", handleMediaReconnected);
    };
  }, [
    socketService,
    roomId,
    handleParticipantJoined,
    handleOffer,
    handleAnswer,
    handleIceCandidate,
    handleParticipantLeft,
    handleMediaReconnecting,
    handleMediaReconnected,
  ]);

  /**
   * 기존 참가자 감지 및 연결 시작
   * 방 참가 시 participants 배열에 기존 참가자가 있으면 연결 시작
   * 후입장자는 수신자(initiator: false) 역할로 Answer를 생성
   */
  useEffect(() => {
    if (!participants || participants.length === 0 || !socketService?.socket?.id) {
      return;
    }

    // 기존 참가자 (자신 제외)
    const otherParticipants = participants.filter((id) => id !== socketService.socket.id);

    if (otherParticipants.length > 0) {
      console.log(
        `[useWebRTC] 기존 참가자 감지: ${otherParticipants[0]}, Offer 대기 중 (후입장자 역할)`
      );
      // 후입장자는 기존 참가자로부터 Offer를 기다림 (연결 시작하지 않음)
      // 기존 참가자가 room:participant-joined 이벤트를 받아서 Offer를 보낼 것임
    }
  }, [participants, socketService?.socket?.id]);

  /**
   * localStream 준비 시 대기 중인 연결 처리
   */
  useEffect(() => {
    if (localStream && webrtcInitState.pendingConnection) {
      const { targetSocketId, asInitiator } = webrtcInitState.pendingConnection;
      console.log(
        `[useWebRTC] 로컬 스트림 준비 완료, 대기 중인 연결 시작 (target: ${targetSocketId})`
      );

      // 대기열 초기화
      setPendingConnection(null);

      // 아직 초기화되지 않았으면 연결 시작
      const isIdle = webrtcInitState.status === "idle";
      if (isIdle) {
        initializeWebRTC(asInitiator, targetSocketId);
      }
    }
  }, [
    localStream,
    webrtcInitState.pendingConnection,
    webrtcInitState.status,
    initializeWebRTC,
    setPendingConnection,
  ]);

  /**
   * socketService, roomId, localStream 변경 감지 (참조용)
   */
  useEffect(() => {
    console.log(
      `[useWebRTC] 상태 변경 - roomId: ${roomId}, localStream: ${!!localStream}, participants: ${participants.length}`
    );
  }, [roomId, localStream, participants]);

  /**
   * MediaContext에 reconnectMedia 콜백 등록
   * MediaContext의 reinitializeMedia에서 WebRTC 재연결을 트리거할 수 있도록 함
   */
  useEffect(() => {
    if (setReconnectMediaCallback && reconnectMedia) {
      console.log("[useWebRTC] reconnectMedia 함수를 MediaContext에 등록");
      setReconnectMediaCallback(reconnectMedia);
    }
  }, [setReconnectMediaCallback, reconnectMedia]);

  /**
   * 컴포넌트 언마운트 시 WebRTC 정리
   */
  useEffect(() => {
    return () => {
      const isReady = webrtcInitState.status === "ready";
      if (isReady) {
        console.log("useWebRTC 정리: WebRTC 연결 종료");
        webrtcService.destroy();
        resetWebRTCInitState();
      }
    };
  }, [webrtcService, webrtcInitState.status, resetWebRTCInitState]);

  return {
    connectionState,
    isInitiator,
    initializeWebRTC,
    reconnectMedia, // MediaContext에서 사용
  };
}

export default useWebRTC;
