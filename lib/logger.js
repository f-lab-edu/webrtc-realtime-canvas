/**
 * 클라이언트 로거 유틸리티
 * 브라우저 콘솔과 로컬 스토리지에 로그를 저장하여 디버깅 지원
 */

class Logger {
  constructor() {
    this.logs = [];
    this.maxLogs = 500; // 최대 로그 개수
    this.storageKey = "app_debug_logs";
    this.enabled = true;
    this.isBrowser = typeof window !== "undefined";

    // 브라우저 환경에서만 로컬 스토리지에서 기존 로그 불러오기
    if (this.isBrowser) {
      this.loadLogs();
    }
  }

  /**
   * 한국 시간(UTC+9) 타임스탬프 반환
   */
  getKoreanTimestamp() {
    const now = new Date();
    const koreanTime = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    return koreanTime.toISOString().replace("Z", "+09:00");
  }

  /**
   * 로그 레벨별 메시지 출력
   */
  log(level, category, message, data = null) {
    if (!this.enabled) return;

    const timestamp = this.getKoreanTimestamp();
    const logEntry = {
      timestamp,
      level,
      category,
      message,
      data,
    };

    // 로그 배열에 추가
    this.logs.push(logEntry);

    // 최대 로그 개수 초과 시 오래된 로그 제거
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    // 로컬 스토리지에 저장
    this.saveLogs();

    // 콘솔 출력
    const consoleMessage = `[${timestamp}] [${level.toUpperCase()}] [${category}] ${message}`;

    switch (level) {
      case "error":
        console.error(consoleMessage, data || "");
        break;
      case "warn":
        console.warn(consoleMessage, data || "");
        break;
      case "info":
        console.info(consoleMessage, data || "");
        break;
      case "debug":
        console.log(consoleMessage, data || "");
        break;
      default:
        console.log(consoleMessage, data || "");
    }
  }

  /**
   * 편의 메서드
   */
  error(category, message, data) {
    this.log("error", category, message, data);
  }

  warn(category, message, data) {
    this.log("warn", category, message, data);
  }

  info(category, message, data) {
    this.log("info", category, message, data);
  }

  debug(category, message, data) {
    this.log("debug", category, message, data);
  }

  /**
   * 로컬 스토리지에 로그 저장
   */
  saveLogs() {
    if (!this.isBrowser) return;

    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.logs));
    } catch (error) {
      console.error("로그 저장 실패:", error);
    }
  }

  /**
   * 로컬 스토리지에서 로그 불러오기
   */
  loadLogs() {
    if (!this.isBrowser) return;

    try {
      const savedLogs = localStorage.getItem(this.storageKey);
      if (savedLogs) {
        this.logs = JSON.parse(savedLogs);
      }
    } catch (error) {
      console.error("로그 불러오기 실패:", error);
      this.logs = [];
    }
  }

  /**
   * 모든 로그 반환
   */
  getLogs() {
    return this.logs;
  }

  /**
   * 특정 카테고리의 로그만 반환
   */
  getLogsByCategory(category) {
    return this.logs.filter((log) => log.category === category);
  }

  /**
   * 특정 레벨의 로그만 반환
   */
  getLogsByLevel(level) {
    return this.logs.filter((log) => log.level === level);
  }

  /**
   * 로그 초기화
   */
  clearLogs() {
    this.logs = [];
    if (!this.isBrowser) return;

    try {
      localStorage.removeItem(this.storageKey);
      console.log("로그가 초기화되었습니다.");
    } catch (error) {
      console.error("로그 초기화 실패:", error);
    }
  }

  /**
   * 로그를 JSON 파일로 다운로드
   */
  downloadLogs() {
    if (!this.isBrowser) {
      console.warn("브라우저 환경에서만 다운로드 가능합니다.");
      return;
    }

    const dataStr = JSON.stringify(this.logs, null, 2);
    const dataBlob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement("a");
    link.href = url;
    const koreanTime = this.getKoreanTimestamp()
      .replace(/:/g, "-")
      .replace(/\+09-00/, "");
    link.download = `debug-logs-${koreanTime}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    console.log("로그 다운로드 완료");
  }

  /**
   * 로거 활성화/비활성화
   */
  setEnabled(enabled) {
    this.enabled = enabled;
  }
}

// 싱글톤 인스턴스 생성
const logger = new Logger();

export default logger;
