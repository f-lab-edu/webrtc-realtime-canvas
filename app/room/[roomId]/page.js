"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import AudioDebugPanel from "@/components/room/AudioDebugPanel";
import ControlBar from "@/components/room/ControlBar";
import VideoStack from "@/components/room/VideoStack";
import { Button } from "@/components/ui/button";
import WhiteboardCanvas from "@/components/whiteboard/WhiteboardCanvas";
import WhiteboardToolbar from "@/components/whiteboard/WhiteboardToolbar";
import { useMediaContext } from "@/contexts/MediaContext";
import { useRoomContext } from "@/contexts/RoomContext";
import useWebRTC from "@/hooks/useWebRTC";

/**
 * 방 페이지 컴포넌트
 * 동적 라우팅으로 roomId를 받아 방에 참가하고 미디어를 초기화
 */
export default function RoomPage() {
  const params = useParams();
  const roomId = params.roomId;
  const router = useRouter();

  // Context 및 Hooks
  const { joinRoom, isConnected, showChat, toggleChat } = useRoomContext();
  const { localStream, remoteStream, initializeMedia, isVideoEnabled } = useMediaContext();
  useWebRTC(); // WebRTC 연결 관리

  // 디버그 패널 표시 상태
  const [showDebug, setShowDebug] = useState(true);

  // URL 복사 성공 상태
  const [copySuccess, setCopySuccess] = useState(false);

  // 초기화 상태 (ref로 관리하여 중복 실행 방지)
  const isInitializedRef = useRef(false);

  /**
   * 컴포넌트 마운트 시 방 참가 및 미디어 초기화
   */

  // biome-ignore lint/correctness/useExhaustiveDependencies: roomId only
  useEffect(() => {
    // 이미 초기화되었으면 무시
    if (isInitializedRef.current) {
      console.log("이미 초기화되었습니다. 중복 실행 방지");
      return;
    }

    const initialize = async () => {
      try {
        console.log("방 페이지 초기화 시작:", roomId);
        isInitializedRef.current = true;

        // 1. 미디어 스트림 초기화 (웹캠 + 마이크)
        await initializeMedia();
        console.log("미디어 초기화 완료");

        // 2. 방 참가
        await joinRoom(roomId);
        console.log("방 참가 완료");
      } catch (error) {
        console.error("방 초기화 에러:", error);
        isInitializedRef.current = false; // 에러 발생 시 재시도 가능하도록
        alert("방 참가에 실패했습니다. 미디어 권한을 확인해주세요.");
      }
    };

    initialize();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]); // roomId가 변경될 때만 실행

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

          <Button
            onClick={toggleChat}
            variant="outline"
            size="sm"
            className="text-white"
            title={showChat ? "채팅 숨기기" : "채팅 보기"}
          >
            {showChat ? "💬" : "◀"}
          </Button>

          <Button onClick={copyRoomUrl} variant="outline" size="sm" className="text-white">
            {copySuccess ? "✅ 복사됨" : "🔗 링크 복사"}
          </Button>
        </div>
      </header>

      {/* 메인 컨텐츠: 3컬럼 레이아웃 (3:5:2 비율) */}
      <div className="flex-1 flex flex-row min-h-0">
        {/* 왼쪽: 비디오 스택 (30%) */}
        <aside className="flex-[3] h-full bg-gray-950 border-r border-gray-800">
          <VideoStack
            localStream={localStream}
            remoteStream={remoteStream}
            isVideoEnabled={isVideoEnabled}
          />
        </aside>

        {/* 중앙: 화이트보드 (50%) */}
        <main className="flex-[5] flex flex-col min-h-0">
          <WhiteboardToolbar />
          <div className="flex-1 min-h-0">
            <WhiteboardCanvas />
          </div>
        </main>

        {/* 오른쪽: 채팅 영역 (20%) */}
        {showChat && (
          <aside className="flex-[2] bg-gray-900 border-l border-gray-800 transition-all duration-300">
            <div className="p-4 h-full flex items-center justify-center">
              <div className="text-center">
                <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-gray-800 flex items-center justify-center">
                  <span className="text-2xl">💬</span>
                </div>
                <p className="text-gray-500 text-sm">채팅 기능</p>
                <p className="text-gray-600 text-xs mt-1">준비 중...</p>
              </div>
            </div>
          </aside>
        )}
      </div>

      {/* 하단 컨트롤 바 */}
      <ControlBar />

      {/* 오디오 디버그 패널 (개발 중에만 표시) */}
      {showDebug && <AudioDebugPanel localStream={localStream} remoteStream={remoteStream} />}

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
