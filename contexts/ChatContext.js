"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import logger from "@/lib/logger";
import ChatService from "@/services/ChatService";
import { useRoomContext } from "./RoomContext";

/**
 * ChatContext
 * 채팅 서비스 및 메시지 상태를 관리하는 Context
 */
const ChatContext = createContext(null);

/**
 * ChatProvider 컴포넌트
 * ChatService 인스턴스 및 채팅 상태를 관리
 */
export function ChatProvider({ children }) {
  // RoomContext에서 필요한 값 가져오기
  const { socketService, roomId, isConnected, nickname } = useRoomContext();

  // ChatService 인스턴스 (ref로 관리하여 재생성 방지)
  const chatServiceRef = useRef(null);

  // 채팅 상태
  const [messages, setMessages] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [currentUser, setCurrentUser] = useState(null);

  /**
   * ChatService 초기화 및 Socket 이벤트 리스너 설정
   */
  useEffect(() => {
    if (!socketService || !isConnected) {
      logger.warn("CHAT", "SocketService 대기 중", {
        hasSocketService: !!socketService,
        isConnected,
      });
      return;
    }

    const socketId = socketService.getSocketId();
    if (!socketId) {
      console.log("[ChatContext] Socket ID가 없습니다.");
      return;
    }

    // ChatService 인스턴스 생성 또는 업데이트
    if (!chatServiceRef.current) {
      logger.info("CHAT", "ChatService 초기화", { socketId, nickname });
      chatServiceRef.current = new ChatService(socketId, nickname);
      console.log("[ChatContext] ChatService 초기화 완료, 닉네임:", nickname);
    } else {
      // Socket ID 및 닉네임 업데이트 (재연결 시)
      chatServiceRef.current.updateCurrentUser(socketId, nickname);
      console.log("[ChatContext] ChatService 업데이트:", { socketId, nickname });
    }

    // 현재 사용자 정보 업데이트
    setCurrentUser(chatServiceRef.current.getCurrentUser());

    // 메시지 수신 이벤트 핸들러 등록
    chatServiceRef.current.onMessageReceived((message) => {
      console.log("[ChatContext] 새 메시지 수신:", message);
    });

    // Socket 이벤트 핸들러: 원격 메시지 수신
    const handleChatMessage = (data) => {
      logger.info("CHAT", "원격 메시지 수신", data);

      const { from, message } = data;
      console.log("[ChatContext] 원격 메시지 수신 from:", from);

      // 원격 메시지 생성 (isLocal: false)
      const remoteMessage = {
        ...message,
        senderId: from,
        isLocal: false,
      };

      logger.debug("CHAT", "원격 메시지 처리", remoteMessage);

      // ChatService에 메시지 추가
      chatServiceRef.current.addMessage(remoteMessage);

      // UI 업데이트
      setMessages((prevMessages) => [...prevMessages, remoteMessage]);
      setUnreadCount((prevCount) => prevCount + 1);
    };

    // Socket 이벤트 핸들러: 채팅 에러
    const handleChatError = (error) => {
      logger.error("CHAT", "서버에서 채팅 에러 수신", error);
      console.error("[ChatContext] 채팅 에러:", error);
      alert(`채팅 에러: ${error.message}`);
    };

    // Socket 이벤트 리스너 등록
    socketService.on("chat:message", handleChatMessage);
    socketService.on("chat:error", handleChatError);

    logger.info("CHAT", "Socket 이벤트 리스너 등록 완료", {
      events: ["chat:message", "chat:error"],
    });
    console.log("[ChatContext] Socket 이벤트 리스너 등록 완료");

    // 클린업 함수
    return () => {
      logger.info("CHAT", "Socket 이벤트 리스너 제거");
      console.log("[ChatContext] Socket 이벤트 리스너 제거");

      // Socket이 정리되지 않은 경우에만 이벤트 리스너 제거
      if (socketService?.socket) {
        socketService.off("chat:message", handleChatMessage);
        socketService.off("chat:error", handleChatError);
      } else {
        console.log("[ChatContext] Socket이 이미 정리되어 이벤트 리스너 제거 스킵");
      }
    };
  }, [socketService, isConnected, nickname]);

  /**
   * 닉네임 변경 시 ChatService 업데이트
   */
  useEffect(() => {
    if (chatServiceRef.current && socketService && nickname) {
      const socketId = socketService.getSocketId();
      if (socketId) {
        chatServiceRef.current.updateCurrentUser(socketId, nickname);
        setCurrentUser(chatServiceRef.current.getCurrentUser());
        console.log("[ChatContext] 닉네임 변경으로 ChatService 업데이트:", nickname);
      }
    }
  }, [nickname, socketService]);

  /**
   * 메시지 전송
   * @param {string} content - 메시지 내용
   */
  const sendMessage = useCallback(
    (content) => {
      logger.debug("CHAT", "sendMessage 호출됨", {
        content,
        roomId,
        hasSocketService: !!socketService,
      });

      if (!chatServiceRef.current || !socketService || !roomId) {
        const errorMsg = "채팅 서비스가 초기화되지 않았거나 연결되지 않았습니다.";
        logger.error("CHAT", errorMsg, {
          hasChatService: !!chatServiceRef.current,
          hasSocketService: !!socketService,
          roomId,
        });
        console.error("[ChatContext]", errorMsg);
        return;
      }

      if (!content || content.trim() === "") {
        logger.warn("CHAT", "빈 메시지 전송 시도");
        console.log("[ChatContext] 빈 메시지는 전송할 수 없습니다.");
        return;
      }

      try {
        // 로컬 메시지 생성 (isLocal: true)
        const localMessage = chatServiceRef.current.sendMessage(content);

        if (!localMessage) {
          logger.error("CHAT", "로컬 메시지 생성 실패");
          return;
        }

        logger.info("CHAT", "로컬 메시지 생성 완료", localMessage);

        // 즉시 UI에 표시 (optimistic update)
        setMessages((prevMessages) => [...prevMessages, localMessage]);

        // 서버로 전송할 데이터
        const payload = {
          roomId,
          message: {
            id: localMessage.id,
            senderId: localMessage.senderId,
            senderName: localMessage.senderName,
            content: localMessage.content,
            timestamp: localMessage.timestamp,
          },
        };

        logger.info("CHAT", "서버로 메시지 전송 시도", payload);

        // 서버로 메시지 전송
        socketService.emit("chat:message", payload);

        logger.info("CHAT", "메시지 전송 완료", { messageId: localMessage.id });
        console.log("[ChatContext] 메시지 전송 완료:", localMessage);
      } catch (error) {
        logger.error("CHAT", "메시지 전송 에러", {
          error: error.message,
          stack: error.stack,
        });
        console.error("[ChatContext] 메시지 전송 에러:", error);
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
    console.log("[ChatContext] 읽지 않은 메시지 카운트 초기화");
  }, []);

  /**
   * 컴포넌트 언마운트 시 ChatService 정리
   */
  useEffect(() => {
    return () => {
      if (chatServiceRef.current) {
        console.log("[ChatContext] ChatService 리소스 해제");
        chatServiceRef.current.destroy();
        chatServiceRef.current = null;
      }
    };
  }, []);

  const value = {
    chatService: chatServiceRef.current,
    messages,
    unreadCount,
    currentUser,
    sendMessage,
    clearUnreadCount,
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

/**
 * ChatContext를 사용하는 커스텀 훅
 * @returns {Object} ChatContext 값
 */
export function useChatContext() {
  const context = useContext(ChatContext);

  if (!context) {
    throw new Error("useChatContext는 ChatProvider 내부에서만 사용할 수 있습니다.");
  }

  return context;
}

export default ChatContext;
