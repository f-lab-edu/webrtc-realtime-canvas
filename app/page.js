"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useRoomContext } from "@/contexts/RoomContext";

/**
 * 홈 페이지 컴포넌트
 * 방 생성 버튼을 제공하고 생성된 방으로 리다이렉트
 */
export default function Home() {
  const router = useRouter();
  const { createRoom } = useRoomContext();

  /**
   * 방 생성 및 리다이렉트 핸들러
   */
  const handleCreateRoom = () => {
    // 고유한 방 ID 생성
    const roomId = createRoom();
    console.log("방 생성 완료, 리다이렉트:", roomId);

    // 생성된 방 페이지로 이동
    router.push(`/room/${roomId}`);
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

        {/* 방 생성 버튼 */}
        <Button onClick={handleCreateRoom} size="lg" className="text-lg px-8 py-6">
          새 방 만들기
        </Button>

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
