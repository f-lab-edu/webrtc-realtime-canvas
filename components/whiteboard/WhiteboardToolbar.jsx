"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useRoomContext, useWhiteboard } from "@/contexts";

/**
 * WhiteboardToolbar 컴포넌트
 * 브러시 색상, 두께 조절, 캔버스 초기화 기능 제공
 * 호스트만 제어 가능, 비호스트는 읽기 전용 안내 메시지 표시
 */
export default function WhiteboardToolbar() {
  const { clearCanvas, setBrushColor, setBrushWidth } = useWhiteboard();
  const { isHost } = useRoomContext();

  // 브러시 설정 상태
  const [selectedColor, setSelectedColor] = useState("#000000");
  const [selectedWidth, setSelectedWidth] = useState(2);

  // 사용 가능한 색상 팔레트
  const colors = [
    { name: "검정", value: "#000000" },
    { name: "빨강", value: "#ef4444" },
    { name: "파랑", value: "#3b82f6" },
    { name: "초록", value: "#22c55e" },
    { name: "노랑", value: "#eab308" },
    { name: "보라", value: "#a855f7" },
  ];

  // 브러시 두께 옵션
  const widths = [
    { name: "얇게", value: 2 },
    { name: "보통", value: 5 },
    { name: "굵게", value: 10 },
  ];

  /**
   * 색상 변경 핸들러
   */
  const handleColorChange = (color) => {
    setSelectedColor(color);
    setBrushColor(color);
    console.log("브러시 색상 변경:", color);
  };

  /**
   * 두께 변경 핸들러
   */
  const handleWidthChange = (width) => {
    setSelectedWidth(width);
    setBrushWidth(width);
    console.log("브러시 두께 변경:", width);
  };

  /**
   * 캔버스 초기화 핸들러
   */
  const handleClear = () => {
    if (confirm("화이트보드를 초기화하시겠습니까?")) {
      clearCanvas();
      console.log("캔버스 초기화");
    }
  };

  // 비호스트: 읽기 전용 안내 메시지 표시
  if (!isHost) {
    return (
      <div className="flex items-center justify-center p-4 bg-gray-100 border-b">
        <div className="flex items-center gap-2 text-gray-600">
          <span className="text-lg">🔒</span>
          <span className="text-sm font-medium">호스트만 화이트보드를 제어할 수 있습니다</span>
        </div>
      </div>
    );
  }

  // 호스트: 브러시 색상, 두께, 지우기 버튼 활성화
  return (
    <div className="flex items-center gap-4 p-4 bg-gray-100 border-b">
      {/* 색상 선택 */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-gray-700">색상:</span>
        <div className="flex gap-2">
          {colors.map((color) => (
            <button
              key={color.value}
              type="button"
              onClick={() => handleColorChange(color.value)}
              className={`w-8 h-8 rounded-full border-2 transition-all ${
                selectedColor === color.value
                  ? "border-gray-900 scale-110"
                  : "border-gray-300 hover:scale-105"
              }`}
              style={{ backgroundColor: color.value }}
              title={color.name}
            />
          ))}
        </div>
      </div>

      {/* 구분선 */}
      <div className="w-px h-8 bg-gray-300" />

      {/* 두께 선택 */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-gray-700">두께:</span>
        <div className="flex gap-2">
          {widths.map((width) => (
            <Button
              key={width.value}
              variant={selectedWidth === width.value ? "default" : "outline"}
              size="sm"
              onClick={() => handleWidthChange(width.value)}
            >
              {width.name}
            </Button>
          ))}
        </div>
      </div>

      {/* 구분선 */}
      <div className="w-px h-8 bg-gray-300" />

      {/* 캔버스 초기화 버튼 */}
      <Button variant="destructive" size="sm" onClick={handleClear}>
        🗑️ 초기화
      </Button>
    </div>
  );
}
