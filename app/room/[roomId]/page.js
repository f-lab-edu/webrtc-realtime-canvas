"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import ChatPanel from "@/components/chat/ChatPanel";
import ConnectionStatus from "@/components/room/ConnectionStatus";
import ControlBar from "@/components/room/ControlBar";
import VideoGrid from "@/components/room/VideoGrid";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import WhiteboardCanvas from "@/components/whiteboard/WhiteboardCanvas";
import WhiteboardToolbar from "@/components/whiteboard/WhiteboardToolbar";
import { useMediaContext } from "@/contexts/MediaContext";
import { useRoomContext } from "@/contexts/RoomContext";
import useChat from "@/hooks/useChat";
import useWebRTC from "@/hooks/useWebRTC";

/**
 * 방 페이지 컴포넌트
 * 동적 라우팅으로 roomId를 받아 방에 참가하고 미디어를 초기화
 */
export default function RoomPage() {
  const params = useParams();
  const roomId = params.roomId;

  // Context 및 Hooks
  const { joinRoom, isConnected } = useRoomContext();
  const { localStream, remoteStream, initializeMedia, isVideoEnabled, isScreenSharing } =
    useMediaContext();
  useWebRTC(); // WebRTC 연결 관리

  // 채팅 훅
  const {
    messages,
    unreadCount,
    sendMessage,
    clearUnreadCount,
    isTyping,
    startTyping,
    stopTyping,
  } = useChat();

  // 뷰 전환 상태 ('video' | 'whiteboard' | 'chat')
  const [activeView, setActiveView] = useState("video");

  // 채팅 패널 열림/닫힘 상태
  const [isChatOpen, setIsChatOpen] = useState(false);

  // 초기화 상태
  const [isInitialized, setIsInitialized] = useState(false);

  /**
   * 컴포넌트 마운트 시 방 참가 및 미디어 초기화
   */
  useEffect(() => {
    const initialize = async () => {
      if (isInitialized) {
        return;
      }

      try {
        console.log("방 페이지 초기화 시작:", roomId);

        // 1. 미디어 스트림 초기화 (웹캠 + 마이크)
        await initializeMedia();
        console.log("미디어 초기화 완료");

        // 2. 방 참가
        await joinRoom(roomId);
        console.log("방 참가 완료");

        setIsInitialized(true);
      } catch (error) {
        console.error("방 초기화 에러:", error);
        alert("방 참가에 실패했습니다. 미디어 권한을 확인해주세요.");
      }
    };

    initialize();
  }, [roomId, joinRoom, initializeMedia, isInitialized]);

  /**
   * 뷰 전환 핸들러
   */
  const handleViewChange = (view) => {
    setActiveView(view);
    console.log("뷰 전환:", view);

    // 채팅 뷰로 전환 시 읽지 않은 메시지 카운트 초기화
    if (view === "chat") {
      clearUnreadCount();
    }
  };

  /**
   * 채팅 패널 토글 핸들러
   */
  const handleToggleChat = () => {
    setIsChatOpen(!isChatOpen);

    // 채팅 패널 열 때 읽지 않은 메시지 카운트 초기화
    if (!isChatOpen) {
      clearUnreadCount();
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-950">
      {/* 상단 탭 네비게이션 */}
      <div className="flex items-center justify-between px-6 py-3 bg-gray-900 border-b border-gray-800">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-semibold text-white">방 ID: {roomId}</h1>
          {isConnected && <span className="text-sm text-green-400">● 연결됨</span>}
        </div>

        {/* 뷰 전환 탭 */}
        <div className="flex gap-2">
          <Button
            variant={activeView === "video" ? "default" : "ghost"}
            onClick={() => handleViewChange("video")}
            className="text-white"
          >
            📹 비디오
          </Button>
          <Button
            variant={activeView === "whiteboard" ? "default" : "ghost"}
            onClick={() => handleViewChange("whiteboard")}
            className="text-white"
          >
            ✏️ 화이트보드
          </Button>
          <Button
            variant={activeView === "chat" ? "default" : "ghost"}
            onClick={() => handleViewChange("chat")}
            className="text-white relative"
          >
            💬 채팅
            {/* 읽지 않은 메시지 배지 */}
            {unreadCount > 0 && activeView !== "chat" && (
              <Badge
                variant="destructive"
                className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
              >
                {unreadCount > 9 ? "9+" : unreadCount}
              </Badge>
            )}
          </Button>
        </div>
      </div>

      {/* 메인 컨텐츠 영역 */}
      <div className="flex-1 relative">
        {/* 연결 상태 표시 */}
        <ConnectionStatus />

        {/* 비디오 뷰 */}
        {activeView === "video" && (
          <VideoGrid
            localStream={localStream}
            remoteStream={remoteStream}
            isVideoEnabled={isVideoEnabled}
            isScreenSharing={isScreenSharing}
          />
        )}

        {/* 화이트보드 뷰 */}
        {activeView === "whiteboard" && (
          <div className="w-full h-full flex flex-col">
            <WhiteboardToolbar />
            <div className="flex-1">
              <WhiteboardCanvas />
            </div>
          </div>
        )}

        {/* 채팅 뷰 */}
        {activeView === "chat" && (
          <div className="w-full h-full">
            <ChatPanel
              messages={messages}
              unreadCount={unreadCount}
              onSendMessage={sendMessage}
              onClearUnread={clearUnreadCount}
              isTyping={isTyping}
              onStartTyping={startTyping}
              onStopTyping={stopTyping}
            />
          </div>
        )}
      </div>

      {/* 하단 컨트롤 바 */}
      <ControlBar />
    </div>
  );
}
