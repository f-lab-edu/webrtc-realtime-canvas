"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useRoomContext } from "@/contexts";
import WhiteboardService from "@/services/WhiteboardService";

/**
 * WhiteboardContext
 * 전역 WhiteboardService 인스턴스를 관리하여 모든 컴포넌트가 동일한 캔버스를 참조
 */
const WhiteboardContext = createContext(null);

/**
 * WhiteboardProvider 컴포넌트
 * 화이트보드 초기화, 로컬 그리기 이벤트 전송, 원격 이벤트 수신 및 적용을 담당
 */
export function WhiteboardProvider({ children }) {
  // Context에서 필요한 값 가져오기
  const { socketService, roomId, isConnected, isHost } = useRoomContext();

  // WhiteboardService 인스턴스 (전역 단일 인스턴스)
  const whiteboardServiceRef = useRef(null);

  // 최초 1회만 인스턴스 생성
  if (!whiteboardServiceRef.current) {
    console.log("[WhiteboardProvider] WhiteboardService 인스턴스 생성");
    whiteboardServiceRef.current = new WhiteboardService();
  }

  // 캔버스 ref (React 컴포넌트에서 전달받음)
  const canvasRef = useRef(null);

  // 최신 값을 참조하기 위한 ref
  const socketServiceRef = useRef(socketService);
  const roomIdRef = useRef(roomId);
  const isConnectedRef = useRef(isConnected);

  // 화이트보드 상태
  const [isDrawing, setIsDrawing] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  // ref 값 업데이트
  useEffect(() => {
    socketServiceRef.current = socketService;
    roomIdRef.current = roomId;
    isConnectedRef.current = isConnected;
  }, [socketService, roomId, isConnected]);

  /**
   * 화이트보드 캔버스 초기화 (1회만 수행)
   * 그리기 모드는 별도 useEffect에서 isHost 변경 시 토글
   * @param {HTMLCanvasElement} canvasElement - HTML canvas 엘리먼트
   * @param {Object} options - 캔버스 옵션
   */
  const initializeWhiteboard = useCallback((canvasElement, options = {}) => {
    if (!canvasElement) {
      console.error("캔버스 엘리먼트가 없습니다.");
      return;
    }

    const whiteboardService = whiteboardServiceRef.current;

    // 이미 초기화된 캔버스가 있으면 스킵 (dispose/재생성 방지)
    if (whiteboardService?.canvas) {
      console.log("[initializeWhiteboard] 이미 초기화된 캔버스 존재, 스킵");
      return;
    }

    try {
      console.log("화이트보드 초기화 시작");

      console.log("[initializeWhiteboard] WhiteboardService 상태:", {
        hasService: !!whiteboardService,
        hasCanvas: false,
      });

      // 캔버스 초기화만 수행 (그리기 모드는 별도 useEffect에서 처리)
      whiteboardService.initialize(canvasElement, options);

      console.log("[initializeWhiteboard] 초기화 후 상태:", {
        hasCanvas: !!whiteboardService.canvas,
        canvasType: whiteboardService.canvas?.constructor?.name,
      });

      canvasRef.current = canvasElement;
      setIsInitialized(true);
      console.log("화이트보드 초기화 완료");
    } catch (error) {
      console.error("화이트보드 초기화 에러:", error);
    }
  }, []); // 의존성 없음 - 캔버스 초기화는 1회만

  /**
   * isHost 변경 시 그리기 모드 토글
   * 캔버스 재초기화 없이 그리기 모드만 변경
   */
  useEffect(() => {
    const whiteboardService = whiteboardServiceRef.current;

    if (!whiteboardService?.canvas || !isInitialized) {
      return;
    }

    if (isHost) {
      console.log("호스트 권한: 그리기 모드 활성화");
      // 그리기 이벤트 핸들러 등록
      whiteboardService.enableDrawing((eventData) => {
        // ref를 통해 최신 값 참조
        const currentSocketService = socketServiceRef.current;
        const currentRoomId = roomIdRef.current;
        const currentIsConnected = isConnectedRef.current;

        console.log("그리기 이벤트 핸들러 호출:", {
          hasSocketService: !!currentSocketService,
          roomId: currentRoomId,
          isConnected: currentIsConnected,
          eventType: eventData.type,
        });

        // Socket이 연결되어 있고 roomId가 있을 때만 전송
        if (currentSocketService && currentRoomId && currentIsConnected) {
          console.log("로컬 그리기 이벤트 전송:", eventData.type);
          currentSocketService.emit("whiteboard:event", {
            roomId: currentRoomId,
            event: eventData,
          });
        } else {
          console.warn("그리기 이벤트 전송 실패 - Socket 또는 방 정보 없음:", {
            hasSocketService: !!currentSocketService,
            roomId: currentRoomId,
            isConnected: currentIsConnected,
          });
        }
      });
      setIsDrawing(true);
    } else {
      console.log("비호스트: 그리기 모드 비활성화 (읽기 전용)");
      whiteboardService.disableDrawing();
      setIsDrawing(false);
    }
  }, [isHost, isInitialized]);

  /**
   * 원격 그리기 이벤트 적용
   * @param {Object} eventData - 그리기 이벤트 데이터
   */
  const applyRemoteEvent = useCallback(
    (eventData) => {
      const whiteboardService = whiteboardServiceRef.current;

      if (!whiteboardService || !isInitialized) {
        console.log("화이트보드가 초기화되지 않았습니다.");
        return;
      }

      try {
        console.log("원격 그리기 이벤트 적용:", eventData.type);
        whiteboardService.applyRemoteEvent(eventData);
      } catch (error) {
        console.error("원격 이벤트 적용 에러:", error);
      }
    },
    [isInitialized]
  );

  /**
   * 캔버스 초기화 (모든 객체 삭제)
   */
  const clearCanvas = useCallback(() => {
    const whiteboardService = whiteboardServiceRef.current;

    console.log("[clearCanvas] 호출됨:", {
      hasService: !!whiteboardService,
      hasCanvas: !!whiteboardService?.canvas,
      canvasType: whiteboardService?.canvas?.constructor?.name,
    });

    if (!whiteboardService) {
      console.error("WhiteboardService가 초기화되지 않았습니다.");
      return;
    }

    if (!whiteboardService.canvas) {
      console.error("캔버스가 초기화되지 않았습니다.", {
        service: whiteboardService,
        canvas: whiteboardService.canvas,
      });
      return;
    }

    try {
      console.log("캔버스 초기화 시작");
      whiteboardService.clear();
    } catch (error) {
      console.error("캔버스 초기화 에러:", error);
    }
  }, []);

  /**
   * 브러시 색상 변경
   * @param {string} color - 색상 값 (예: '#ff0000')
   */
  const setBrushColor = useCallback((color) => {
    const whiteboardService = whiteboardServiceRef.current;

    console.log("[setBrushColor] 호출됨:", {
      color,
      hasService: !!whiteboardService,
      hasCanvas: !!whiteboardService?.canvas,
      canvasType: whiteboardService?.canvas?.constructor?.name,
    });

    if (!whiteboardService) {
      console.error("WhiteboardService가 초기화되지 않았습니다.");
      return;
    }

    if (!whiteboardService.canvas) {
      console.error("캔버스가 초기화되지 않았습니다.", {
        service: whiteboardService,
        canvas: whiteboardService.canvas,
      });
      return;
    }

    whiteboardService.setBrushColor(color);
  }, []);

  /**
   * 브러시 두께 변경
   * @param {number} width - 브러시 두께
   */
  const setBrushWidth = useCallback((width) => {
    const whiteboardService = whiteboardServiceRef.current;

    console.log("[setBrushWidth] 호출됨:", {
      width,
      hasService: !!whiteboardService,
      hasCanvas: !!whiteboardService?.canvas,
      canvasType: whiteboardService?.canvas?.constructor?.name,
    });

    if (!whiteboardService) {
      console.error("WhiteboardService가 초기화되지 않았습니다.");
      return;
    }

    if (!whiteboardService.canvas) {
      console.error("캔버스가 초기화되지 않았습니다.", {
        service: whiteboardService,
        canvas: whiteboardService.canvas,
      });
      return;
    }

    whiteboardService.setBrushWidth(width);
  }, []);

  /**
   * 캔버스 크기 조정
   * @param {number} width - 너비
   * @param {number} height - 높이
   */
  const setCanvasSize = useCallback((width, height) => {
    const whiteboardService = whiteboardServiceRef.current;

    if (!whiteboardService) {
      console.error("WhiteboardService가 초기화되지 않았습니다.");
      return;
    }

    if (!whiteboardService.canvas) {
      console.error("캔버스가 초기화되지 않았습니다.");
      return;
    }

    whiteboardService.setCanvasSize(width, height);
  }, []);

  /**
   * Socket 이벤트 리스너 설정 (원격 그리기 이벤트 수신)
   */
  useEffect(() => {
    // Socket이 연결되지 않았으면 대기
    if (!socketService || !socketService.socket) {
      console.log(
        "[WhiteboardProvider] Socket이 아직 연결되지 않았습니다. 이벤트 리스너 등록 대기 중..."
      );
      return;
    }

    // 화이트보드가 초기화되지 않았으면 대기
    if (!isInitialized) {
      console.log(
        "[WhiteboardProvider] 화이트보드가 초기화되지 않았습니다. 이벤트 리스너 등록 대기 중..."
      );
      return;
    }

    console.log("[WhiteboardProvider] Socket 연결 및 화이트보드 초기화 완료, 이벤트 리스너 등록");

    // 원격 그리기 이벤트 수신
    const handleWhiteboardEvent = (data) => {
      console.log(
        `[WhiteboardProvider] 원격 화이트보드 이벤트 수신 from ${data.from}:`,
        data.event.type
      );

      // 자신이 보낸 이벤트는 무시 (이미 로컬에 적용됨)
      if (data.from === socketService.socket.id) {
        console.log("[WhiteboardProvider] 자신이 보낸 이벤트 무시");
        return;
      }

      applyRemoteEvent(data.event);
    };

    // 화이트보드 권한 거부 이벤트 수신
    const handleWhiteboardDenied = (data) => {
      console.warn("[WhiteboardProvider] 화이트보드 권한 거부:", data.message);
      alert(`화이트보드 권한이 거부되었습니다: ${data.message || "호스트 권한이 필요합니다."}`);

      // 비호스트 사용자의 그리기 시도를 비활성화
      const whiteboardService = whiteboardServiceRef.current;
      if (whiteboardService) {
        whiteboardService.disableDrawing();
        setIsDrawing(false);
      }
    };

    // 이벤트 리스너 등록
    socketService.on("whiteboard:event", handleWhiteboardEvent);
    socketService.on("whiteboard:denied", handleWhiteboardDenied);

    // 클린업 함수
    return () => {
      console.log("[WhiteboardProvider] 이벤트 리스너 제거");

      // Socket이 정리되지 않은 경우에만 이벤트 리스너 제거
      if (socketService?.socket) {
        socketService.off("whiteboard:event", handleWhiteboardEvent);
        socketService.off("whiteboard:denied", handleWhiteboardDenied);
      } else {
        console.log("[WhiteboardProvider] Socket이 이미 정리되어 이벤트 리스너 제거 스킵");
      }
    };
  }, [socketService, socketService?.socket, isInitialized, applyRemoteEvent]);

  /**
   * 컴포넌트 언마운트 시 화이트보드 정리
   */
  useEffect(() => {
    return () => {
      const whiteboardService = whiteboardServiceRef.current;
      if (whiteboardService) {
        console.log("WhiteboardProvider 정리: 화이트보드 리소스 해제");
        whiteboardService.destroy();
      }
    };
  }, []); // 빈 배열: 컴포넌트 언마운트 시에만 실행

  const value = {
    canvasRef,
    isDrawing,
    isInitialized,
    initializeWhiteboard,
    clearCanvas,
    setBrushColor,
    setBrushWidth,
    setCanvasSize,
  };

  return <WhiteboardContext.Provider value={value}>{children}</WhiteboardContext.Provider>;
}

/**
 * useWhiteboard 커스텀 훅
 * WhiteboardContext를 사용하여 화이트보드 기능에 접근
 */
export function useWhiteboard() {
  const context = useContext(WhiteboardContext);

  if (!context) {
    throw new Error("useWhiteboard는 WhiteboardProvider 내부에서 사용되어야 합니다.");
  }

  return context;
}
