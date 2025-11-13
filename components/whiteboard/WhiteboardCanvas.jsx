"use client";

import { useEffect, useRef } from "react";
import { useWhiteboard } from "@/contexts/WhiteboardContext";

/**
 * WhiteboardCanvas 컴포넌트
 * Fabric.js 기반 화이트보드 캔버스를 렌더링
 */
export default function WhiteboardCanvas() {
  const canvasElementRef = useRef(null);
  const { initializeWhiteboard, setCanvasSize } = useWhiteboard();
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

    // 윈도우 리사이즈 이벤트 핸들러
    const handleResize = () => {
      const newWidth = container.clientWidth;
      const newHeight = container.clientHeight;
      setCanvasSize(newWidth, newHeight);
    };

    window.addEventListener("resize", handleResize);

    // 클린업 함수
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [initializeWhiteboard, setCanvasSize]); // 의존성 배열에 함수 추가

  return (
    <div ref={containerRef} className="w-full h-full bg-white">
      {/* Fabric.js 캔버스 */}
      <canvas ref={canvasElementRef} />
    </div>
  );
}
