"use client";

/**
 * ChatMessage 컴포넌트
 * 개별 메시지 렌더링 (닉네임 기반 메시지 구분)
 *
 * 스타일링:
 * - 본인 메시지: 오른쪽 정렬, 파란색 배경, 닉네임 표시
 * - 상대방 메시지: 왼쪽 정렬, 회색 배경, 닉네임 강조 표시
 * - 시스템 메시지: 중앙 정렬, 회색 배경, 작은 폰트
 *
 * @param {Object} props
 * @param {Object} props.message - 메시지 객체
 * @param {string} props.message.id - 메시지 ID
 * @param {string} [props.message.type] - 메시지 타입 ("system" | undefined)
 * @param {string} props.message.senderId - 발신자 ID
 * @param {string} props.message.senderName - 발신자 닉네임
 * @param {string} props.message.content - 메시지 내용
 * @param {Date} props.message.timestamp - 타임스탬프
 * @param {boolean} props.message.isLocal - 본인 메시지 여부
 */
export default function ChatMessage({ message }) {
  const { type, content, timestamp, isLocal, senderName } = message;

  // 시스템 메시지 (참가자 입/퇴장 등): 중앙 정렬, 별도 스타일
  if (type === "system") {
    return (
      <div className="flex justify-center my-2">
        <span className="text-xs text-gray-400 bg-gray-800/60 px-3 py-1 rounded-full">
          {content}
        </span>
      </div>
    );
  }

  // 시간 포맷 (HH:MM)
  const formatTime = (date) => {
    return new Date(date).toLocaleTimeString("ko-KR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // isLocal 플래그 기반 스타일링 - 시각적 구분 강화
  const alignment = isLocal ? "justify-end" : "justify-start";
  const bgColor = isLocal ? "bg-blue-600 text-white shadow-md" : "bg-gray-700 text-white shadow-sm";
  const nicknameColor = isLocal ? "text-blue-100" : "text-yellow-400";

  return (
    <div className={`flex ${alignment} mb-3`}>
      <div className={`max-w-[70%] rounded-lg px-4 py-2.5 ${bgColor}`}>
        {/* 닉네임 표시 - 본인/상대방 모두 표시 */}
        <div className="flex items-center gap-2 mb-1.5">
          <p className={`text-sm font-bold ${nicknameColor}`}>{senderName || "알 수 없음"}</p>
          {isLocal && (
            <span className="text-xs bg-blue-500 px-1.5 py-0.5 rounded text-white">나</span>
          )}
        </div>

        {/* 메시지 내용 */}
        <p className="break-words whitespace-pre-wrap text-[15px] leading-relaxed">{content}</p>

        {/* 타임스탬프 */}
        <p className={`text-xs mt-1.5 text-right ${isLocal ? "text-blue-200" : "text-gray-400"}`}>
          {formatTime(timestamp)}
        </p>
      </div>
    </div>
  );
}
