"use client";

import { Badge } from "@/components/ui/badge";
import { useRoomContext } from "@/contexts/RoomContext";
import useWebRTC from "@/hooks/useWebRTC";

/**
 * ConnectionStatus 컴포넌트
 * Socket 및 WebRTC 연결 상태를 표시
 */
export default function ConnectionStatus() {
  const { connectionState: socketState, isConnected } = useRoomContext();
  const { connectionState: webrtcState } = useWebRTC();

  /**
   * Socket 연결 상태에 따른 뱃지 variant 결정
   */
  const getSocketBadgeVariant = () => {
    switch (socketState) {
      case "connected":
        return "default";
      case "connecting":
        return "secondary";
      case "disconnected":
        return "destructive";
      default:
        return "outline";
    }
  };

  /**
   * WebRTC 연결 상태에 따른 뱃지 variant 결정
   */
  const getWebRTCBadgeVariant = () => {
    switch (webrtcState) {
      case "connected":
        return "default";
      case "connecting":
        return "secondary";
      case "disconnected":
        return "outline";
      default:
        return "outline";
    }
  };

  /**
   * Socket 연결 상태 텍스트
   */
  const getSocketStatusText = () => {
    switch (socketState) {
      case "connected":
        return "서버 연결됨";
      case "connecting":
        return "서버 연결 중...";
      case "disconnected":
        return "서버 연결 끊김";
      default:
        return "알 수 없음";
    }
  };

  /**
   * WebRTC 연결 상태 텍스트
   */
  const getWebRTCStatusText = () => {
    switch (webrtcState) {
      case "connected":
        return "P2P 연결됨";
      case "connecting":
        return "P2P 연결 중...";
      case "disconnected":
        return "P2P 대기 중";
      default:
        return "P2P 대기 중";
    }
  };

  return (
    <div className="absolute top-4 left-4 flex flex-col gap-2 z-10">
      {/* Socket 연결 상태 */}
      <Badge variant={getSocketBadgeVariant()} className="shadow-lg">
        <span className="mr-1">
          {isConnected ? "🟢" : socketState === "connecting" ? "🟡" : "🔴"}
        </span>
        {getSocketStatusText()}
      </Badge>

      {/* WebRTC 연결 상태 */}
      <Badge variant={getWebRTCBadgeVariant()} className="shadow-lg">
        <span className="mr-1">
          {webrtcState === "connected" ? "🟢" : webrtcState === "connecting" ? "🟡" : "⚪"}
        </span>
        {getWebRTCStatusText()}
      </Badge>

      {/* 재연결 중 표시 */}
      {socketState === "connecting" && (
        <Badge variant="secondary" className="shadow-lg animate-pulse">
          <span className="mr-1">🔄</span>
          재연결 중...
        </Badge>
      )}
    </div>
  );
}
