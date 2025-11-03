"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useMediaContext } from "@/contexts/MediaContext";
import { useRoomContext } from "@/contexts/RoomContext";

/**
 * ControlBar 컴포넌트
 * 비디오/오디오 제어, 화면 공유, 통화 종료 버튼을 제공
 */
export default function ControlBar() {
  const router = useRouter();
  const { leaveRoom } = useRoomContext();
  const {
    isVideoEnabled,
    isAudioEnabled,
    isScreenSharing,
    toggleVideo,
    toggleAudio,
    startScreenShare,
    stopScreenShare,
  } = useMediaContext();

  /**
   * 통화 종료 핸들러
   */
  const handleEndCall = () => {
    console.log("통화 종료");
    leaveRoom();
    router.push("/");
  };

  /**
   * 화면 공유 토글 핸들러
   */
  const handleToggleScreenShare = async () => {
    try {
      if (isScreenSharing) {
        stopScreenShare();
      } else {
        await startScreenShare();
      }
    } catch (error) {
      console.error("화면 공유 토글 에러:", error);
    }
  };

  return (
    <div className="flex items-center justify-center gap-4 p-4 bg-gray-900/95 backdrop-blur-sm">
      {/* 비디오 on/off 버튼 */}
      <Button
        variant={isVideoEnabled ? "default" : "destructive"}
        size="lg"
        onClick={toggleVideo}
        className="w-14 h-14 rounded-full"
        title={isVideoEnabled ? "비디오 끄기" : "비디오 켜기"}
      >
        <span className="text-xl">{isVideoEnabled ? "📹" : "📹❌"}</span>
      </Button>

      {/* 오디오 on/off 버튼 */}
      <Button
        variant={isAudioEnabled ? "default" : "destructive"}
        size="lg"
        onClick={toggleAudio}
        className="w-14 h-14 rounded-full"
        title={isAudioEnabled ? "마이크 끄기" : "마이크 켜기"}
      >
        <span className="text-xl">{isAudioEnabled ? "🎤" : "🎤❌"}</span>
      </Button>

      {/* 화면 공유 버튼 */}
      <Button
        variant={isScreenSharing ? "secondary" : "outline"}
        size="lg"
        onClick={handleToggleScreenShare}
        className="w-14 h-14 rounded-full"
        title={isScreenSharing ? "화면 공유 중지" : "화면 공유"}
      >
        <span className="text-xl">{isScreenSharing ? "🖥️✓" : "🖥️"}</span>
      </Button>

      {/* 통화 종료 버튼 */}
      <Button
        variant="destructive"
        size="lg"
        onClick={handleEndCall}
        className="w-14 h-14 rounded-full bg-red-600 hover:bg-red-700"
        title="통화 종료"
      >
        <span className="text-xl">📞</span>
      </Button>
    </div>
  );
}
