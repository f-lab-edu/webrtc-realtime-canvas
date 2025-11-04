"use client";

import VideoPlayer from "./VideoPlayer";

/**
 * VideoStack 컴포넌트
 * 로컬/원격 비디오를 세로로 스택 배치 (Zoom 스타일)
 *
 * @param {Object} props
 * @param {MediaStream} props.localStream - 로컬 미디어 스트림
 * @param {MediaStream} props.remoteStream - 원격 미디어 스트림
 * @param {boolean} props.isVideoEnabled - 로컬 비디오 활성화 상태
 */
export default function VideoStack({ localStream, remoteStream, isVideoEnabled }) {
  return (
    <div className="flex flex-col gap-3 h-full p-3">
      {/* 로컬 비디오 */}
      <div className="flex-1 rounded-lg overflow-hidden bg-gray-900 border border-gray-800">
        <VideoPlayer
          stream={localStream}
          isLocal={true}
          isVideoEnabled={isVideoEnabled}
          label="로컬"
        />
      </div>

      {/* 원격 비디오 */}
      {remoteStream ? (
        <div className="flex-1 rounded-lg overflow-hidden bg-gray-900 border border-gray-800">
          <VideoPlayer stream={remoteStream} isLocal={false} isVideoEnabled={true} label="원격" />
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center p-6 bg-gray-900 rounded-lg border border-gray-800">
            <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-gray-800 flex items-center justify-center">
              <span className="text-2xl">👥</span>
            </div>
            <p className="text-gray-400 text-xs">상대방 연결 대기 중...</p>
          </div>
        </div>
      )}
    </div>
  );
}
