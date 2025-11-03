"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import SocketService from "@/services/SocketService";

/**
 * RoomContext
 * 방 ID, 참가자 목록, 연결 상태를 관리하는 Context
 */
const RoomContext = createContext(null);

/**
 * RoomProvider 컴포넌트
 * 방 관련 전역 상태 및 SocketService 인스턴스를 관리
 */
export function RoomProvider({ children }) {
  // 상태 관리
  const [roomId, setRoomId] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [connectionState, setConnectionState] = useState("disconnected"); // 'connecting' | 'connected' | 'disconnected'
  const [isConnected, setIsConnected] = useState(false);

  // SocketService 인스턴스 (ref로 관리하여 재생성 방지)
  const socketServiceRef = useRef(null);

  // SocketService 인스턴스 초기화
  if (!socketServiceRef.current) {
    socketServiceRef.current = new SocketService();
  }

  /**
   * 고유한 방 ID 생성
   * @returns {string} 생성된 방 ID
   */
  const createRoom = useCallback(() => {
    // UUID v4 형식의 고유 ID 생성
    const newRoomId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    console.log("방 생성:", newRoomId);
    return newRoomId;
  }, []);

  /**
   * Socket 이벤트 리스너 설정
   * @param {SocketService} socketService
   * @param {string} targetRoomId
   */
  const setupSocketListeners = useCallback((socketService, targetRoomId) => {
    // 방 참가 성공
    socketService.on("room:joined", (data) => {
      console.log("방 참가 성공:", data);
      setConnectionState("connected");
      setIsConnected(true);
      setParticipants(data.participants || []);
    });

    // 방 정원 초과
    socketService.on("room:full", () => {
      console.error("방이 가득 찼습니다.");
      setConnectionState("disconnected");
      setIsConnected(false);
      alert("이 방은 이미 2명이 참가 중입니다.");
    });

    // 새 참가자 입장
    socketService.on("room:participant-joined", (socketId) => {
      console.log("새 참가자 입장:", socketId);
      setParticipants((prev) => {
        if (!prev.includes(socketId)) {
          return [...prev, socketId];
        }
        return prev;
      });
    });

    // 참가자 퇴장
    socketService.on("room:participant-left", (socketId) => {
      console.log("참가자 퇴장:", socketId);
      setParticipants((prev) => prev.filter((id) => id !== socketId));
    });

    // Socket 연결 해제
    socketService.socket?.on("disconnect", (reason) => {
      console.log("Socket 연결 해제:", reason);
      setConnectionState("disconnected");
      setIsConnected(false);
    });

    // Socket 재연결
    socketService.socket?.on("reconnect", () => {
      console.log("Socket 재연결 성공, 방 재참가 시도");
      setConnectionState("connecting");

      // 방 재참가
      if (targetRoomId) {
        socketService.emit("room:join", targetRoomId);
      }
    });
  }, []);

  /**
   * 방 참가
   * @param {string} targetRoomId - 참가할 방 ID
   * @returns {Promise<void>}
   */
  const joinRoom = useCallback(
    async (targetRoomId) => {
      try {
        setConnectionState("connecting");
        console.log("방 참가 시도:", targetRoomId);

        const socketService = socketServiceRef.current;
        const serverUrl = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:3001";

        // Socket 연결
        await socketService.connect(serverUrl);

        // Socket 이벤트 리스너 등록
        setupSocketListeners(socketService, targetRoomId);

        // 방 참가 요청
        socketService.emit("room:join", targetRoomId);

        setRoomId(targetRoomId);
      } catch (error) {
        console.error("방 참가 실패:", error);
        setConnectionState("disconnected");
        throw error;
      }
    },
    [setupSocketListeners]
  );

  /**
   * 방 퇴장
   */
  const leaveRoom = useCallback(() => {
    try {
      const socketService = socketServiceRef.current;

      if (roomId && socketService.isSocketConnected()) {
        console.log("방 퇴장:", roomId);
        socketService.emit("room:leave", roomId);
      }

      // Socket 연결 해제
      socketService.disconnect();

      // 상태 초기화
      setRoomId(null);
      setParticipants([]);
      setConnectionState("disconnected");
      setIsConnected(false);
    } catch (error) {
      console.error("방 퇴장 에러:", error);
    }
  }, [roomId]);

  // 컴포넌트 언마운트 시 정리
  useEffect(() => {
    return () => {
      const socketService = socketServiceRef.current;
      const currentRoomId = roomId;

      if (currentRoomId && socketService?.isSocketConnected()) {
        console.log("RoomContext 정리: 방 퇴장");
        socketService.emit("room:leave", currentRoomId);
        socketService.disconnect();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // 빈 배열로 언마운트 시에만 실행

  const value = {
    roomId,
    participants,
    connectionState,
    isConnected,
    socketService: socketServiceRef.current,
    createRoom,
    joinRoom,
    leaveRoom,
  };

  return <RoomContext.Provider value={value}>{children}</RoomContext.Provider>;
}

/**
 * RoomContext를 사용하는 커스텀 훅
 * @returns {Object} RoomContext 값
 */
export function useRoomContext() {
  const context = useContext(RoomContext);

  if (!context) {
    throw new Error("useRoomContext는 RoomProvider 내부에서만 사용할 수 있습니다.");
  }

  return context;
}

export default RoomContext;
