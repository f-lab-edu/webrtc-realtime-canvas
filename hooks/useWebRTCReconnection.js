/**
 * useWebRTCReconnection Hook
 * WebRTC 재연결 로직 전담 (디바이스 변경 시 재연결 처리)
 * Phase 5 리팩토링: useWebRTC에서 분리
 */

import { useCallback } from "react";

/**
 * WebRTC 재연결 훅
 * @param {Object} params
 * @param {Object} params.socketServiceRef - SocketService ref
 * @param {Object} params.webrtcServiceRef - WebRTCService ref
 * @param {Object} params.localStreamRef - 로컬 스트림 ref
 * @param {Object} params.setRemoteStreamRef - 원격 스트림 설정 ref
 * @param {boolean} params.isInitiator - Offer 발신자 여부
 * @param {Function} params.setConnectionState - 연결 상태 설정 함수
 * @param {Object} params.webrtcReconnectionState - 재연결 상태 (MediaContext)
 * @param {Function} params.startWebRTCReconnection - 재연결 시작 함수 (MediaContext)
 * @param {Function} params.completeWebRTCReconnection - 재연결 완료 함수 (MediaContext)
 * @param {Function} params.startRemoteWebRTCReconnection - 원격 재연결 대기 함수 (MediaContext)
 * @param {Function} params.resetWebRTCReconnectionState - 재연결 상태 리셋 함수 (MediaContext)
 * @param {Function} params.resetWebRTCInitState - 초기화 상태 리셋 함수 (MediaContext)
 * @param {Function} params.initializeWebRTC - WebRTC 초기화 함수
 * @returns {Object} 재연결 핸들러 함수들
 */
export const useWebRTCReconnection = ({
  socketServiceRef,
  webrtcServiceRef,
  localStreamRef,
  setRemoteStreamRef,
  isInitiator,
  setConnectionState,
  webrtcReconnectionState,
  startWebRTCReconnection,
  completeWebRTCReconnection,
  startRemoteWebRTCReconnection,
  resetWebRTCReconnectionState,
  resetWebRTCInitState,
  initializeWebRTC,
}) => {
  /**
   * 상대방이 재연결을 시작했을 때 처리
   * 동시 재연결 시 타임스탬프 기반으로 충돌 해결
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
    [
      webrtcReconnectionState.isReconnecting,
      webrtcServiceRef,
      startRemoteWebRTCReconnection,
      resetWebRTCInitState,
    ]
  );

  /**
   * 상대방이 재연결을 완료했을 때 처리
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
   * 참가자가 퇴장했을 때 WebRTC 연결 정리
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
  }, [
    webrtcServiceRef,
    setRemoteStreamRef,
    setConnectionState,
    resetWebRTCReconnectionState,
    resetWebRTCInitState,
  ]);

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
      socketServiceRef,
      webrtcServiceRef,
      localStreamRef,
      isInitiator,
      webrtcReconnectionState.isReconnecting,
      webrtcReconnectionState.targetSocketId,
      startWebRTCReconnection,
      completeWebRTCReconnection,
      resetWebRTCInitState,
      initializeWebRTC,
    ]
  );

  return {
    reconnectMedia,
    handleMediaReconnecting,
    handleMediaReconnected,
    handleParticipantLeft,
  };
};
