"use client";

import { useEffect, useState } from "react";

/**
 * AudioDebugPanel 컴포넌트
 * 오디오 스트림 상태를 실시간으로 확인하는 디버깅 패널
 */
export default function AudioDebugPanel({ localStream, remoteStream }) {
  const [localAudioInfo, setLocalAudioInfo] = useState(null);
  const [remoteAudioInfo, setRemoteAudioInfo] = useState(null);

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

  return (
    <div className="fixed bottom-20 left-4 bg-black/80 text-white p-4 rounded-lg text-xs max-w-md z-50">
      <h3 className="font-bold mb-2">🔊 오디오 디버그 정보</h3>

      {/* 로컬 오디오 */}
      <div className="mb-3">
        <div className="font-semibold text-green-400">로컬 오디오:</div>
        {localAudioInfo ? (
          <div className="ml-2">
            <div>트랙 수: {localAudioInfo.trackCount}</div>
            {localAudioInfo.tracks.map((track, _) => (
              <div key={track.label} className="ml-2 text-gray-300">
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
      <div>
        <div className="font-semibold text-blue-400">원격 오디오:</div>
        {remoteAudioInfo ? (
          <div className="ml-2">
            <div>트랙 수: {remoteAudioInfo.trackCount}</div>
            {remoteAudioInfo.tracks.map((track, _) => (
              <div key={track.label} className="ml-2 text-gray-300">
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

      <div className="mt-3 pt-3 border-t border-gray-600 text-gray-400">
        💡 원격 오디오 트랙이 없거나 비활성화되어 있으면 소리가 들리지 않습니다.
      </div>
    </div>
  );
}
