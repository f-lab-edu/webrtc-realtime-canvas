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
 * @param {string} props.label - 비디오 라벨 (예: "나", "상대방")
 */
export default function VideoPlayer({
  stream,
  isLocal = false,
  isVideoEnabled = true,
  label = "",
}) {
  const videoRef = useRef(null);

  /**
   * MediaStream을 video 엘리먼트에 연결
   */
  useEffect(() => {
    const videoElement = videoRef.current;

    if (!videoElement) {
      return;
    }

    if (stream) {
      // 스트림을 video 엘리먼트에 연결
      videoElement.srcObject = stream;
      console.log(`비디오 스트림 연결: ${label || (isLocal ? "로컬" : "원격")}`);
    } else {
      // 스트림이 없으면 초기화
      videoElement.srcObject = null;
    }

    // 클린업 함수
    return () => {
      if (videoElement.srcObject) {
        videoElement.srcObject = null;
      }
    };
  }, [stream, isLocal, label]);

  return (
    <div className="relative w-full h-full bg-gray-900 rounded-lg overflow-hidden">
      {/* 비디오 엘리먼트 */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isLocal} // 로컬 비디오는 음소거 (에코 방지)
        className={`w-full h-full object-cover ${!isVideoEnabled || !stream ? "hidden" : ""}`}
      />

      {/* 비디오 비활성화 시 플레이스홀더 */}
      {(!isVideoEnabled || !stream) && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-800">
          <div className="text-center">
            <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gray-700 flex items-center justify-center">
              <span className="text-3xl">{isLocal ? "👤" : "👥"}</span>
            </div>
            <p className="text-white text-sm">{!stream ? "연결 대기 중..." : "비디오 꺼짐"}</p>
          </div>
        </div>
      )}

      {/* 라벨 표시 */}
      {label && (
        <div className="absolute bottom-4 left-4 px-3 py-1 bg-black/50 rounded-md">
          <span className="text-white text-sm font-medium">{label}</span>
        </div>
      )}

      {/* 로컬 비디오 표시 */}
      {isLocal && !label && (
        <div className="absolute bottom-4 left-4 px-3 py-1 bg-black/50 rounded-md">
          <span className="text-white text-sm font-medium">나</span>
        </div>
      )}
    </div>
  );
}
