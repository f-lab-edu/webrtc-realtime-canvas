"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRoomContext } from "@/contexts/RoomContext";
import logger from "@/lib/logger";
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

  /**
   * ChatService 초기화 및 Socket 이벤트 리스너 설정
   */
  useEffect(() => {
    if (!socketService || !isConnected) {
      logger.warn("CHAT", "초기화 대기 중", {
        hasSocketService: !!socketService,
        isConnected,
      });
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

    logger.info("CHAT", "ChatService 초기화 완료, Socket 이벤트 리스너 등록 시작", {
      socketId,
      isConnected: socketService.isSocketConnected(),
    });
    console.log("[useChat] ChatService 초기화 완료, Socket 이벤트 리스너 등록 시작:", {
      socketId,
      isConnected: socketService.isSocketConnected(),
    });

    // 원격 메시지 수신
    const handleChatMessage = (data) => {
      logger.info("CHAT", "원격 메시지 수신", data);

      const { from, message } = data;
      console.log("원격 메시지 수신 from:", from);

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

    // 채팅 에러 수신
    const handleChatError = (error) => {
      logger.error("CHAT", "서버에서 채팅 에러 수신", error);
      console.error("채팅 에러:", error);
      alert(`채팅 에러: ${error.message}`);
    };

    // 이벤트 리스너 등록
    socketService.on("chat:message", handleChatMessage);
    socketService.on("chat:error", handleChatError);

    logger.info("CHAT", "Socket 이벤트 리스너 등록 완료", {
      events: ["chat:message", "chat:error"],
    });
    console.log("[useChat] Socket 이벤트 리스너 등록 완료:", ["chat:message", "chat:error"]);

    // 클린업 함수
    return () => {
      logger.info("CHAT", "Socket 이벤트 리스너 제거");
      console.log("[useChat] Socket 이벤트 리스너 제거");
      socketService.off("chat:message", handleChatMessage);
      socketService.off("chat:error", handleChatError);
    };
  }, [socketService, isConnected]);

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
        console.error(errorMsg);
        return;
      }

      if (!content || content.trim() === "") {
        logger.warn("CHAT", "빈 메시지 전송 시도");
        console.warn("빈 메시지는 전송할 수 없습니다.");
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
        console.log("메시지 전송 완료:", localMessage);
      } catch (error) {
        logger.error("CHAT", "메시지 전송 에러", {
          error: error.message,
          stack: error.stack,
        });
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
   * 컴포넌트 언마운트 시 ChatService 정리
   */
  useEffect(() => {
    return () => {
      if (chatServiceRef.current) {
        console.log("useChat 정리: ChatService 리소스 해제");
        chatServiceRef.current.destroy();
        chatServiceRef.current = null;
      }
    };
  }, []);

  return {
    messages,
    unreadCount,
    currentUser,
    sendMessage,
    clearUnreadCount,
  };
}

export default useChat;
