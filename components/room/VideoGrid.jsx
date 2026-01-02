"use client";

import styles from "./VideoGrid.module.css";
import VideoPlayer from "./VideoPlayer";

/**
 * VideoGrid 컴포넌트
 * SFU: 다중 참가자 비디오를 그리드 레이아웃으로 배치 (최대 20명)
 *
 * @param {Object} props
 * @param {MediaStream} props.localStream - 로컬 미디어 스트림
 * @param {Map<string, MediaStream>} props.remoteStreams - 원격 미디어 스트림 Map (socketId -> stream)
 * @param {boolean} props.isVideoEnabled - 로컬 비디오 활성화 상태
 * @param {boolean} props.isScreenSharing - 화면 공유 중 여부
 * @param {Map<string, string>} props.participantNicknames - 참가자 닉네임 Map (socketId -> nickname)
 * @param {string} props.hostSocketId - 호스트 소켓 ID
 * @param {string} props.mySocketId - 현재 사용자 소켓 ID
 */
export default function VideoGrid({
  localStream,
  remoteStreams,
  isVideoEnabled = true,
  isScreenSharing = false,
  participantNicknames = new Map(),
  hostSocketId = null,
  mySocketId = null,
}) {
  // remoteStreams Map을 배열로 변환
  const streamArray = Array.from(remoteStreams.entries());
  const remoteCount = streamArray.length;

  /**
   * 참가자 수에 따른 그리드 클래스 결정 (최대 20명)
   * @param {number} count - 참가자 수 (로컬 포함)
   * @returns {string} CSS 클래스명
   */
  const getGridClass = (count) => {
    if (count <= 1) return styles["grid-1"];
    if (count <= 2) return styles["grid-2"];
    if (count <= 4) return styles["grid-4"];
    if (count <= 6) return styles["grid-6"];
    if (count <= 9) return styles["grid-9"];
    if (count <= 12) return styles["grid-12"];
    if (count <= 16) return styles["grid-16"];
    return styles["grid-20"];
  };

  // 전체 참가자 수 (로컬 + 원격)
  const totalParticipants = localStream ? remoteCount + 1 : remoteCount;
  const gridClass = getGridClass(totalParticipants);

  return (
    <div className="relative w-full h-full bg-gray-950">
      {/* 그리드 레이아웃 */}
      <div className={`w-full h-full ${gridClass}`}>
        {/* 로컬 비디오 */}
        {localStream && (
          <div className={styles["video-item"]}>
            <VideoPlayer
              stream={localStream}
              isLocal={true}
              isVideoEnabled={isVideoEnabled}
              nickname="나"
              isHost={mySocketId === hostSocketId}
            />
          </div>
        )}

        {/* 원격 비디오들 */}
        {streamArray.map(([socketId, stream]) => {
          const nickname = participantNicknames.get(socketId) || "참가자";
          const isHost = socketId === hostSocketId;

          return (
            <div key={socketId} className={styles["video-item"]}>
              <VideoPlayer
                stream={stream}
                isLocal={false}
                isVideoEnabled={true}
                nickname={nickname}
                isHost={isHost}
              />
            </div>
          );
        })}
      </div>

      {/* 연결 대기 메시지 (참가자가 없을 때) */}
      {remoteCount === 0 && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center z-20">
          <div className="bg-black/50 backdrop-blur-sm px-6 py-4 rounded-lg">
            <p className="text-white text-lg font-medium">다른 참가자를 기다리는 중...</p>
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
