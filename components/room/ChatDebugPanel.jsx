"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import logger from "@/lib/logger";

/**
 * ChatDebugPanel 컴포넌트
 * 채팅 관련 디버그 로그를 실시간으로 표시하고 다운로드 기능 제공
 */
export default function ChatDebugPanel() {
  const [logs, setLogs] = useState([]);
  const [filter, setFilter] = useState("all"); // 'all', 'error', 'warn', 'info', 'debug'
  const [isVisible, setIsVisible] = useState(false);

  /**
   * 로그 업데이트 (1초마다)
   */
  useEffect(() => {
    const updateLogs = () => {
      const allLogs = logger.getLogs();

      // 채팅 관련 로그만 필터링
      const chatLogs = allLogs.filter(
        (log) => log.category === "CHAT" || log.category === "SOCKET"
      );

      setLogs(chatLogs);
    };

    // 초기 로드
    updateLogs();

    // 1초마다 업데이트
    const interval = setInterval(updateLogs, 1000);

    return () => clearInterval(interval);
  }, []);

  /**
   * 필터링된 로그 반환
   */
  const getFilteredLogs = () => {
    if (filter === "all") {
      return logs;
    }
    return logs.filter((log) => log.level === filter);
  };

  /**
   * 로그 레벨별 색상
   */
  const getLevelColor = (level) => {
    switch (level) {
      case "error":
        return "text-red-400";
      case "warn":
        return "text-yellow-400";
      case "info":
        return "text-blue-400";
      case "debug":
        return "text-gray-400";
      default:
        return "text-white";
    }
  };

  /**
   * 로그 다운로드
   */
  const handleDownload = () => {
    logger.downloadLogs();
  };

  /**
   * 로그 초기화
   */
  const handleClear = () => {
    if (confirm("모든 로그를 삭제하시겠습니까?")) {
      logger.clearLogs();
      setLogs([]);
    }
  };

  if (!isVisible) {
    return (
      <button
        type="button"
        onClick={() => setIsVisible(true)}
        className="fixed bottom-20 left-4 bg-purple-600 text-white px-3 py-2 rounded-lg text-xs hover:bg-purple-700 z-50"
      >
        📊 채팅 디버그
      </button>
    );
  }

  const filteredLogs = getFilteredLogs();

  return (
    <div className="fixed bottom-20 left-4 w-[600px] h-[400px] bg-gray-900 border border-gray-700 rounded-lg shadow-xl z-50 flex flex-col">
      {/* 헤더 */}
      <div className="flex items-center justify-between p-3 border-b border-gray-700">
        <h3 className="text-white font-semibold">채팅 디버그 로그</h3>
        <button
          type="button"
          onClick={() => setIsVisible(false)}
          className="text-gray-400 hover:text-white"
        >
          ✕
        </button>
      </div>

      {/* 필터 및 액션 버튼 */}
      <div className="flex items-center gap-2 p-3 border-b border-gray-700">
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="bg-gray-800 text-white text-xs px-2 py-1 rounded border border-gray-600"
        >
          <option value="all">전체</option>
          <option value="error">에러</option>
          <option value="warn">경고</option>
          <option value="info">정보</option>
          <option value="debug">디버그</option>
        </select>

        <Button onClick={handleDownload} size="sm" variant="outline" className="text-xs">
          💾 다운로드
        </Button>

        <Button onClick={handleClear} size="sm" variant="outline" className="text-xs">
          🗑️ 초기화
        </Button>

        <span className="text-gray-400 text-xs ml-auto">총 {filteredLogs.length}개 로그</span>
      </div>

      {/* 로그 목록 */}
      <ScrollArea className="flex-1 p-3">
        <div className="space-y-2">
          {filteredLogs.length === 0 ? (
            <p className="text-gray-500 text-sm">로그가 없습니다.</p>
          ) : (
            filteredLogs.map((log) => (
              <div
                key={`${log.timestamp}-${log.message}`}
                className="bg-gray-800 p-2 rounded text-xs font-mono border border-gray-700"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-gray-500">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </span>
                  <span className={`font-semibold ${getLevelColor(log.level)}`}>
                    [{log.level.toUpperCase()}]
                  </span>
                  <span className="text-purple-400">[{log.category}]</span>
                </div>
                <div className="text-white mb-1">{log.message}</div>
                {log.data && (
                  <pre className="text-gray-400 text-xs overflow-x-auto">
                    {JSON.stringify(log.data, null, 2)}
                  </pre>
                )}
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
