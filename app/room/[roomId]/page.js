"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import ChatPanel from "@/components/chat/ChatPanel";
import AudioDebugPanel from "@/components/room/AudioDebugPanel";
import ControlBar from "@/components/room/ControlBar";
import NicknameInput from "@/components/room/NicknameInput";
import SettingsPanel from "@/components/room/SettingsPanel";
import VideoGrid from "@/components/room/VideoGrid";
import VideoPlayer from "@/components/room/VideoPlayer";
import { Button } from "@/components/ui/button";
import WhiteboardCanvas from "@/components/whiteboard/WhiteboardCanvas";
import WhiteboardToolbar from "@/components/whiteboard/WhiteboardToolbar";
import { useMediaContext, useRoomContext, WhiteboardProvider } from "@/contexts";
import { useSFU } from "@/hooks";
import useChat from "@/hooks/useChat";
import { saveNicknameToSession } from "@/lib/nicknameUtils";

/**
 * 방 페이지 컴포넌트
 *
 * 방 입장 플로우:
 * 1. 닉네임 입력 (하이브리드 방식: 세션 스토리지에서 기본 닉네임 로드)
 * 2. 디바이스 선택
 * 3. 방 참가
 */
export default function RoomPage() {
  const params = useParams();
  const roomId = params.roomId;
  const router = useRouter();

  // Context 및 Hooks
  const {
    joinRoom,
    leaveRoom,
    isConnected,
    showChat,
    toggleChat,
    setNickname,
    participantNicknames,
    hostSocketId,
    socketService,
    screenShareInfo, // 원격 화면 공유 상태
  } = useRoomContext();
  const {
    localStream,
    remoteStream,
    isVideoEnabled,
    isScreenSharing,
    screenStream, // 화면 공유 스트림
    setParticipationMode,
    initializeMedia,
    cleanupMedia,
  } = useMediaContext();

  // SFU 연결 관리 (remoteStreams, screenShareStreams는 useSFU에서 제공)
  const { remoteStreams, screenShareStreams } = useSFU();

  // 채팅 훅
  const { messages, unreadCount, sendMessage, clearUnreadCount } = useChat();

  // 닉네임 설정 완료 상태
  const [isNicknameSet, setIsNicknameSet] = useState(false);

  // remoteStream 디버깅
  useEffect(() => {
    console.log("[RoomPage] remoteStream 상태 변경:", {
      hasRemoteStream: !!remoteStream,
      streamId: remoteStream?.id,
      active: remoteStream?.active,
      videoTracks: remoteStream?.getVideoTracks().length,
      audioTracks: remoteStream?.getAudioTracks().length,
    });
  }, [remoteStream]);

  // 디버그 패널 표시 상태 (기본값: 숨김)
  const [showDebug, setShowDebug] = useState(false);

  // URL 복사 성공 상태
  const [copySuccess, setCopySuccess] = useState(false);

  // 설정 패널 표시 상태
  const [showSettings, setShowSettings] = useState(false);

  // 화면 공유 모드 판단:
  // 1. 내가 화면 공유 중 (isScreenSharing && screenStream)
  // 2. 다른 사람이 화면 공유 중 (screenShareInfo가 있고, 내가 아닌 경우)
  // 주의: 내가 화면 공유 중지 시 screenShareInfo가 아직 남아있을 수 있으므로 socketId로 구분
  const mySocketId = socketService?.socket?.id;
  const isRemoteScreenSharing =
    screenShareInfo?.isSharing && screenShareInfo?.socketId !== mySocketId;
  const isScreenShareMode = (isScreenSharing && screenStream) || isRemoteScreenSharing;

  /**
   * 닉네임 설정 완료 핸들러
   * 닉네임 설정 후 즉시 방 입장 (Optional Media 지원)
   *
   * @param {string} nickname - 사용자 닉네임
   * @param {boolean} skipMediaInit - 카메라/마이크 없이 입장 여부 (기본값: false)
   */
  const handleNicknameSet = async (nickname, skipMediaInit = false) => {
    try {
      console.log(`[RoomPage] 닉네임 설정 완료: ${nickname}, 미디어 스킵: ${skipMediaInit}`);
      setNickname(nickname); // RoomContext에 닉네임 설정

      // participationMode 설정 (시청자 vs 일반 참여자)
      if (skipMediaInit) {
        console.log("[RoomPage] 시청자 모드로 설정");
        setParticipationMode("viewer");
      } else {
        console.log("[RoomPage] 일반 참여자 모드로 설정");
        setParticipationMode("participant");
      }

      // 세션 스토리지에 닉네임 저장 (하이브리드 방식)
      saveNicknameToSession(nickname);

      // 미디어 초기화 (체크박스 미체크 시에만)
      if (!skipMediaInit) {
        console.log("[RoomPage] 미디어 자동 초기화 시작");
        try {
          await initializeMedia();
          console.log("[RoomPage] 미디어 초기화 완료");
        } catch (mediaError) {
          console.warn("[RoomPage] 미디어 초기화 실패, 시청자 모드로 전환:", mediaError);
          // 미디어 초기화 실패 시 자동으로 시청자 모드로 전환
          setParticipationMode("viewer");
        }
      } else {
        console.log("[RoomPage] 미디어 초기화 스킵 (시청자 모드)");
      }

      // 닉네임 설정 완료 표시
      setIsNicknameSet(true);

      // 즉시 방 참가 (닉네임을 직접 전달하여 closure 문제 해결)
      console.log("[RoomPage] 방 입장 시작");
      await joinRoom(roomId, nickname);
      console.log("[RoomPage] 방 참가 완료");
    } catch (error) {
      console.error("[RoomPage] 방 참가 실패:", error);
      alert("방 참가에 실패했습니다. 다시 시도해주세요.");
      setIsNicknameSet(false);
    }
  };

  /**
   * 닉네임 입력 화면 표시
   */
  if (!isNicknameSet) {
    return <NicknameInput onNicknameSet={handleNicknameSet} roomId={roomId} />;
  }

  /**
   * 방 URL 복사 핸들러
   */
  const copyRoomUrl = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopySuccess(true);
      console.log("방 URL 복사 완료:", window.location.href);

      // 2초 후 복사 성공 메시지 숨김
      setTimeout(() => {
        setCopySuccess(false);
      }, 2000);
    } catch (err) {
      console.error("링크 복사 실패:", err);
      alert("링크 복사에 실패했습니다.");
    }
  };

  /**
   * 홈으로 돌아가기 핸들러
   * 미디어 리소스 정리 후 방 퇴장
   */
  const handleGoHome = () => {
    try {
      console.log("[RoomPage] 홈으로 돌아가기: 리소스 정리 시작");

      // 1. 미디어 리소스 정리 (WebRTC Peer 포함)
      cleanupMedia();

      // 2. 방 퇴장 (Socket 정리)
      leaveRoom();

      // 3. 홈으로 이동
      router.push("/");
    } catch (error) {
      console.error("[RoomPage] 홈 이동 중 에러:", error);
      // 에러가 있어도 홈으로 이동
      router.push("/");
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-950">
      {/* 상단 헤더 */}
      <header className="flex items-center justify-between px-4 py-2 bg-gray-900 border-b border-gray-800">
        <div className="flex items-center gap-3">
          <h1 className="text-base font-semibold text-white">방: {roomId}</h1>
          {isConnected && <span className="text-sm text-green-400">● 연결됨</span>}
        </div>

        <div className="flex items-center gap-2">
          <Button
            onClick={handleGoHome}
            variant="outline"
            size="sm"
            className="text-white h-8"
            title="홈으로"
          >
            🏠 홈
          </Button>
          <Button onClick={copyRoomUrl} variant="outline" size="sm" className="text-white h-8">
            {copySuccess ? "✅ 복사됨" : "🔗 링크 복사"}
          </Button>

          <Button
            onClick={toggleChat}
            variant="outline"
            size="sm"
            className="text-white relative h-8"
            title={showChat ? "채팅 숨기기" : "채팅 보기"}
          >
            {showChat ? "💬" : "◀"}
            {/* 읽지 않은 메시지 배지 */}
            {unreadCount > 0 && !showChat && (
              <span className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center bg-red-500 text-white text-xs rounded-full">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </Button>

          {/* 오디오 디버그 토글 버튼 */}
          <Button
            onClick={() => setShowDebug(!showDebug)}
            variant="outline"
            size="sm"
            className="text-white h-8"
            title={showDebug ? "디버그 숨기기" : "디버그 보기"}
          >
            {showDebug ? "🔇" : "🔊"}
          </Button>
        </div>
      </header>

      {/* 메인 컨텐츠: 화면 공유 모드에 따라 레이아웃 변경 */}
      <div className="flex-1 flex flex-row min-h-0 overflow-hidden">
        {isScreenShareMode ? (
          // 화면 공유 모드: 3:5:2 비율 (일반 모드와 동일, 중앙에만 화면 공유 오버레이)
          <>
            {/* 왼쪽: 비디오 그리드 (30%) - 일반 모드와 동일 */}
            <aside className="flex-3 flex flex-col bg-gray-950 border-r border-gray-800 overflow-hidden">
              <VideoGrid
                localStream={localStream}
                remoteStreams={remoteStreams}
                isVideoEnabled={isVideoEnabled}
                isScreenSharing={isScreenSharing}
                participantNicknames={participantNicknames}
                hostSocketId={hostSocketId}
                mySocketId={mySocketId}
              />
            </aside>

            {/* 중앙: 화면 공유 + 화이트보드 오버레이 (50%) */}
            <main className="flex-5 flex flex-col min-h-0 overflow-hidden relative">
              {/* 화면 공유 스트림 (배경) */}
              <div className="absolute inset-0 z-10 bg-gray-950">
                {/* 내 화면 공유 스트림 또는 원격 화면 공유 스트림 */}
                {screenStream ? (
                  <VideoPlayer
                    stream={screenStream}
                    isLocal={true}
                    isVideoEnabled={true}
                    nickname="화면 공유"
                    isScreenShare={true}
                  />
                ) : screenShareInfo?.isSharing ? (
                  // 원격 화면 공유: screenShareStreams에서 화면 공유자의 스트림 찾기
                  <VideoPlayer
                    stream={screenShareStreams.get(screenShareInfo.socketId)}
                    isLocal={false}
                    isVideoEnabled={true}
                    nickname={`${screenShareInfo.nickname}의 화면 공유`}
                    isScreenShare={true}
                  />
                ) : null}
              </div>
              {/* 화이트보드 오버레이 (투명 배경) */}
              <div className="absolute inset-0 z-20 flex flex-col">
                <WhiteboardProvider>
                  <WhiteboardToolbar />
                  <div className="flex-1 min-h-0">
                    <WhiteboardCanvas isOverlay={true} />
                  </div>
                </WhiteboardProvider>
              </div>
            </main>

            {/* 오른쪽: 채팅 영역 (20%) */}
            {showChat && (
              <aside className="flex-2 flex flex-col bg-gray-900 border-l border-gray-800 transition-all duration-300 overflow-hidden">
                <ChatPanel
                  messages={messages}
                  unreadCount={unreadCount}
                  onSendMessage={sendMessage}
                  onClearUnread={clearUnreadCount}
                />
              </aside>
            )}
          </>
        ) : (
          // 일반 모드: 3컬럼 레이아웃 (3:5:2 비율)
          <>
            {/* 왼쪽: 비디오 그리드 (30%) */}
            <aside className="flex-3 flex flex-col bg-gray-950 border-r border-gray-800 overflow-hidden">
              <VideoGrid
                localStream={localStream}
                remoteStreams={remoteStreams}
                isVideoEnabled={isVideoEnabled}
                isScreenSharing={isScreenSharing}
                participantNicknames={participantNicknames}
                hostSocketId={hostSocketId}
                mySocketId={socketService?.socket?.id}
              />
            </aside>

            {/* 중앙: 화이트보드 (50%) */}
            <main className="flex-5 flex flex-col min-h-0 overflow-hidden">
              <WhiteboardProvider>
                <WhiteboardToolbar />
                <div className="flex-1 min-h-0">
                  <WhiteboardCanvas />
                </div>
              </WhiteboardProvider>
            </main>

            {/* 오른쪽: 채팅 영역 (20%) */}
            {showChat && (
              <aside className="flex-2 flex flex-col bg-gray-900 border-l border-gray-800 transition-all duration-300 overflow-hidden">
                <ChatPanel
                  messages={messages}
                  unreadCount={unreadCount}
                  onSendMessage={sendMessage}
                  onClearUnread={clearUnreadCount}
                />
              </aside>
            )}
          </>
        )}
      </div>

      {/* 하단 컨트롤 바 */}
      <ControlBar onSettingsClick={() => setShowSettings(true)} />

      {/* 설정 패널 */}
      <SettingsPanel isOpen={showSettings} onClose={() => setShowSettings(false)} />

      {/* 오디오 디버그 패널 (모달 형태) */}
      {showDebug && (
        <AudioDebugPanel
          localStream={localStream}
          remoteStream={remoteStream}
          onClose={() => setShowDebug(false)}
        />
      )}
    </div>
  );
}
