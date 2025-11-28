"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * 홈 페이지 컴포넌트
 * 방 이름 입력을 통해 방 입장 (방이 없으면 자동 생성)
 */
export default function Home() {
  const router = useRouter();
  const [roomName, setRoomName] = useState("");
  const [error, setError] = useState("");

  /**
   * 방 이름을 URL-safe 형식으로 변환
   * - 공백 → 하이픈
   * - 대문자 → 소문자
   * - 특수문자 제거 (영문 소문자, 숫자, 하이픈만 허용)
   * - 연속 하이픈 → 단일 하이픈
   * - 앞뒤 하이픈 제거
   */
  const sanitizeRoomName = (name) => {
    return name
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-") // 공백 → 하이픈
      .replace(/[^a-z0-9-]/g, "") // 영문 소문자, 숫자, 하이픈만
      .replace(/^-+|-+$/g, "") // 앞뒤 하이픈 제거
      .replace(/-+/g, "-") // 연속 하이픈을 하나로
      .substring(0, 50); // 최대 50자
  };

  /**
   * 방 입장 핸들러
   */
  const handleJoinRoom = () => {
    setError("");
    const sanitized = sanitizeRoomName(roomName);

    if (sanitized.length < 3) {
      setError("방 이름은 최소 3자 이상이어야 합니다 (영문 소문자, 숫자, 하이픈만 가능)");
      return;
    }

    console.log(`방 입장: ${sanitized}`);
    router.push(`/room/${sanitized}`);
  };

  /**
   * Enter 키 입력 핸들러
   */
  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      handleJoinRoom();
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24 bg-gradient-to-b from-background to-muted">
      <div className="flex flex-col items-center space-y-8 text-center">
        {/* 타이틀 */}
        <div className="space-y-4">
          <h1 className="text-5xl font-bold tracking-tight">WebRTC 1:1 Communication</h1>
          <p className="text-xl text-muted-foreground max-w-2xl">
            실시간 화상 통화와 화이트보드 협업을 시작하세요
          </p>
        </div>

        {/* 방 입장 폼 */}
        <div className="w-full max-w-md space-y-4">
          <div className="space-y-2">
            <label htmlFor="roomName" className="text-sm font-medium text-muted-foreground">
              방 이름 입력
            </label>
            <input
              id="roomName"
              type="text"
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="my-meeting"
              className="w-full px-4 py-3 rounded-lg border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <p className="text-xs text-muted-foreground">
              💡 영문 소문자, 숫자, 하이픈만 사용 가능합니다
            </p>
          </div>

          <Button onClick={handleJoinRoom} size="lg" className="w-full text-lg py-6">
            방 입장하기
          </Button>
        </div>

        {/* 기능 설명 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12 max-w-4xl">
          <div className="p-6 rounded-lg border bg-card">
            <h3 className="font-semibold mb-2">🎥 화상 통화</h3>
            <p className="text-sm text-muted-foreground">1:1 실시간 비디오 및 오디오 통화</p>
          </div>
          <div className="p-6 rounded-lg border bg-card">
            <h3 className="font-semibold mb-2">🖥️ 화면 공유</h3>
            <p className="text-sm text-muted-foreground">화면을 공유하여 협업하세요</p>
          </div>
          <div className="p-6 rounded-lg border bg-card">
            <h3 className="font-semibold mb-2">✏️ 화이트보드</h3>
            <p className="text-sm text-muted-foreground">실시간 동기화되는 공유 캔버스</p>
          </div>
        </div>
      </div>
    </main>
  );
}
