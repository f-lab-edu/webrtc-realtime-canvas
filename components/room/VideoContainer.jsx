"use client";

import { useMemo, useState } from "react";
import SpeakerView from "./SpeakerView";
import styles from "./VideoContainer.module.css";
import VideoGrid from "./VideoGrid";

// 그리드 모드 임계값 (이 수 이하면 그리드, 초과하면 스피커 뷰)
const GRID_THRESHOLD = 9;

/**
 * VideoContainer 컴포넌트
 * 하이브리드 레이아웃: 참가자 수에 따라 VideoGrid ↔ SpeakerView 자동 전환
 *
 * @param {Object} props
 * @param {MediaStream} props.localStream - 로컬 미디어 스트림
 * @param {Map<string, MediaStream>} props.remoteStreams - 원격 미디어 스트림 Map (socketId -> stream)
 * @param {boolean} props.isVideoEnabled - 로컬 비디오 활성화 상태
 * @param {boolean} props.isScreenSharing - 화면 공유 중 여부
 * @param {Map<string, string>} props.participantNicknames - 참가자 닉네임 Map (socketId -> nickname)
 * @param {string} props.hostSocketId - 호스트 소켓 ID
 * @param {string} props.mySocketId - 현재 사용자 소켓 ID
 * @param {string} props.activeSpeakerId - 현재 발화자 socketId (스피커 뷰용)
 */
export default function VideoContainer({
  localStream,
  remoteStreams,
  isVideoEnabled = true,
  isScreenSharing = false,
  participantNicknames = new Map(),
  hostSocketId = null,
  mySocketId = null,
  activeSpeakerId = null,
}) {
  // 뷰 모드 상태: 'auto' | 'grid' | 'speaker'
  const [viewMode, setViewMode] = useState("auto");

  // 전체 참가자 수 계산
  const totalParticipants = useMemo(() => {
    const remoteCount = remoteStreams?.size || 0;
    return localStream ? remoteCount + 1 : remoteCount;
  }, [localStream, remoteStreams]);

  // 자동 모드에서의 뷰 결정
  const autoViewMode = useMemo(() => {
    return totalParticipants <= GRID_THRESHOLD ? "grid" : "speaker";
  }, [totalParticipants]);

  // 실제 적용될 뷰 모드
  const actualViewMode = useMemo(() => {
    return viewMode === "auto" ? autoViewMode : viewMode;
  }, [viewMode, autoViewMode]);

  // 뷰 모드 변경 핸들러
  const handleViewModeChange = (mode) => {
    setViewMode(mode);
  };

  return (
    <div className={styles.container}>
      {/* 비디오 영역 */}
      <div className={styles.videoArea}>
        {actualViewMode === "grid" ? (
          <VideoGrid
            localStream={localStream}
            remoteStreams={remoteStreams}
            isVideoEnabled={isVideoEnabled}
            isScreenSharing={isScreenSharing}
            participantNicknames={participantNicknames}
            hostSocketId={hostSocketId}
            mySocketId={mySocketId}
          />
        ) : (
          <SpeakerView
            localStream={localStream}
            remoteStreams={remoteStreams}
            activeSpeakerId={activeSpeakerId}
            participantNicknames={participantNicknames}
            mySocketId={mySocketId}
            hostSocketId={hostSocketId}
            isVideoEnabled={isVideoEnabled}
          />
        )}
      </div>

      {/* 뷰 모드 토글 (참가자 3명 이상일 때만 표시) */}
      {totalParticipants >= 3 && (
        <div className={styles.toggleContainer}>
          <span className={styles.participantCount}>{totalParticipants}명</span>

          <button
            type="button"
            className={`${styles.toggleButton} ${viewMode === "auto" ? styles.active : ""}`}
            onClick={() => handleViewModeChange("auto")}
          >
            자동
            {viewMode === "auto" && (
              <span className={styles.autoIndicator}>
                ({autoViewMode === "grid" ? "그리드" : "스피커"})
              </span>
            )}
          </button>

          <button
            type="button"
            className={`${styles.toggleButton} ${viewMode === "grid" ? styles.active : ""}`}
            onClick={() => handleViewModeChange("grid")}
          >
            그리드
          </button>

          <button
            type="button"
            className={`${styles.toggleButton} ${viewMode === "speaker" ? styles.active : ""}`}
            onClick={() => handleViewModeChange("speaker")}
          >
            스피커
          </button>
        </div>
      )}
    </div>
  );
}
