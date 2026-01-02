"use client";

import { useState } from "react";
import * as button from "@/components/ui/button";
import * as input from "@/components/ui/input";

/**
 * ChatInput 컴포넌트
 * 메시지 입력 필드 및 전송 버튼
 *
 * @param {Object} props
 * @param {Function} props.onSendMessage - 메시지 전송 함수
 */
export default function ChatInput({ onSendMessage }) {
  const [message, setMessage] = useState("");

  /**
   * 메시지 전송 핸들러
   */
  const handleSend = () => {
    if (!message.trim()) {
      return;
    }

    // 메시지 전송
    if (onSendMessage) {
      onSendMessage(message);
    }

    // 입력 필드 초기화
    setMessage("");
  };

  /**
   * Enter 키 입력 핸들러
   */
  const handleKeyPress = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  /**
   * 입력 변경 핸들러
   */
  const handleChange = (e) => {
    setMessage(e.target.value);
  };

  return (
    <div className="flex items-center gap-2">
      {/* 메시지 입력 필드 */}
      <input.Input
        type="text"
        placeholder="메시지를 입력하세요..."
        value={message}
        onChange={handleChange}
        onKeyPress={handleKeyPress}
        className="flex-1 bg-gray-800 border-gray-700 text-white placeholder-gray-400 focus:border-blue-500"
      />

      {/* 전송 버튼 */}
      <button.Button
        onClick={handleSend}
        disabled={!message.trim()}
        className="bg-blue-500 hover:bg-blue-600 disabled:bg-gray-700 disabled:text-gray-500"
      >
        전송
      </button.Button>
    </div>
  );
}
