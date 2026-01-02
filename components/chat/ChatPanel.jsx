"use client";

import { useEffect, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import ChatInput from "./ChatInput";
import ChatMessage from "./ChatMessage";

/**
 * ChatPanel 컴포넌트
 * 채팅 메시지 목록 표시, 자동 스크롤, 읽지 않은 메시지 배지 표시
 *
 * @param {Object} props
 * @param {Array} props.messages - 메시지 배열
 * @param {number} props.unreadCount - 읽지 않은 메시지 카운트
 * @param {Function} props.onSendMessage - 메시지 전송 함수
 * @param {Function} props.onClearUnread - 읽지 않은 메시지 카운트 초기화 함수
 */
export default function ChatPanel({
  messages = [],
  unreadCount = 0,
  onSendMessage,
  onClearUnread,
}) {
  // 스크롤 영역 ref
  const scrollAreaRef = useRef(null);
  const messagesEndRef = useRef(null);

  /**
   * 새 메시지 수신 시 자동 스크롤
   */
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  });

  /**
   * 채팅 패널이 열릴 때 읽지 않은 메시지 카운트 초기화
   */
  useEffect(() => {
    if (onClearUnread) {
      onClearUnread();
    }
  }, [onClearUnread]);

  return (
    <div className="flex flex-col w-full h-full bg-gray-900">
      {/* 헤더 */}
      <div className="flex-none flex items-center justify-between p-4 border-b border-gray-700">
        <h2 className="text-lg font-semibold text-white">채팅</h2>
        {unreadCount > 0 && (
          <Badge variant="destructive" className="ml-2">
            {unreadCount}
          </Badge>
        )}
      </div>

      {/* 메시지 목록 */}
      <div
        className="flex-1 min-h-0 overflow-y-auto p-4"
        ref={scrollAreaRef}
        style={{
          scrollbarWidth: "thin",
          scrollbarColor: "#374151 #111827",
        }}
      >
        <div className="space-y-3">
          {messages.length === 0 ? (
            <div className="text-center text-gray-400 py-8">
              <p>아직 메시지가 없습니다.</p>
              <p className="text-sm mt-2">첫 메시지를 보내보세요!</p>
            </div>
          ) : (
            messages.map((message) => <ChatMessage key={message.id} message={message} />)
          )}

          {/* 자동 스크롤을 위한 더미 엘리먼트 */}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* 메시지 입력 */}
      <div className="flex-none p-4 border-t border-gray-700">
        <ChatInput onSendMessage={onSendMessage} />
      </div>
    </div>
  );
}
