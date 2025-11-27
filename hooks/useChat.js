"use client";

import { useChatContext } from "@/contexts/ChatContext";

/**
 * useChat 커스텀 훅 (단순화 버전)
 * ChatContext를 소비하여 채팅 기능 제공
 *
 * 이전에는 useChat이 직접 ChatService를 생성하고 관리했으나,
 * 이제는 ChatContext가 ChatService 인스턴스를 소유하고 관리함
 * (RoomContext, MediaContext, WhiteboardContext 패턴과 일관성 유지)
 */
function useChat() {
  // ChatContext에서 모든 채팅 상태 및 함수 가져오기
  const { messages, unreadCount, currentUser, sendMessage, clearUnreadCount } = useChatContext();

  // ChatContext에서 제공하는 값을 그대로 반환
  return {
    messages,
    unreadCount,
    currentUser,
    sendMessage,
    clearUnreadCount,
  };
}

export default useChat;
