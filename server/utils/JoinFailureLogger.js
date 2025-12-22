/**
 * 방 입장 실패 로거
 * 클라이언트 방 입장 실패 시 원인/사유를 구조화하여 기록
 */
import fs from "node:fs";
import path from "node:path";
import { JOIN_FAILURE_REASONS } from "../../shared/joinFailureReasons.js";

// 공유 상수 re-export (기존 import 호환성 유지)
export { JOIN_FAILURE_REASONS };

class JoinFailureLogger {
  constructor() {
    this.logDir = path.join(process.cwd(), "logs", "join-failures");
    this.ensureLogDirectory();
  }

  /**
   * 로그 디렉토리 생성
   */
  ensureLogDirectory() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
      console.log(`[JoinFailureLogger] 로그 디렉토리 생성: ${this.logDir}`);
    }
  }

  /**
   * 날짜 문자열 반환 (YYYY-MM-DD, KST 기준)
   */
  getDateString() {
    const now = new Date();
    // KST (UTC+9) 기준으로 날짜 계산
    const koreanTime = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const year = koreanTime.getUTCFullYear();
    const month = String(koreanTime.getUTCMonth() + 1).padStart(2, "0");
    const day = String(koreanTime.getUTCDate()).padStart(2, "0");
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
   * 로그 파일 경로 반환
   */
  getLogFilePath() {
    return path.join(this.logDir, `join-failures-${this.getDateString()}.log`);
  }

  /**
   * 방 입장 실패 로깅
   * @param {Object} params - 로깅 파라미터
   * @param {string} params.socketId - 소켓 ID
   * @param {string} params.roomId - 방 ID
   * @param {string} params.reason - 실패 원인 코드 (JOIN_FAILURE_REASONS 키)
   * @param {string} [params.errorMessage] - 에러 메시지
   * @param {Object} [params.clientInfo] - 클라이언트 정보
   * @param {Object} [params.serverContext] - 서버 컨텍스트 정보
   */
  logFailure({ socketId, roomId, reason, errorMessage, clientInfo, serverContext }) {
    // 필수 파라미터 검증
    if (!socketId || !roomId || !reason) {
      console.error("[JoinFailureLogger] 필수 파라미터 누락: socketId, roomId, reason");
      return;
    }

    const logEntry = {
      timestamp: this.getKoreanTimestamp(),
      socketId,
      roomId,
      reason,
      errorMessage: errorMessage || JOIN_FAILURE_REASONS[reason] || "알 수 없는 오류",
      clientInfo: clientInfo || null,
      serverContext: serverContext || null,
    };

    // 콘솔 출력
    console.log(`[JoinFailureLogger] 방 입장 실패: ${roomId} (${reason})`);

    // 파일에 쓰기
    this.writeToFile(logEntry);
  }

  /**
   * 로그 파일에 쓰기 (비동기)
   * @param {Object} logEntry - 로그 엔트리
   */
  async writeToFile(logEntry) {
    try {
      const logFilePath = this.getLogFilePath();
      const logLine = `${JSON.stringify(logEntry)}\n`;
      await fs.promises.appendFile(logFilePath, logLine, "utf8");
    } catch (error) {
      console.error("[JoinFailureLogger] 로그 파일 쓰기 실패:", error);
    }
  }
}

// 싱글톤 인스턴스 생성
const joinFailureLogger = new JoinFailureLogger();

export default joinFailureLogger;
