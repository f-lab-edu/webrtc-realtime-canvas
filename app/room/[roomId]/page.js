"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import ChatPanel from "@/components/chat/ChatPanel";
import AudioDebugPanel from "@/components/room/AudioDebugPanel";
import ChatDebugPanel from "@/components/room/ChatDebugPanel";
import ControlBar from "@/components/room/ControlBar";
import DeviceSelector from "@/components/room/DeviceSelector";
import VideoStack from "@/components/room/VideoStack";
import { Button } from "@/components/ui/button";
import WhiteboardCanvas from "@/components/whiteboard/WhiteboardCanvas";
import WhiteboardToolbar from "@/components/whiteboard/WhiteboardToolbar";
import { useMediaContext } from "@/contexts/MediaContext";
import { useRoomContext } from "@/contexts/RoomContext";
import useChat from "@/hooks/useChat";
import useWebRTC from "@/hooks/useWebRTC";

/**
 * 방 페이지 컴포넌트
 * Phase 19-3: 디바이스 선택 후 방 입장
 */
export default function RoomPage() {
  const params = useParams();
  const roomId = params.roomId;
  const router = useRouter();

  // Context 및 Hooks
  const { joinRoom, isConnected, showChat, toggleChat } = useRoomContext();
  const {
    localStream,
    remoteStream,
    isVideoEnabled,
    getAvailableDevices,
    initializeMediaWithDevice,
  } = useMediaContext();
  useWebRTC(); // WebRTC 연결 관리

  // 채팅 훅
  const { messages, unreadCount, sendMessage, clearUnreadCount } = useChat();

  // Phase 19-3: 디바이스 선택 완료 상태
  const [isDeviceSelected, setIsDeviceSelected] = useState(false);

  // 디버그 패널 표시 상태
  const [showDebug, setShowDebug] = useState(true);

  // URL 복사 성공 상태
  const [copySuccess, setCopySuccess] = useState(false);

  // 초기화 상태 (ref로 관리하여 중복 실행 방지)
  const isInitializedRef = useRef(false);

  /**
   * Phase 19-3: 디바이스 선택 완료 후 방 입장
   */
  const handleDeviceSelected = async () => {
    try {
      console.log("[RoomPage Phase 19-3] 디바이스 선택 완료, 방 입장 시작");
      setIsDeviceSelected(true);

      // 방 참가
      await joinRoom(roomId);
      console.log("[RoomPage Phase 19-3] 방 참가 완료");
    } catch (error) {
      console.error("[RoomPage Phase 19-3] 방 참가 실패:", error);
      alert("방 참가에 실패했습니다. 다시 시도해주세요.");
      setIsDeviceSelected(false);
    }
  };

  /**
   * Phase 19-3: 디바이스 선택 화면 표시
   */
  if (!isDeviceSelected) {
    return (
      <DeviceSelector
        onDeviceSelected={handleDeviceSelected}
        getAvailableDevices={getAvailableDevices}
        initializeMediaWithDevice={initializeMediaWithDevice}
      />
    );
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
      <header className="flex items-center justify-between px-6 py-3 bg-gray-900 border-b border-gray-800">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-semibold text-white">방: {roomId}</h1>
          {isConnected && <span className="text-sm text-green-400">● 연결됨</span>}
        </div>

        <div className="flex items-center gap-3">
          <Button
            onClick={() => router.push("/")}
            variant="outline"
            size="sm"
            className="text-white"
            title="홈으로"
          >
            🏠 홈
          </Button>

          <Button onClick={copyRoomUrl} variant="outline" size="sm" className="text-white">
            {copySuccess ? "✅ 복사됨" : "🔗 링크 복사"}
          </Button>

          <Button
            onClick={toggleChat}
            variant="outline"
            size="sm"
            className="text-white relative"
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
          <WhiteboardToolbar />
          <div className="flex-1 min-h-0">
            <WhiteboardCanvas />
          </div>
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
      <ControlBar />

      {/* 오디오 디버그 패널 (개발 중에만 표시) */}
      {showDebug && <AudioDebugPanel localStream={localStream} remoteStream={remoteStream} />}

      {/* 채팅 디버그 패널 */}
      <ChatDebugPanel />

      {/* 디버그 패널 토글 버튼 */}
      <button
        type="button"
        onClick={() => setShowDebug(!showDebug)}
        className="fixed bottom-4 left-4 bg-gray-800 text-white px-3 py-2 rounded-lg text-xs hover:bg-gray-700 z-50"
      >
        {showDebug ? "🔇 디버그 숨기기" : "🔊 디버그 보기"}
      </button>
    </div>
  );
}
