"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRoomContext } from "@/contexts/RoomContext";
import WhiteboardService from "@/services/WhiteboardService";

/**
 * useWhiteboard 커스텀 훅
 * 화이트보드 초기화, 로컬 그리기 이벤트 전송, 원격 이벤트 수신 및 적용을 담당
 */
function useWhiteboard() {
  // Context에서 필요한 값 가져오기
  const { socketService, roomId, isConnected } = useRoomContext();

  // WhiteboardService 인스턴스 (ref로 관리)
  const whiteboardServiceRef = useRef(null);

  // 캔버스 ref (React 컴포넌트에서 전달받음)
  const canvasRef = useRef(null);

  // 화이트보드 상태
  const [isDrawing, setIsDrawing] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  // WhiteboardService 인스턴스 초기화
  if (!whiteboardServiceRef.current) {
    whiteboardServiceRef.current = new WhiteboardService();
  }

  /**
   * 화이트보드 캔버스 초기화
   * @param {HTMLCanvasElement} canvasElement - HTML canvas 엘리먼트
   * @param {Object} options - 캔버스 옵션
   */
  const initializeWhiteboard = useCallback(
    (canvasElement, options = {}) => {
      if (!canvasElement) {
        console.error("캔버스 엘리먼트가 없습니다.");
        return;
      }

      try {
        console.log("화이트보드 초기화 시작");
        const whiteboardService = whiteboardServiceRef.current;

        // 캔버스 초기화 (중복 초기화 방지는 WhiteboardService에서 처리)
        whiteboardService.initialize(canvasElement, options);

        // 그리기 이벤트 핸들러 등록
        whiteboardService.enableDrawing((eventData) => {
          // Socket이 연결되어 있고 roomId가 있을 때만 전송
          if (socketService && roomId && isConnected) {
            console.log("로컬 그리기 이벤트 전송:", eventData.type);
            socketService.emit("whiteboard:event", {
              roomId,
              event: eventData,
            });
          }
        });

        canvasRef.current = canvasElement;
        setIsInitialized(true);
        setIsDrawing(true);
        console.log("화이트보드 초기화 완료");
      } catch (error) {
        console.error("화이트보드 초기화 에러:", error);
      }
    },
    [socketService, roomId, isConnected]
  );

  /**
   * 원격 그리기 이벤트 적용
   * @param {Object} eventData - 그리기 이벤트 데이터
   */
  const applyRemoteEvent = useCallback(
    (eventData) => {
      const whiteboardService = whiteboardServiceRef.current;

      if (!whiteboardService || !isInitialized) {
        console.warn("화이트보드가 초기화되지 않았습니다.");
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

    if (!whiteboardService || !isInitialized) {
      console.warn("화이트보드가 초기화되지 않았습니다.");
      return;
    }

    try {
      console.log("캔버스 초기화");
      whiteboardService.clear();
    } catch (error) {
      console.error("캔버스 초기화 에러:", error);
    }
  }, [isInitialized]);

  /**
   * 브러시 색상 변경
   * @param {string} color - 색상 값 (예: '#ff0000')
   */
  const setBrushColor = useCallback(
    (color) => {
      const whiteboardService = whiteboardServiceRef.current;

      if (!whiteboardService || !isInitialized) {
        console.warn("화이트보드가 초기화되지 않았습니다.");
        return;
      }

      whiteboardService.setBrushColor(color);
    },
    [isInitialized]
  );

  /**
   * 브러시 두께 변경
   * @param {number} width - 브러시 두께
   */
  const setBrushWidth = useCallback(
    (width) => {
      const whiteboardService = whiteboardServiceRef.current;

      if (!whiteboardService || !isInitialized) {
        console.warn("화이트보드가 초기화되지 않았습니다.");
        return;
      }

      whiteboardService.setBrushWidth(width);
    },
    [isInitialized]
  );

  /**
   * 캔버스 크기 조정
   * @param {number} width - 너비
   * @param {number} height - 높이
   */
  const setCanvasSize = useCallback(
    (width, height) => {
      const whiteboardService = whiteboardServiceRef.current;

      if (!whiteboardService || !isInitialized) {
        console.warn("화이트보드가 초기화되지 않았습니다.");
        return;
      }

      whiteboardService.setCanvasSize(width, height);
    },
    [isInitialized]
  );

  /**
   * Socket 이벤트 리스너 설정 (원격 그리기 이벤트 수신)
   */
  useEffect(() => {
    if (!socketService || !isInitialized) {
      return;
    }

    // 원격 그리기 이벤트 수신
    const handleWhiteboardEvent = (data) => {
      console.log("원격 화이트보드 이벤트 수신:", data.event.type);
      applyRemoteEvent(data.event);
    };

    // 이벤트 리스너 등록
    socketService.on("whiteboard:event", handleWhiteboardEvent);

    // 클린업 함수
    return () => {
      socketService.off("whiteboard:event", handleWhiteboardEvent);
    };
  }, [socketService, isInitialized, applyRemoteEvent]);

  /**
   * 컴포넌트 언마운트 시 화이트보드 정리
   */
  useEffect(() => {
    return () => {
      const whiteboardService = whiteboardServiceRef.current;
      if (whiteboardService && isInitialized) {
        console.log("useWhiteboard 정리: 화이트보드 리소스 해제");
        whiteboardService.destroy();
        setIsInitialized(false);
      }
    };
  }, [isInitialized]);

  return {
    canvasRef,
    isDrawing,
    isInitialized,
    initializeWhiteboard,
    clearCanvas,
    setBrushColor,
    setBrushWidth,
    setCanvasSize,
  };
}

export default useWhiteboard;
