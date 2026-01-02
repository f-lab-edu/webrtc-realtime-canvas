"use client";

import { useEffect, useRef } from "react";

/**
 * VideoPlayer 컴포넌트
 * MediaStream을 video 엘리먼트에 연결하여 재생
 *
 * @param {Object} props
 * @param {MediaStream} props.stream - 재생할 미디어 스트림
 * @param {boolean} props.isLocal - 로컬 비디오 여부
 * @param {boolean} props.isVideoEnabled - 비디오 활성화 상태
 * @param {string} props.nickname - 참가자 닉네임
 * @param {boolean} props.isHost - 호스트 여부
 * @param {Object} props.mediaState - 미디어 상태 { audioEnabled, videoEnabled }
 */
export default function VideoPlayer({
  stream,
  isLocal = false,
  isVideoEnabled = true,
  nickname = "",
  isHost = false,
  mediaState = null,
}) {
  const videoRef = useRef(null);

  /**
   * MediaStream을 video 엘리먼트에 연결
   */
  useEffect(() => {
    const videoElement = videoRef.current;

    if (!videoElement || !stream) {
      return;
    }

    console.log(`[VideoPlayer] 스트림 연결: ${nickname || (isLocal ? "로컬" : "원격")}`);
    videoElement.srcObject = stream;

    // 원격 비디오 자동 재생
    if (!isLocal) {
      videoElement.play().catch((err) => {
        console.error(`[VideoPlayer] 재생 실패:`, err);
      });
    }

    // 클린업
    return () => {
      if (videoElement.srcObject) {
        videoElement.srcObject = null;
      }
    };
  }, [stream, isLocal, nickname]);

  // 비디오 표시 여부 결정
  const showVideo = isLocal ? isVideoEnabled && stream : stream;

  // 미디어 상태 (원격 참가자용)
  const audioEnabled = mediaState?.audioEnabled ?? true;
  const videoEnabled = mediaState?.videoEnabled ?? isVideoEnabled;

  // 닉네임 첫 글자 (아바타용)
  const initial = nickname ? nickname.charAt(0).toUpperCase() : isLocal ? "나" : "?";

  return (
    <div className="relative w-full h-full bg-gray-900 rounded-lg overflow-hidden">
      {/* 비디오 엘리먼트 */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isLocal}
        className={`w-full h-full object-cover ${showVideo ? "" : "hidden"}`}
      />

      {/* 비디오 비활성화 시 플레이스홀더 (아바타) */}
      {!showVideo && (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-blue-600 to-purple-600">
          <div className="text-center">
            <div className="w-24 h-24 mx-auto mb-4 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center border-4 border-white/30">
              <span className="text-4xl font-bold text-white">{initial}</span>
            </div>
            <p className="text-white text-sm font-medium">{nickname || "연결 대기 중..."}</p>
          </div>
        </div>
      )}

      {/* 하단: 닉네임 및 호스트 배지 */}
      <div className="absolute bottom-2 left-2 flex items-center gap-2">
        {/* 닉네임 */}
        <div className="px-3 py-1 bg-black/60 backdrop-blur-sm rounded-md flex items-center gap-2">
          <span className="text-white text-sm font-medium">
            {nickname || (isLocal ? "나" : "참가자")}
          </span>
          {/* 호스트 배지 */}
          {isHost && (
            <span className="text-yellow-400" title="호스트">
              👑
            </span>
          )}
        </div>
      </div>

      {/* 우측 상단: 미디어 상태 인디케이터 */}
      <div className="absolute top-2 right-2 flex gap-2">
        {/* 마이크 상태 */}
        {!audioEnabled && (
          <div
            className="w-8 h-8 bg-red-500/80 backdrop-blur-sm rounded-full flex items-center justify-center"
            title="마이크 꺼짐"
          >
            <span className="text-white text-sm">🔇</span>
          </div>
        )}

        {/* 비디오 상태 */}
        {!videoEnabled && stream && (
          <div
            className="w-8 h-8 bg-red-500/80 backdrop-blur-sm rounded-full flex items-center justify-center"
            title="비디오 꺼짐"
          >
            <span className="text-white text-sm">📹</span>
          </div>
        )}
      </div>
    </div>
  );
}
