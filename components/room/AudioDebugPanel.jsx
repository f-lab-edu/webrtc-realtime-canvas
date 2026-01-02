"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * AudioDebugPanel 컴포넌트
 * 오디오 스트림 상태를 실시간으로 확인하는 디버깅 모달
 *
 * @param {MediaStream} localStream - 로컬 미디어 스트림
 * @param {MediaStream} remoteStream - 원격 미디어 스트림
 * @param {Function} onClose - 모달 닫기 콜백
 */
export default function AudioDebugPanel({ localStream, remoteStream, onClose }) {
  const [localAudioInfo, setLocalAudioInfo] = useState(null);
  const [remoteAudioInfo, setRemoteAudioInfo] = useState(null);

  // ESC 키로 닫기
  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === "Escape" && onClose) {
        onClose();
      }
    },
    [onClose]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    const updateAudioInfo = () => {
      // 로컬 오디오 정보
      if (localStream) {
        const audioTracks = localStream.getAudioTracks();
        setLocalAudioInfo({
          trackCount: audioTracks.length,
          tracks: audioTracks.map((track) => ({
            label: track.label,
            enabled: track.enabled,
            muted: track.muted,
            readyState: track.readyState,
          })),
        });
      } else {
        setLocalAudioInfo(null);
      }

      // 원격 오디오 정보
      if (remoteStream) {
        const audioTracks = remoteStream.getAudioTracks();
        setRemoteAudioInfo({
          trackCount: audioTracks.length,
          tracks: audioTracks.map((track) => ({
            label: track.label,
            enabled: track.enabled,
            muted: track.muted,
            readyState: track.readyState,
          })),
        });
      } else {
        setRemoteAudioInfo(null);
      }
    };

    updateAudioInfo();
    const interval = setInterval(updateAudioInfo, 1000);

    return () => clearInterval(interval);
  }, [localStream, remoteStream]);

  // 배경 클릭 시 닫기
  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget && onClose) {
      onClose();
    }
  };

  return (
    // 배경 오버레이
    <div
      className="fixed inset-0 bg-black/50 z-[50] flex items-center justify-center"
      onClick={handleBackdropClick}
    >
      {/* 모달 컨테이너 */}
      <div
        className="bg-gray-900 border border-gray-700 text-white p-4 rounded-lg text-xs max-w-md shadow-xl z-[60]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-sm">🔊 오디오 디버그 정보</h3>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="text-gray-400 hover:text-white text-lg leading-none px-2"
              title="닫기 (ESC)"
            >
              ✕
            </button>
          )}
        </div>

        {/* 로컬 오디오 */}
        <div className="mb-3 p-3 bg-gray-800 rounded border border-gray-700">
          <div className="font-semibold text-green-400 mb-2">로컬 오디오:</div>
          {localAudioInfo ? (
            <div className="ml-2">
              <div>트랙 수: {localAudioInfo.trackCount}</div>
              {localAudioInfo.tracks.map((track, _) => (
                <div key={track.label} className="ml-2 text-gray-300 mt-1">
                  <div>• {track.label || "Unknown"}</div>
                  <div className="ml-4">
                    <span className={track.enabled ? "text-green-400" : "text-red-400"}>
                      {track.enabled ? "✓ 활성화" : "✗ 비활성화"}
                    </span>
                    {" | "}
                    <span className={track.muted ? "text-red-400" : "text-green-400"}>
                      {track.muted ? "음소거됨" : "음소거 안됨"}
                    </span>
                    {" | "}
                    <span>{track.readyState}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="ml-2 text-gray-400">스트림 없음</div>
          )}
        </div>

        {/* 원격 오디오 */}
        <div className="p-3 bg-gray-800 rounded border border-gray-700">
          <div className="font-semibold text-blue-400 mb-2">원격 오디오:</div>
          {remoteAudioInfo ? (
            <div className="ml-2">
              <div>트랙 수: {remoteAudioInfo.trackCount}</div>
              {remoteAudioInfo.tracks.map((track, _) => (
                <div key={track.label} className="ml-2 text-gray-300 mt-1">
                  <div>• {track.label || "Unknown"}</div>
                  <div className="ml-4">
                    <span className={track.enabled ? "text-green-400" : "text-red-400"}>
                      {track.enabled ? "✓ 활성화" : "✗ 비활성화"}
                    </span>
                    {" | "}
                    <span className={track.muted ? "text-red-400" : "text-green-400"}>
                      {track.muted ? "음소거됨" : "음소거 안됨"}
                    </span>
                    {" | "}
                    <span>{track.readyState}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="ml-2 text-gray-400">스트림 없음</div>
          )}
        </div>

        <div className="mt-3 pt-3 border-t border-gray-700 text-gray-400">
          💡 원격 오디오 트랙이 없거나 비활성화되어 있으면 소리가 들리지 않습니다.
        </div>
      </div>
    </div>
  );
}
