"use client";

/**
 * ChatMessage 컴포넌트
 * 개별 메시지 렌더링 (하이브리드 메시지 구분 방식)
 *
 * 스타일링:
 * - 로컬 메시지: 오른쪽 정렬, 파란색 배경
 * - 원격 메시지: 왼쪽 정렬, 회색 배경, 발신자 이름 표시
 *
 * @param {Object} props
 * @param {Object} props.message - 메시지 객체
 * @param {string} props.message.id - 메시지 ID
 * @param {string} props.message.senderId - 발신자 ID
 * @param {string} props.message.senderName - 발신자 이름
 * @param {string} props.message.content - 메시지 내용
 * @param {Date} props.message.timestamp - 타임스탬프
 * @param {boolean} props.message.isLocal - 로컬 메시지 여부
 */
export default function ChatMessage({ message }) {
  const { content, timestamp, isLocal, senderName } = message;

  // 시간 포맷 (HH:MM)
  const formatTime = (date) => {
    return new Date(date).toLocaleTimeString("ko-KR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // isLocal 플래그 기반 스타일링
  const alignment = isLocal ? "justify-end" : "justify-start";
  const bgColor = isLocal ? "bg-blue-500 text-white" : "bg-gray-700 text-white";

  return (
    <div className={`flex ${alignment} mb-2`}>
      <div className={`max-w-[70%] rounded-lg px-4 py-2 ${bgColor}`}>
        {/* 원격 메시지만 발신자 이름 표시 */}
        {!isLocal && (
          <p className="text-xs text-gray-300 mb-1 font-semibold">{senderName}</p>
        )}

        {/* 메시지 내용 */}
        <p className="break-words whitespace-pre-wrap">{content}</p>

        {/* 타임스탬프 */}
        <p className={`text-xs mt-1 text-right ${isLocal ? "opacity-70" : "text-gray-400"}`}>
          {formatTime(timestamp)}
        </p>
      </div>
    </div>
  );
}
