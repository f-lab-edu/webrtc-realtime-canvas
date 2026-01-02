/**
 * useWebRTCSignaling Hook
 * WebRTC 시그널링 로직 전담 (Offer/Answer/ICE Candidate 처리)
 * Phase 4 리팩토링: useWebRTC에서 분리
 */

import { useCallback } from "react";

/**
 * WebRTC 시그널링 훅
 * @param {Object} params
 * @param {Object} params.socketServiceRef - SocketService ref
 * @param {Object} params.webrtcServiceRef - WebRTCService ref
 * @param {Object} params.localStreamRef - 로컬 스트림 ref
 * @param {Object} params.nicknameRef - 닉네임 ref
 * @param {Object} params.participantNicknamesRef - 참가자 닉네임 Map ref
 * @param {Object} params.webrtcInitState - WebRTC 초기화 상태 (MediaContext)
 * @param {Function} params.setPendingOffer - pending offer 설정 함수 (MediaContext)
 * @param {Function} params.initializeWebRTC - WebRTC 초기화 함수
 * @param {Function} params.handleSignal - 시그널 처리 함수
 * @returns {Object} 시그널링 핸들러 함수들
 */
export const useWebRTCSignaling = ({
  socketServiceRef,
  webrtcServiceRef,
  localStreamRef,
  nicknameRef,
  participantNicknamesRef,
  webrtcInitState,
  setPendingOffer,
  initializeWebRTC,
  handleSignal,
}) => {
  /**
   * Offer 수신 이벤트 핸들러
   * 상대방으로부터 연결 요청(Offer)를 받았을 때 처리
   */
  const handleOffer = useCallback(
    (data) => {
      const { from, signal } = data;
      const myNickname = nicknameRef.current || "알 수 없음";
      const senderNickname = participantNicknamesRef.current.get(from) || "알 수 없음";
      console.log(`[수신] [${myNickname}] WebRTC Offer <- ${senderNickname}`);

      // 자기 자신으로부터 온 Offer 무시
      if (socketServiceRef.current.socket?.id === from) {
        console.log("자기 자신으로부터 온 Offer입니다. 무시");
        return;
      }

      // 로컬 스트림이 준비되지 않았으면 대기열에 저장
      if (!localStreamRef.current) {
        console.log("로컬 스트림이 아직 준비되지 않았습니다. Offer를 대기열에 저장");
        setPendingOffer(data);
        return;
      }

      const isReady = webrtcInitState.status === "ready";
      const isInitializing = webrtcInitState.status === "initializing";

      // 이미 초기화된 상태면 재협상 처리
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

      // 초기화 진행 중이면 무시
      if (isInitializing) {
        console.log("초기화 진행 중, Offer 무시");
        return;
      }

      // 수신자로 WebRTC 초기화 (initiator: false)
      initializeWebRTC(false, from);

      // Peer가 준비될 때까지 대기 후 Offer 처리
      const checkPeerReady = setInterval(() => {
        if (webrtcServiceRef.current.peer && !webrtcServiceRef.current.peer.destroyed) {
          clearInterval(checkPeerReady);
          console.log("Peer 준비 완료, Offer 처리");
          handleSignal(signal);
        }
      }, 10);

      // 최대 1초 대기
      setTimeout(() => clearInterval(checkPeerReady), 1000);
    },
    [
      nicknameRef,
      participantNicknamesRef,
      socketServiceRef,
      localStreamRef,
      webrtcServiceRef,
      webrtcInitState.status,
      setPendingOffer,
      initializeWebRTC,
      handleSignal,
    ]
  );

  /**
   * Answer 수신 이벤트 핸들러
   * 상대방으로부터 연결 응답(Answer)를 받았을 때 처리
   */
  const handleAnswer = useCallback(
    (data) => {
      const { from } = data;
      const myNickname = nicknameRef.current || "알 수 없음";
      const senderNickname = participantNicknamesRef.current.get(from) || "알 수 없음";
      console.log(`[수신] [${myNickname}] WebRTC Answer <- ${senderNickname}`);

      // 자기 자신으로부터 온 Answer 무시
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
    [nicknameRef, participantNicknamesRef, socketServiceRef, webrtcServiceRef, handleSignal]
  );

  /**
   * ICE Candidate 수신 이벤트 핸들러
   * ICE Candidate 정보를 받았을 때 Peer에 추가
   */
  const handleIceCandidate = useCallback(
    (data) => {
      const { from } = data;
      const myNickname = nicknameRef.current || "알 수 없음";
      const senderNickname = participantNicknamesRef.current.get(from) || "알 수 없음";
      console.log(`[수신] [${myNickname}] ICE Candidate <- ${senderNickname}`);

      // 자기 자신으로부터 온 ICE candidate 무시
      if (socketServiceRef.current.socket?.id === from) {
        console.log("자기 자신으로부터 온 ICE candidate입니다. 무시");
        return;
      }

      handleSignal(data.candidate);
    },
    [nicknameRef, participantNicknamesRef, socketServiceRef, handleSignal]
  );

  return {
    handleOffer,
    handleAnswer,
    handleIceCandidate,
  };
};
