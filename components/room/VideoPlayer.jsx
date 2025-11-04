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
      const timestamp = new Date().toISOString();
      const playerType = label || (isLocal ? "로컬" : "원격");

      console.log(`\n========== [VideoPlayer useEffect 시작] ==========`);
      console.log(`🎬 타입: ${playerType}`);
      console.log(`⏰ 타임스탬프: ${timestamp}`);
      console.log(`🆔 Stream ID: ${stream.id}`);
      console.log(`📺 현재 srcObject: ${videoElement.srcObject?.id || "null"}`);
      console.log(`📊 Video readyState: ${videoElement.readyState}`);

      // 트랙 정보 로깅 (디버깅용)
      const audioTracks = stream.getAudioTracks();
      const videoTracks = stream.getVideoTracks();
      console.log(`\n🎵 오디오 트랙: ${audioTracks.length}개`);
      audioTracks.forEach((track, i) => {
        console.log(
          `  [${i}] ${track.label} - enabled: ${track.enabled}, muted: ${track.muted}, readyState: ${track.readyState}`
        );
      });
      console.log(`🎥 비디오 트랙: ${videoTracks.length}개`);
      videoTracks.forEach((track, i) => {
        console.log(
          `  [${i}] ${track.label} - enabled: ${track.enabled}, muted: ${track.muted}, readyState: ${track.readyState}`
        );
      });

      // 원격 비디오 볼륨 설정
      if (!isLocal) {
        videoElement.volume = 1.0;
        videoElement.muted = false;
      }

      // 원격 비디오: 비디오 트랙이 unmute될 때까지 대기
      if (!isLocal && videoTracks.length > 0) {
        const videoTrack = videoTracks[0];
        console.log(
          `  - 비디오 트랙 상태: muted=${videoTrack.muted}, readyState=${videoTrack.readyState}`
        );

        if (videoTrack.muted) {
          console.log("⏳ 비디오 트랙 unmute 대기 중...");

          // unmute 이벤트 리스너
          const handleUnmute = () => {
            console.log("✅ unmute 이벤트 발생, srcObject 할당");
            videoElement.srcObject = stream;
            videoTrack.removeEventListener("unmute", handleUnmute);
            clearTimeout(timeoutId);
          };

          videoTrack.addEventListener("unmute", handleUnmute);

          // 2초 타임아웃: unmute 안 되면 강제 할당
          const timeoutId = setTimeout(() => {
            console.warn("⚠️ unmute 타임아웃 (2초), 강제로 srcObject 할당");
            videoElement.srcObject = stream;
            videoTrack.removeEventListener("unmute", handleUnmute);
          }, 2000);

          // 클린업에서 리스너 및 타임아웃 제거
          return () => {
            console.log(`[VideoPlayer] 클린업: ${isLocal ? "로컬" : "원격"}`);
            clearTimeout(timeoutId);
            videoTrack.removeEventListener("unmute", handleUnmute);
            if (videoElement.srcObject) {
              videoElement.srcObject = null;
            }
          };
        }
      }

      // 로컬 또는 이미 unmute된 원격 비디오: 즉시 할당
      console.log(`\n✅ srcObject 할당 실행 (${playerType})`);
      console.log(`   할당 전 srcObject: ${videoElement.srcObject?.id || "null"}`);
      videoElement.srcObject = stream;
      console.log(`   할당 후 srcObject: ${videoElement.srcObject?.id || "null"}`);
      console.log(`   할당 후 readyState: ${videoElement.readyState}`);

      // 비디오 로딩 이벤트 리스너 추가 (디버깅용)
      const handleLoadStart = () => {
        console.log(`📹 [${playerType}] loadstart - 브라우저가 미디어 로드 시작`);
        console.log(`   readyState: ${videoElement.readyState}`);
      };

      const handleLoadedMetadata = () => {
        console.log(`📹 [${playerType}] loadedmetadata - 메타데이터 로드 완료`);
        console.log(`   readyState: ${videoElement.readyState}`);
        console.log(
          `   videoWidth: ${videoElement.videoWidth}, videoHeight: ${videoElement.videoHeight}`
        );
        console.log(`   duration: ${videoElement.duration}`);
      };

      const handleLoadedData = () => {
        console.log(`📹 [${playerType}] loadeddata - 첫 프레임 데이터 로드 완료`);
        console.log(`   readyState: ${videoElement.readyState}`);
      };

      const handleCanPlay = () => {
        console.log(`📹 [${playerType}] canplay - 재생 가능 상태`);
        console.log(`   readyState: ${videoElement.readyState}`);
      };

      const handlePlaying = () => {
        console.log(`📹 [${playerType}] playing - 실제 재생 시작`);
        console.log(`   readyState: ${videoElement.readyState}`);
      };

      const handleError = (e) => {
        console.error(`❌ [${playerType}] error - 비디오 로드 에러`);
        console.error(`   error code: ${videoElement.error?.code}`);
        console.error(`   error message: ${videoElement.error?.message}`);
        console.error(`   readyState: ${videoElement.readyState}`);
        console.error(`   networkState: ${videoElement.networkState}`);
      };

      // 이벤트 리스너 등록
      videoElement.addEventListener("loadstart", handleLoadStart);
      videoElement.addEventListener("loadedmetadata", handleLoadedMetadata);
      videoElement.addEventListener("loadeddata", handleLoadedData);
      videoElement.addEventListener("canplay", handleCanPlay);
      videoElement.addEventListener("playing", handlePlaying);
      videoElement.addEventListener("error", handleError);

      // 2초 후 readyState 체크
      const readyStateCheckTimer = setTimeout(() => {
        console.log(`\n⏱️ [${playerType}] 2초 후 readyState 체크:`);
        console.log(`   readyState: ${videoElement.readyState}`);
        console.log(`   srcObject: ${videoElement.srcObject?.id || "null"}`);
        console.log(
          `   videoWidth: ${videoElement.videoWidth}, videoHeight: ${videoElement.videoHeight}`
        );
        console.log(`   paused: ${videoElement.paused}, muted: ${videoElement.muted}`);

        if (videoElement.readyState === 0) {
          console.warn(`⚠️ [${playerType}] readyState가 여전히 0입니다. 재할당 시도`);
          const currentStream = videoElement.srcObject;
          videoElement.srcObject = null;
          setTimeout(() => {
            videoElement.srcObject = currentStream;
            console.log(`🔄 [${playerType}] srcObject 재할당 완료`);
          }, 100);
        }
      }, 2000);

      console.log(`========== [VideoPlayer useEffect 종료] ==========\n`);

      // 클린업 함수
      return () => {
        console.log(`\n🧹 [VideoPlayer 클린업 시작] - ${playerType}`);
        console.log(`   현재 srcObject: ${videoElement.srcObject?.id || "null"}`);
        console.log(`   타임스탬프: ${new Date().toISOString()}`);

        // 타이머 제거
        clearTimeout(readyStateCheckTimer);

        // 이벤트 리스너 제거
        videoElement.removeEventListener("loadstart", handleLoadStart);
        videoElement.removeEventListener("loadedmetadata", handleLoadedMetadata);
        videoElement.removeEventListener("loadeddata", handleLoadedData);
        videoElement.removeEventListener("canplay", handleCanPlay);
        videoElement.removeEventListener("playing", handlePlaying);
        videoElement.removeEventListener("error", handleError);

        if (videoElement.srcObject) {
          videoElement.srcObject = null;
          console.log(`   srcObject를 null로 설정함`);
        }
        console.log(`🧹 [VideoPlayer 클린업 종료]\n`);
      };
    } else {
      // 스트림이 없으면 초기화
      videoElement.srcObject = null;
    }
  }, [stream, isLocal, label]);

  return (
    <div className="relative w-full h-full bg-gray-900 rounded-lg overflow-hidden">
      {/* 비디오 엘리먼트 */}
      <video
        ref={videoRef}
        autoPlay={true}
        playsInline
        // muted={isLocal} // 로컬 비디오는 음소거 (에코 방지)
        muted={true} // 로컬 비디오는 음소거 (에코 방지)
        className={`w-full h-full object-cover ${
          isLocal
            ? !isVideoEnabled || !stream
              ? "hidden"
              : "" // 로컬: isVideoEnabled + stream 체크
            : !stream
              ? "hidden"
              : "" // 원격: stream만 체크
        }`}
      />

      {/* 비디오 비활성화 시 플레이스홀더 */}
      {(isLocal ? !isVideoEnabled || !stream : !stream) && (
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
