"use client";

import { useRoomContext } from "@/contexts";

/**
 * ParticipantList 컴포넌트
 * P2P Mesh: 참가자 목록 표시 및 권한 관리 (호스트 전용)
 *
 * @param {Object} props
 * @param {Map<string, string>} props.participantNicknames - 참가자 닉네임 Map (socketId -> nickname)
 * @param {string} props.hostSocketId - 호스트 소켓 ID
 * @param {string} props.mySocketId - 현재 사용자 소켓 ID
 */
export default function ParticipantList({
  participantNicknames = new Map(),
  hostSocketId = null,
  mySocketId = null,
}) {
  const {
    isHost,
    hasScreenSharePermission,
    grantScreenSharePermission,
    revokeScreenSharePermission,
  } = useRoomContext();

  // 참가자 목록 배열로 변환
  const participants = Array.from(participantNicknames.entries());

  return (
    <div className="bg-gray-900/95 backdrop-blur-sm rounded-lg p-4 max-h-96 overflow-y-auto">
      {/* 헤더 */}
      <div className="mb-4 pb-2 border-b border-gray-700">
        <h3 className="text-white text-lg font-semibold">참가자 ({participants.length + 1})</h3>
      </div>

      {/* 참가자 목록 */}
      <div className="space-y-2">
        {/* 본인 (항상 최상단) */}
        <div className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg">
          <div className="flex items-center gap-3">
            {/* 아바타 */}
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center">
              <span className="text-white text-sm font-bold">나</span>
            </div>
            {/* 닉네임 및 호스트 배지 */}
            <div className="flex items-center gap-2">
              <span className="text-white text-sm font-medium">나</span>
              {mySocketId === hostSocketId && (
                <span className="text-yellow-400 text-lg" title="호스트">
                  👑
                </span>
              )}
            </div>
          </div>
        </div>

        {/* 다른 참가자들 */}
        {participants.map(([socketId, nickname]) => {
          const isParticipantHost = socketId === hostSocketId;
          const initial = nickname ? nickname.charAt(0).toUpperCase() : "?";

          return (
            <div
              key={socketId}
              className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg"
            >
              <div className="flex items-center gap-3">
                {/* 아바타 */}
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-600 to-teal-600 flex items-center justify-center">
                  <span className="text-white text-sm font-bold">{initial}</span>
                </div>
                {/* 닉네임 및 호스트 배지 */}
                <div className="flex items-center gap-2">
                  <span className="text-white text-sm font-medium">{nickname || "참가자"}</span>
                  {isParticipantHost && (
                    <span className="text-yellow-400 text-lg" title="호스트">
                      👑
                    </span>
                  )}
                </div>
              </div>

              {/* 권한 관리 버튼 (호스트 전용) */}
              {isHost && !isParticipantHost && (
                <div className="flex items-center gap-2">
                  {/* 화면 공유 권한 부여/회수 버튼 */}
                  {hasScreenSharePermission ? (
                    <button
                      type="button"
                      onClick={() => revokeScreenSharePermission(socketId)}
                      className="px-3 py-1 bg-red-500/80 hover:bg-red-600 text-white text-xs rounded-md transition-colors"
                      title="화면 공유 권한 회수"
                    >
                      권한 회수
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => grantScreenSharePermission(socketId)}
                      className="px-3 py-1 bg-green-500/80 hover:bg-green-600 text-white text-xs rounded-md transition-colors"
                      title="화면 공유 권한 부여"
                    >
                      권한 부여
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 참가자 없음 메시지 */}
      {participants.length === 0 && (
        <div className="text-center py-8">
          <p className="text-gray-400 text-sm">다른 참가자를 기다리는 중...</p>
        </div>
      )}
    </div>
  );
}
