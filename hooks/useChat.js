"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRoomContext } from "@/contexts/RoomContext";
import ChatService from "@/services/ChatService";

/**
 * useChat 커스텀 훅
 * 채팅 메시지 관리, 송수신, 읽지 않은 메시지 카운트 관리를 담당
 *
 * 하이브리드 메시지 구분 방식:
 * - 로컬 메시지: isLocal: true로 즉시 UI에 표시
 * - 원격 메시지: isLocal: false로 수신 시 표시
 */
function useChat() {
  // Context에서 필요한 값 가져오기
  const { socketService, roomId, isConnected } = useRoomContext();

  // ChatService 인스턴스 (ref로 관리)
  const chatServiceRef = useRef(null);

  // 채팅 상태
  const [messages, setMessages] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [currentUser, setCurrentUser] = useState(null);
  const [isTyping, setIsTyping] = useState(false); // 상대방 타이핑 상태 (선택적)

  // 타이핑 타이머 ref (선택적)
  const typingTimerRef = useRef(null);

  /**
   * ChatService 초기화
   */
  useEffect(() => {
    if (!socketService || !isConnected) {
      return;
    }

    const socketId = socketService.getSocketId();
    if (!socketId) {
      console.warn("Socket ID가 없습니다.");
      return;
    }

    // ChatService 인스턴스 생성 또는 업데이트
    if (!chatServiceRef.current) {
      chatServiceRef.current = new ChatService(socketId);
      console.log("ChatService 초기화 완료");
    } else {
      // Socket ID 업데이트 (재연결 시)
      chatServiceRef.current.updateCurrentUser(socketId);
    }

    // 현재 사용자 정보 업데이트
    setCurrentUser(chatServiceRef.current.getCurrentUser());

    // 메시지 수신 이벤트 핸들러 등록
    chatServiceRef.current.onMessageReceived((message) => {
      console.log("새 메시지 수신:", message);
      // 메시지 상태 업데이트는 addMessage에서 처리됨
    });
  }, [socketService, isConnected]);

  /**
   * 메시지 전송
   * @param {string} content - 메시지 내용
   */
  const sendMessage = useCallback(
    (content) => {
      if (!chatServiceRef.current || !socketService || !roomId) {
        console.error("채팅 서비스가 초기화되지 않았거나 연결되지 않았습니다.");
        return;
      }

      if (!content || content.trim() === "") {
        console.warn("빈 메시지는 전송할 수 없습니다.");
        return;
      }

      try {
        // 로컬 메시지 생성 (isLocal: true)
        const localMessage = chatServiceRef.current.sendMessage(content);

        if (!localMessage) {
          return;
        }

        // 즉시 UI에 표시 (optimistic update)
        setMessages((prevMessages) => [...prevMessages, localMessage]);

        // 서버로 메시지 전송
        socketService.emit("chat:message", {
          roomId,
          message: {
            id: localMessage.id,
            senderId: localMessage.senderId,
            senderName: localMessage.senderName,
            content: localMessage.content,
            timestamp: localMessage.timestamp,
          },
        });

        console.log("메시지 전송 완료:", localMessage);
      } catch (error) {
        console.error("메시지 전송 에러:", error);
      }
    },
    [socketService, roomId]
  );

  /**
   * 읽지 않은 메시지 카운트 초기화
   */
  const clearUnreadCount = useCallback(() => {
    if (!chatServiceRef.current) {
      return;
    }

    chatServiceRef.current.clearUnreadCount();
    setUnreadCount(0);
    console.log("읽지 않은 메시지 카운트 초기화");
  }, []);

  /**
   * 타이핑 상태 전송 (선택적)
   * @param {boolean} typing - 타이핑 중 여부
   */
  const sendTypingStatus = useCallback(
    (typing) => {
      if (!socketService || !roomId) {
        return;
      }

      socketService.emit("chat:typing", {
        roomId,
        isTyping: typing,
      });
    },
    [socketService, roomId]
  );

  /**
   * 타이핑 시작 (선택적)
   */
  const startTyping = useCallback(() => {
    // 타이핑 타이머가 이미 있으면 초기화
    if (typingTimerRef.current) {
      clearTimeout(typingTimerRef.current);
    }

    // 타이핑 상태 전송
    sendTypingStatus(true);

    // 3초 후 자동으로 타이핑 중지
    typingTimerRef.current = setTimeout(() => {
      sendTypingStatus(false);
    }, 3000);
  }, [sendTypingStatus]);

  /**
   * 타이핑 중지 (선택적)
   */
  const stopTyping = useCallback(() => {
    if (typingTimerRef.current) {
      clearTimeout(typingTimerRef.current);
      typingTimerRef.current = null;
    }

    sendTypingStatus(false);
  }, [sendTypingStatus]);

  /**
   * Socket 이벤트 리스너 설정
   */
  useEffect(() => {
    if (!socketService || !chatServiceRef.current) {
      return;
    }

    // 원격 메시지 수신
    const handleChatMessage = (data) => {
      const { from, message } = data;
      console.log("원격 메시지 수신 from:", from);

      // 원격 메시지 생성 (isLocal: false)
      const remoteMessage = {
        ...message,
        senderId: from,
        isLocal: false,
      };

      // ChatService에 메시지 추가
      chatServiceRef.current.addMessage(remoteMessage);

      // UI 업데이트
      setMessages((prevMessages) => [...prevMessages, remoteMessage]);
      setUnreadCount((prevCount) => prevCount + 1);
    };

    // 타이핑 상태 수신 (선택적)
    const handleChatTyping = (data) => {
      const { from, isTyping: typing } = data;
      console.log(`타이핑 상태 수신 from ${from}:`, typing);
      setIsTyping(typing);

      // 타이핑 상태가 true이면 3초 후 자동으로 false로 변경
      if (typing) {
        setTimeout(() => {
          setIsTyping(false);
        }, 3000);
      }
    };

    // 이벤트 리스너 등록
    socketService.on("chat:message", handleChatMessage);
    socketService.on("chat:typing", handleChatTyping);

    // 클린업 함수
    return () => {
      socketService.off("chat:message", handleChatMessage);
      socketService.off("chat:typing", handleChatTyping);
    };
  }, [socketService]);

  /**
   * 컴포넌트 언마운트 시 ChatService 정리
   */
  useEffect(() => {
    return () => {
      if (chatServiceRef.current) {
        console.log("useChat 정리: ChatService 리소스 해제");
        chatServiceRef.current.destroy();
        chatServiceRef.current = null;
      }

      // 타이핑 타이머 정리
      if (typingTimerRef.current) {
        clearTimeout(typingTimerRef.current);
      }
    };
  }, []);

  return {
    messages,
    unreadCount,
    currentUser,
    isTyping,
    sendMessage,
    clearUnreadCount,
    startTyping, // 선택적
    stopTyping, // 선택적
  };
}

export default useChat;
