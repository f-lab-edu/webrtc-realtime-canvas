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

      console.log(`\n========== [VideoPlayer useEffect 시작 - Phase 15] ==========`);
      console.log(`🎬 타입: ${playerType}`);
      console.log(`⏰ 타임스탬프: ${timestamp}`);
      console.log(`🆔 Stream ID: ${stream.id}`);

      const videoTracks = stream.getVideoTracks();
      const audioTracks = stream.getAudioTracks();

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

      // Phase 18-2: SimplePeer 공식 패턴 - stream 받으면 즉시 srcObject 할당 및 재생
      console.log(`\n📦 [${playerType}] srcObject 할당 준비`);
      console.log(`   - stream.id: ${stream.id}`);
      console.log(`   - stream.active: ${stream.active}`);
      console.log(`   - videoTracks: ${videoTracks.length}`);
      console.log(`   - audioTracks: ${audioTracks.length}`);

      // 트랙 상태 확인 (이미 선언된 videoTracks, audioTracks 재사용)
      if (videoTracks.length > 0) {
        const videoTrack = videoTracks[0];
        console.log(`   - videoTrack.enabled: ${videoTrack.enabled}`);
        console.log(`   - videoTrack.muted: ${videoTrack.muted}`);
        console.log(`   - videoTrack.readyState: ${videoTrack.readyState}`);
      }

      videoElement.srcObject = stream;

      console.log(`✅ [${playerType}] srcObject 할당 완료`);
      console.log(`   - videoElement.srcObject:`, videoElement.srcObject);
      console.log(`   - videoElement.srcObject === stream:`, videoElement.srcObject === stream);
      console.log(`   - videoElement.parentElement:`, videoElement.parentElement);
      console.log(`   - videoElement.offsetWidth:`, videoElement.offsetWidth);
      console.log(`   - videoElement.offsetHeight:`, videoElement.offsetHeight);
      console.log(`   - videoElement.style.display:`, videoElement.style.display);
      console.log(`   - videoElement.hidden:`, videoElement.hidden);

      if (!isLocal) {
        // Phase 18-2: 원격 비디오는 stream 받으면 재생 준비
        console.log(
          `🎬 [${playerType} Phase 18-2] 원격 스트림 수신, 재생 준비 (SimplePeer 공식 패턴)`
        );
        console.log(`   - videoElement.readyState: ${videoElement.readyState}`);
        console.log(`   - videoElement.paused: ${videoElement.paused}`);
        console.log(`   - videoElement.muted: ${videoElement.muted}`);

        // readyState가 충분히 높으면 즉시 재생, 아니면 loadedmetadata 이벤트 대기
        const tryPlay = () => {
          console.log(
            `🎮 [${playerType}] play() 호출 시도 (readyState: ${videoElement.readyState})`
          );
          videoElement
            .play()
            .then(() => {
              console.log(`✅ [${playerType}] 재생 성공`);
              console.log(`   - readyState: ${videoElement.readyState}`);
              console.log(`   - paused: ${videoElement.paused}`);
              console.log(`   - currentTime: ${videoElement.currentTime}`);
            })
            .catch((err) => {
              console.error(`❌ [${playerType}] 재생 실패:`, err);
              console.error(`   - error.name: ${err.name}`);
              console.error(`   - error.message: ${err.message}`);
              console.error(`   - readyState: ${videoElement.readyState}`);
            });
        };

        // readyState가 HAVE_METADATA(1) 이상이면 즉시 재생
        if (videoElement.readyState >= 1) {
          console.log(`📺 [${playerType}] 메타데이터 이미 로드됨, 즉시 재생`);
          tryPlay();
        } else {
          console.log(`⏳ [${playerType}] 메타데이터 로딩 대기 중...`);
          console.log(`   - 현재 readyState: ${videoElement.readyState}`);
          console.log(`   - loadedmetadata 이벤트 리스너 등록 중...`);

          // loadedmetadata 이벤트를 기다렸다가 재생
          const onLoadedMetadata = () => {
            console.log(`📺 [${playerType}] 메타데이터 로드 완료, 재생 시작`);
            console.log(`   - readyState: ${videoElement.readyState}`);
            tryPlay();
          };
          videoElement.addEventListener("loadedmetadata", onLoadedMetadata, { once: true });
          console.log(`✅ [${playerType}] loadedmetadata 이벤트 리스너 등록 완료`);

          // 타임아웃 설정 (10초 후에도 로드되지 않으면 강제 재생 시도)
          setTimeout(() => {
            if (videoElement.readyState === 0) {
              console.log(`⚠️ [${playerType}] 10초 경과, 여전히 readyState: 0`);
              console.log(`   - srcObject:`, videoElement.srcObject);
              console.log(`   - stream.active:`, stream.active);
              console.log(`   - 강제 재생 시도...`);
              tryPlay();
            }
          }, 10000);
        }
      } else {
        // 로컬 비디오는 autoPlay 속성으로 자동 재생
        console.log(`📹 [${playerType}] 로컬 비디오, autoPlay 사용`);
      }

      // 디버깅용 이벤트 리스너
      const handleLoadedMetadata = () => {
        console.log(`📹 [${playerType}] loadedmetadata - 메타데이터 로드 완료`);
        console.log(`   readyState: ${videoElement.readyState}`);
        console.log(
          `   videoWidth: ${videoElement.videoWidth}, videoHeight: ${videoElement.videoHeight}`
        );
      };

      const handlePlaying = () => {
        console.log(`📹 [${playerType}] playing - 실제 재생 시작`);
        console.log(`   readyState: ${videoElement.readyState}`);
      };

      const handleError = () => {
        console.error(`❌ [${playerType}] error - 비디오 로드 에러`);
        console.error(`   error code: ${videoElement.error?.code}`);
        console.error(`   error message: ${videoElement.error?.message}`);
      };

      videoElement.addEventListener("loadedmetadata", handleLoadedMetadata);
      videoElement.addEventListener("playing", handlePlaying);
      videoElement.addEventListener("error", handleError);

      console.log(`========== [VideoPlayer useEffect 종료] ==========\n`);

      // 클린업 함수
      return () => {
        console.log(`\n🧹 [VideoPlayer 클린업] - ${playerType}`);

        videoElement.removeEventListener("loadedmetadata", handleLoadedMetadata);
        videoElement.removeEventListener("playing", handlePlaying);
        videoElement.removeEventListener("error", handleError);
        if (videoElement.srcObject) {
          videoElement.srcObject = null;
        }
      };
    } else {
      // 스트림이 없으면 초기화
      videoElement.srcObject = null;
    }
  }, [stream, isLocal, label]);

  // 렌더링 디버깅
  const playerType = label || (isLocal ? "로컬" : "원격");
  const isVideoVisible = isLocal ? isVideoEnabled && stream : stream;

  console.log(`[VideoPlayer 렌더링] ${playerType}:`, {
    hasStream: !!stream,
    streamId: stream?.id,
    isVideoVisible,
    isLocal,
    isVideoEnabled,
  });

  return (
    <div className="relative w-full h-full bg-gray-900 rounded-lg overflow-hidden">
      {/* 비디오 엘리먼트 */}
      <video
        ref={videoRef}
        autoPlay={true} // 모든 비디오 autoPlay (브라우저 정책 준수)
        playsInline
        muted={isLocal} // 로컬만 음소거 (에코 방지), 원격은 음소거 해제 (상대방 오디오 재생)
        style={{ minWidth: "100px", minHeight: "100px" }} // 최소 크기 보장
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
