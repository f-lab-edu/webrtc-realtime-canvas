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
  const [showChat, setShowChat] = useState(true); // 채팅 영역 표시 여부
  const [nickname, setNicknameState] = useState(null); // 현재 사용자 닉네임
  const [participantNicknames, setParticipantNicknames] = useState(new Map()); // socketId -> nickname 매핑

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
  const setupSocketListeners = useCallback((socketService, targetRoomId, currentNickname) => {
    // 방 참가 성공
    socketService.on("room:joined", (data) => {
      console.log("방 참가 성공:", data);
      setConnectionState("connected");
      setIsConnected(true);
      setParticipants(data.participants || []);

      // 참가자 닉네임 맵 수신 및 저장
      if (data.participantNicknames) {
        console.log("참가자 닉네임 맵 수신:", data.participantNicknames);
        const nicknamesMap = new Map(Object.entries(data.participantNicknames));
        setParticipantNicknames(nicknamesMap);
      }
    });

    // 방 정원 초과
    socketService.on("room:full", () => {
      console.error("방이 가득 찼습니다.");
      setConnectionState("disconnected");
      setIsConnected(false);
      alert("이 방은 이미 2명이 참가 중입니다.");
    });

    // 새 참가자 입장
    socketService.on("room:participant-joined", (data) => {
      const socketId = typeof data === "string" ? data : data.socketId;
      const participantNickname = typeof data === "object" ? data.nickname : null;

      console.log("새 참가자 입장:", socketId, "닉네임:", participantNickname);

      setParticipants((prev) => {
        if (!prev.includes(socketId)) {
          return [...prev, socketId];
        }
        return prev;
      });

      // 새 참가자 닉네임 저장
      if (participantNickname) {
        setParticipantNicknames((prev) => {
          const newMap = new Map(prev);
          newMap.set(socketId, participantNickname);
          return newMap;
        });
      }
    });

    // 참가자 퇴장
    socketService.on("room:participant-left", (socketId) => {
      console.log("참가자 퇴장:", socketId);
      setParticipants((prev) => prev.filter((id) => id !== socketId));

      // 퇴장한 참가자 닉네임 제거
      setParticipantNicknames((prev) => {
        const newMap = new Map(prev);
        newMap.delete(socketId);
        return newMap;
      });
    });

    // 닉네임 업데이트 이벤트 리스너
    socketService.on("user:nickname-updated", (data) => {
      console.log("닉네임 업데이트 수신:", data);
      if (data.socketId && data.nickname) {
        setParticipantNicknames((prev) => {
          const newMap = new Map(prev);
          newMap.set(data.socketId, data.nickname);
          return newMap;
        });
      }
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

      // 방 재참가 (닉네임 포함)
      if (targetRoomId) {
        socketService.emit("room:join", {
          roomId: targetRoomId,
          nickname: currentNickname || null,
        });
      }
    });
  }, []);

  /**
   * 방 참가
   * @param {string} targetRoomId - 참가할 방 ID
   * @param {string} nicknameParam - 참가 시 사용할 닉네임 (선택)
   * @returns {Promise<void>}
   */
  const joinRoom = useCallback(
    async (targetRoomId, nicknameParam = null) => {
      try {
        const socketService = socketServiceRef.current;

        // 파라미터로 전달된 닉네임을 우선 사용 (closure 문제 해결)
        const effectiveNickname = nicknameParam || nickname || null;

        // 이미 같은 방에 연결되어 있으면 무시
        if (roomId === targetRoomId && socketService.isSocketConnected()) {
          console.log("이미 방에 연결되어 있습니다:", targetRoomId);
          return;
        }

        setConnectionState("connecting");
        console.log(`방 참가 시도: ${targetRoomId}, 닉네임: ${effectiveNickname || "없음"}`);

        const serverUrl = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:3001";

        // Socket 연결
        await socketService.connect(serverUrl);

        // Socket 이벤트 리스너 등록
        setupSocketListeners(socketService, targetRoomId, effectiveNickname);

        // 방 참가 요청 (닉네임 포함)
        socketService.emit("room:join", {
          roomId: targetRoomId,
          nickname: effectiveNickname,
        });
        console.log(`방 참가 요청 전송, 닉네임: ${effectiveNickname || "없음"}`);

        setRoomId(targetRoomId);
      } catch (error) {
        console.error("방 참가 실패:", error);
        setConnectionState("disconnected");
        throw error;
      }
    },
    [setupSocketListeners, roomId, nickname]
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

  /**
   * 채팅 영역 토글
   */
  const toggleChat = useCallback(() => {
    setShowChat((prev) => !prev);
  }, []);

  /**
   * 닉네임 설정
   * @param {string} newNickname - 설정할 닉네임
   */
  const setNickname = useCallback((newNickname) => {
    console.log("닉네임 설정:", newNickname);
    setNicknameState(newNickname);

    // SocketService에도 닉네임 설정
    const socketService = socketServiceRef.current;
    if (socketService) {
      socketService.setNickname(newNickname);
    }
  }, []);

  /**
   * 참가자 닉네임 업데이트
   * @param {string} socketId - 참가자 Socket ID
   * @param {string} participantNickname - 참가자 닉네임
   */
  const updateParticipantNickname = useCallback((socketId, participantNickname) => {
    console.log(`참가자 닉네임 업데이트: ${socketId} -> ${participantNickname}`);
    setParticipantNicknames((prev) => {
      const newMap = new Map(prev);
      newMap.set(socketId, participantNickname);
      return newMap;
    });
  }, []);

  // 컴포넌트 언마운트 시 정리
  useEffect(() => {
    // 페이지 새로고침 또는 닫기 시 정리
    const handleBeforeUnload = () => {
      const socketService = socketServiceRef.current;
      if (roomId && socketService?.isSocketConnected()) {
        console.log("페이지 종료: 방 퇴장");
        socketService.emit("room:leave", roomId);
        socketService.disconnect();
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);

      const socketService = socketServiceRef.current;
      if (roomId && socketService?.isSocketConnected()) {
        console.log("RoomContext 정리: 방 퇴장");
        socketService.emit("room:leave", roomId);
        socketService.disconnect();
      }
    };
  }, [roomId]); // roomId를 의존성에 추가

  const value = {
    roomId,
    participants,
    connectionState,
    isConnected,
    showChat,
    nickname,
    participantNicknames,
    socketService: socketServiceRef.current,
    createRoom,
    joinRoom,
    leaveRoom,
    toggleChat,
    setNickname,
    updateParticipantNickname,
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
