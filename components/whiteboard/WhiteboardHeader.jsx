"use client";

import { useRoomContext } from "@/contexts";

/**
 * WhiteboardHeader 컴포넌트
 * 화이트보드 제어 중인 사용자 표시
 * - 호스트: "👑 내가 제어 중" 표시
 * - 비호스트: "👁️ {호스트닉네임}님이 제어 중" 표시
 */
export default function WhiteboardHeader() {
  const { isHost, participantNicknames, hostSocketId } = useRoomContext();

  // 호스트 닉네임 가져오기
  const hostNickname = hostSocketId ? participantNicknames.get(hostSocketId) : null;

  return (
    <div className="flex items-center justify-between p-3 bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-blue-200">
      {/* 제어 상태 표시 */}
      <div className="flex items-center gap-2">
        {isHost ? (
          <>
            <span className="text-xl">👑</span>
            <span className="text-sm font-semibold text-blue-900">내가 제어 중</span>
          </>
        ) : (
          <>
            <span className="text-xl">👁️</span>
            <span className="text-sm font-medium text-gray-700">
              {hostNickname || "호스트"}님이 제어 중
            </span>
          </>
        )}
      </div>

      {/* 화이트보드 제목 */}
      <div className="text-sm font-medium text-gray-600">실시간 협업 화이트보드</div>
    </div>
  );
}
