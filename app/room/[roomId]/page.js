"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import ChatPanel from "@/components/chat/ChatPanel";
import AudioDebugPanel from "@/components/room/AudioDebugPanel";
import ControlBar from "@/components/room/ControlBar";
import NicknameInput from "@/components/room/NicknameInput";
import SettingsPanel from "@/components/room/SettingsPanel";
import VideoStack from "@/components/room/VideoStack";
import { Button } from "@/components/ui/button";
import WhiteboardCanvas from "@/components/whiteboard/WhiteboardCanvas";
import WhiteboardToolbar from "@/components/whiteboard/WhiteboardToolbar";
import { useMediaContext } from "@/contexts/MediaContext";
import { useRoomContext } from "@/contexts/RoomContext";
import { WhiteboardProvider } from "@/contexts/WhiteboardContext";
import useChat from "@/hooks/useChat";
import useWebRTC from "@/hooks/useWebRTC";
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
  const { joinRoom, isConnected, showChat, toggleChat, setNickname } = useRoomContext();
  const { localStream, remoteStream, isVideoEnabled } = useMediaContext();
  useWebRTC(); // WebRTC 연결 관리

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

  // 디버그 패널 표시 상태
  const [showDebug, setShowDebug] = useState(true);

  // URL 복사 성공 상태
  const [copySuccess, setCopySuccess] = useState(false);

  // 설정 패널 표시 상태
  const [showSettings, setShowSettings] = useState(false);

  /**
   * 닉네임 설정 완료 핸들러
   * 닉네임 설정 후 즉시 방 입장 (DeviceSelector 단계 제거)
   */
  const handleNicknameSet = async (nickname) => {
    try {
      console.log("[RoomPage] 닉네임 설정 완료:", nickname);
      setNickname(nickname); // RoomContext에 닉네임 설정

      // 세션 스토리지에 닉네임 저장 (하이브리드 방식)
      saveNicknameToSession(nickname);

      // 닉네임 설정 완료 표시
      setIsNicknameSet(true);

      // 즉시 방 참가
      console.log("[RoomPage] 방 입장 시작");
      await joinRoom(roomId);
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
            onClick={() => router.push("/")}
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

      {/* 메인 컨텐츠: 3컬럼 레이아웃 (3:5:2 비율) */}
      <div className="flex-1 flex flex-row min-h-0 overflow-hidden">
        {/* 왼쪽: 비디오 스택 (30%) */}
        <aside className="flex-[3] flex flex-col bg-gray-950 border-r border-gray-800 overflow-hidden">
          <VideoStack
            localStream={localStream}
            remoteStream={remoteStream}
            isVideoEnabled={isVideoEnabled}
          />
        </aside>

        {/* 중앙: 화이트보드 (50%) */}
        <main className="flex-[5] flex flex-col min-h-0 overflow-hidden">
          <WhiteboardProvider>
            <WhiteboardToolbar />
            <div className="flex-1 min-h-0">
              <WhiteboardCanvas />
            </div>
          </WhiteboardProvider>
        </main>

        {/* 오른쪽: 채팅 영역 (20%) */}
        {showChat && (
          <aside className="flex-[2] flex flex-col bg-gray-900 border-l border-gray-800 transition-all duration-300 overflow-hidden">
            <ChatPanel
              messages={messages}
              unreadCount={unreadCount}
              onSendMessage={sendMessage}
              onClearUnread={clearUnreadCount}
            />
          </aside>
        )}
      </div>

      {/* 하단 컨트롤 바 */}
      <ControlBar onSettingsClick={() => setShowSettings(true)} />

      {/* 설정 패널 */}
      <SettingsPanel isOpen={showSettings} onClose={() => setShowSettings(false)} />

      {/* 오디오 디버그 패널 (개발 중에만 표시) */}
      {showDebug && <AudioDebugPanel localStream={localStream} remoteStream={remoteStream} />}
    </div>
  );
}
