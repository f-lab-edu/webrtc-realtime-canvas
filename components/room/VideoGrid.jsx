"use client";

import VideoPlayer from "./VideoPlayer";

/**
 * VideoGrid 컴포넌트
 * 로컬 및 원격 비디오를 Zoom 스타일 레이아웃으로 배치
 *
 * @param {Object} props
 * @param {MediaStream} props.localStream - 로컬 미디어 스트림
 * @param {MediaStream} props.remoteStream - 원격 미디어 스트림
 * @param {boolean} props.isVideoEnabled - 로컬 비디오 활성화 상태
 * @param {boolean} props.isScreenSharing - 화면 공유 중 여부
 */
export default function VideoGrid({
  localStream,
  remoteStream,
  isVideoEnabled = true,
  isScreenSharing = false,
}) {
  // 화면 공유 중일 때는 레이아웃 조정
  const isRemoteConnected = !!remoteStream;

  return (
    <div className="relative w-full h-full bg-gray-950">
      {/* 메인 비디오 영역 (원격 비디오 또는 로컬 비디오) */}
      <div className="w-full h-full">
        {isRemoteConnected ? (
          // 원격 비디오가 있으면 메인에 표시
          <VideoPlayer stream={remoteStream} isLocal={false} isVideoEnabled={true} label="원격" />
        ) : (
          // 원격 비디오가 없으면 로컬 비디오를 메인에 표시
          <div className="w-full h-full flex items-center justify-center">
            <div className="max-w-2xl w-full aspect-video">
              <VideoPlayer
                stream={localStream}
                isLocal={true}
                isVideoEnabled={isVideoEnabled}
                label="나"
              />
            </div>
          </div>
        )}
      </div>

      {/* PIP (Picture-in-Picture) 로컬 비디오 */}
      {isRemoteConnected && localStream && (
        <div className="absolute bottom-4 right-4 w-64 h-48 shadow-2xl rounded-lg overflow-hidden border-2 border-white/20 z-10">
          <VideoPlayer stream={localStream} isLocal={true} isVideoEnabled={isVideoEnabled} />
        </div>
      )}

      {/* 연결 대기 메시지 */}
      {!isRemoteConnected && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center z-20">
          <div className="bg-black/50 backdrop-blur-sm px-6 py-4 rounded-lg">
            <p className="text-white text-lg font-medium">상대방을 기다리는 중...</p>
            <p className="text-gray-300 text-sm mt-2">방 링크를 공유하여 초대하세요</p>
          </div>
        </div>
      )}

      {/* 화면 공유 표시 */}
      {isScreenSharing && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-20">
          <div className="bg-red-500 px-4 py-2 rounded-full shadow-lg">
            <span className="text-white text-sm font-medium">🖥️ 화면 공유 중</span>
          </div>
        </div>
      )}
    </div>
  );
}
