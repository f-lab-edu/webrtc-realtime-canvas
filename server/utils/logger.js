/**
 * 서버 로거 유틸리티
 * 콘솔 출력과 함께 파일로 로그를 저장
 */
import fs from "node:fs";
import path from "node:path";

class ServerLogger {
  constructor() {
    this.logs = [];
    this.maxLogs = 1000;
    this.logDir = path.join(process.cwd(), "logs");
    this.logFile = path.join(this.logDir, `server-${this.getDateString()}.log`);

    // 로그 디렉토리 생성
    this.ensureLogDirectory();
  }

  /**
   * 로그 디렉토리 생성
   */
  ensureLogDirectory() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
      console.log(`로그 디렉토리 생성: ${this.logDir}`);
    }
  }

  /**
   * 날짜 문자열 반환 (YYYY-MM-DD)
   */
  getDateString() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
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
   * 로그 메시지 포맷팅
   */
  formatLog(level, category, message, data) {
    const timestamp = this.getKoreanTimestamp();
    let logMessage = `[${timestamp}] [${level.toUpperCase()}] [${category}] ${message}`;

    if (data) {
      logMessage += `\n${JSON.stringify(data, null, 2)}`;
    }

    return logMessage;
  }

  /**
   * 로그 파일에 쓰기
   */
  writeToFile(logMessage) {
    try {
      fs.appendFileSync(this.logFile, `${logMessage}\n`, "utf8");
    } catch (error) {
      console.error("로그 파일 쓰기 실패:", error);
    }
  }

  /**
   * 로그 레벨별 메시지 출력
   */
  log(level, category, message, data = null) {
    const logMessage = this.formatLog(level, category, message, data);

    // 콘솔 출력
    switch (level) {
      case "error":
        console.error(logMessage);
        break;
      case "warn":
        console.log(logMessage);
        break;
      case "info":
        console.info(logMessage);
        break;
      case "debug":
        console.log(logMessage);
        break;
      default:
        console.log(logMessage);
    }

    // 파일에 쓰기
    this.writeToFile(logMessage);

    // 메모리에 저장
    this.logs.push({
      timestamp: this.getKoreanTimestamp(),
      level,
      category,
      message,
      data,
    });

    // 최대 로그 개수 초과 시 오래된 로그 제거
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
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
   * 모든 로그 반환
   */
  getLogs() {
    return this.logs;
  }

  /**
   * 로그 초기화
   */
  clearLogs() {
    this.logs = [];
    console.log("메모리 로그가 초기화되었습니다.");
  }
}

// 싱글톤 인스턴스 생성
const serverLogger = new ServerLogger();

export default serverLogger;
