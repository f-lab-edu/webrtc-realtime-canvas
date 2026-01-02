"use client";

import { useMemo, useState } from "react";
import styles from "./SpeakerView.module.css";
import VideoPlayer from "./VideoPlayer";

/**
 * SpeakerView 컴포넌트
 * 스피커 뷰: 메인 스피커(상단 60%) + 썸네일(하단 40%) 레이아웃
 *
 * @param {Object} props
 * @param {MediaStream} props.localStream - 로컬 미디어 스트림
 * @param {Map<string, MediaStream>} props.remoteStreams - 원격 미디어 스트림 Map (socketId -> stream)
 * @param {string} props.activeSpeakerId - 현재 발화자 socketId (null이면 호스트)
 * @param {Map<string, string>} props.participantNicknames - 참가자 닉네임 Map (socketId -> nickname)
 * @param {string} props.mySocketId - 현재 사용자 소켓 ID
 * @param {string} props.hostSocketId - 호스트 소켓 ID
 * @param {boolean} props.isVideoEnabled - 로컬 비디오 활성화 상태
 */
export default function SpeakerView({
  localStream,
  remoteStreams,
  activeSpeakerId = null,
  participantNicknames = new Map(),
  mySocketId = null,
  hostSocketId = null,
  isVideoEnabled = true,
}) {
  // 수동으로 선택한 메인 스피커 (썸네일 클릭 시)
  const [selectedSpeakerId, setSelectedSpeakerId] = useState(null);

  // 모든 참가자 목록 생성 (로컬 + 원격)
  const allParticipants = useMemo(() => {
    const participants = [];

    // 로컬 사용자 추가
    if (localStream && mySocketId) {
      participants.push({
        socketId: mySocketId,
        stream: localStream,
        nickname: "나",
        isLocal: true,
        isHost: mySocketId === hostSocketId,
      });
    }

    // 원격 사용자 추가
    for (const [socketId, stream] of remoteStreams.entries()) {
      participants.push({
        socketId,
        stream,
        nickname: participantNicknames.get(socketId) || "참가자",
        isLocal: false,
        isHost: socketId === hostSocketId,
      });
    }

    return participants;
  }, [localStream, remoteStreams, mySocketId, hostSocketId, participantNicknames]);

  // 메인 스피커 결정 (우선순위: 수동 선택 > 발화자 > 호스트 > 첫 번째 참가자)
  const mainSpeaker = useMemo(() => {
    if (allParticipants.length === 0) return null;

    // 1. 수동 선택된 스피커
    if (selectedSpeakerId) {
      const selected = allParticipants.find((p) => p.socketId === selectedSpeakerId);
      if (selected) return selected;
    }

    // 2. 현재 발화자
    if (activeSpeakerId) {
      const speaker = allParticipants.find((p) => p.socketId === activeSpeakerId);
      if (speaker) return speaker;
    }

    // 3. 호스트
    if (hostSocketId) {
      const host = allParticipants.find((p) => p.socketId === hostSocketId);
      if (host) return host;
    }

    // 4. 첫 번째 참가자
    return allParticipants[0];
  }, [allParticipants, selectedSpeakerId, activeSpeakerId, hostSocketId]);

  // 썸네일 목록 (메인 스피커 제외)
  const thumbnailParticipants = useMemo(() => {
    if (!mainSpeaker) return allParticipants;
    return allParticipants.filter((p) => p.socketId !== mainSpeaker.socketId);
  }, [allParticipants, mainSpeaker]);

  // 썸네일 클릭 핸들러
  const handleThumbnailClick = (socketId) => {
    setSelectedSpeakerId(socketId);
  };

  // 참가자가 없을 때
  if (allParticipants.length === 0) {
    return (
      <div className={styles.container}>
        <div className={styles.emptyState}>참가자를 기다리는 중...</div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* 메인 스피커 영역 */}
      <div className={styles.mainSpeaker}>
        {mainSpeaker && (
          <div className={styles.videoItem}>
            <VideoPlayer
              stream={mainSpeaker.stream}
              isLocal={mainSpeaker.isLocal}
              isVideoEnabled={mainSpeaker.isLocal ? isVideoEnabled : true}
              nickname={mainSpeaker.nickname}
              isHost={mainSpeaker.isHost}
            />
          </div>
        )}
      </div>

      {/* 썸네일 영역 */}
      <div className={styles.thumbnailContainer}>
        <div className={styles.thumbnailScroll}>
          {thumbnailParticipants.map((participant) => (
            <button
              type="button"
              key={participant.socketId}
              className={`${styles.thumbnailItem} ${
                selectedSpeakerId === participant.socketId ? styles.active : ""
              }`}
              onClick={() => handleThumbnailClick(participant.socketId)}
              aria-label={`${participant.nickname} 비디오 선택`}
            >
              <VideoPlayer
                stream={participant.stream}
                isLocal={participant.isLocal}
                isVideoEnabled={participant.isLocal ? isVideoEnabled : true}
                nickname={participant.nickname}
                isHost={participant.isHost}
              />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
