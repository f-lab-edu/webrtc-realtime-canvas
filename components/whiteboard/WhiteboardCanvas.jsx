"use client";

import { useEffect, useRef } from "react";
import { useRoomContext } from "@/contexts/RoomContext";
import { useWhiteboard } from "@/contexts/WhiteboardContext";

/**
 * WhiteboardCanvas 컴포넌트
 * Fabric.js 기반 화이트보드 캔버스를 렌더링
 * 호스트: cursor: crosshair (그리기 가능)
 * 비호스트: cursor: default + pointer-events: none (읽기 전용)
 */
export default function WhiteboardCanvas() {
  const canvasElementRef = useRef(null);
  const { initializeWhiteboard, setCanvasSize } = useWhiteboard();
  const { isHost } = useRoomContext();
  const containerRef = useRef(null);

  /**
   * 캔버스 초기화
   */
  useEffect(() => {
    const canvasElement = canvasElementRef.current;
    const container = containerRef.current;

    if (!canvasElement || !container) {
      return;
    }

    // 컨테이너 크기에 맞춰 캔버스 크기 설정
    const width = container.clientWidth;
    const height = container.clientHeight;

    // 캔버스 엘리먼트 크기 설정
    canvasElement.width = width;
    canvasElement.height = height;

    // Fabric.js 캔버스 초기화 (한 번만 실행)
    initializeWhiteboard(canvasElement, {
      width,
      height,
    });

    // ResizeObserver로 container 크기 변화 감지
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        // contentRect는 padding을 제외한 실제 콘텐츠 영역
        const { width: newWidth, height: newHeight } = entry.contentRect;

        // 크기가 실제로 변경된 경우에만 업데이트 (0보다 큰 값만)
        if (newWidth > 0 && newHeight > 0) {
          console.log(`[WhiteboardCanvas] 컨테이너 크기 변경 감지: ${newWidth}x${newHeight}`);
          setCanvasSize(newWidth, newHeight);
        }
      }
    });

    // container 관찰 시작
    resizeObserver.observe(container);

    // 클린업 함수: ResizeObserver 연결 해제
    return () => {
      resizeObserver.disconnect();
    };
  }, [initializeWhiteboard, setCanvasSize]); // 의존성 배열에 함수 추가

  return (
    <div ref={containerRef} className="w-full h-full bg-white">
      {/* Fabric.js 캔버스 */}
      <canvas
        ref={canvasElementRef}
        style={{
          cursor: isHost ? "crosshair" : "default",
          pointerEvents: isHost ? "auto" : "none",
        }}
      />
    </div>
  );
}
