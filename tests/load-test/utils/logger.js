/**
 * logger.js
 *
 * 부하 테스트용 로거 유틸리티
 * - 한국 시간대 타임스탬프 (Asia/Seoul)
 * - 파일 및 콘솔 동시 출력
 * - 레벨별 로깅 (debug, info, warn, error)
 *
 * @see documents/load-testing/design.md
 */

import fs from "node:fs";
import path from "node:path";

// 로그 레벨 정의
const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

class Logger {
  /**
   * @param {Object} options - 로거 설정
   * @param {string} options.name - 로거 이름
   * @param {string} [options.logDir] - 로그 디렉토리 경로
   * @param {string} [options.logFile] - 로그 파일명
   * @param {boolean} [options.overwrite] - 실행마다 덮어쓰기 여부
   * @param {string} [options.level] - 최소 로그 레벨
   */
  constructor(options = {}) {
    this.name = options.name || "LoadTest";
    this.logDir = options.logDir || "./logs";
    this.logFile = options.logFile || "VirtualClient.log";
    this.overwrite = options.overwrite ?? true;
    this.level = LOG_LEVELS[options.level?.toUpperCase()] ?? LOG_LEVELS.DEBUG;

    this.stream = null;
    this.initialized = false;
  }

  /**
   * 로거 초기화 - 파일 스트림 생성
   */
  init() {
    if (this.initialized) return;

    // 로그 디렉토리 생성
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }

    const logPath = path.join(this.logDir, this.logFile);

    // 덮어쓰기 모드: 'w', 추가 모드: 'a'
    const flags = this.overwrite ? "w" : "a";
    this.stream = fs.createWriteStream(logPath, { flags });

    this.initialized = true;
    console.log(`[Logger] 로그 파일 초기화: ${logPath}`);
  }

  /**
   * 한국 시간 타임스탬프 생성
   * 형식: 2024-12-11 14:30:45.123
   * @returns {string} 포맷된 타임스탬프
   */
  _getKoreanTimestamp() {
    const now = new Date();

    // Asia/Seoul 시간대로 변환
    const koreaOptions = {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    };

    const formatter = new Intl.DateTimeFormat("ko-KR", koreaOptions);
    const parts = formatter.formatToParts(now);

    // 파트 추출
    const getPart = (type) => parts.find((p) => p.type === type)?.value || "00";
    const year = getPart("year");
    const month = getPart("month");
    const day = getPart("day");
    const hour = getPart("hour");
    const minute = getPart("minute");
    const second = getPart("second");
    const ms = String(now.getMilliseconds()).padStart(3, "0");

    return `${year}-${month}-${day} ${hour}:${minute}:${second}.${ms}`;
  }

  /**
   * 로그 출력 (콘솔 + 파일)
   * @private
   */
  _log(level, levelName, prefix, message, ...args) {
    if (level < this.level) return;

    const timestamp = this._getKoreanTimestamp();
    const formattedMessage = `[${timestamp}][${levelName}][${prefix}] ${message}`;

    // 콘솔 출력
    console.log(formattedMessage, ...args);

    // 파일 출력
    if (this.stream) {
      const argsStr =
        args.length > 0
          ? ` ${args.map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a))).join(" ")}`
          : "";
      this.stream.write(`${formattedMessage + argsStr}\n`);
    }
  }

  /**
   * DEBUG 레벨 로그
   * @param {string} prefix - 로그 접두사 (예: "VirtualClient:user-1")
   * @param {string} message - 로그 메시지
   * @param {...any} args - 추가 인자
   */
  debug(prefix, message, ...args) {
    this._log(LOG_LEVELS.DEBUG, "DEBUG", prefix, message, ...args);
  }

  /**
   * INFO 레벨 로그
   * @param {string} prefix - 로그 접두사
   * @param {string} message - 로그 메시지
   * @param {...any} args - 추가 인자
   */
  info(prefix, message, ...args) {
    this._log(LOG_LEVELS.INFO, "INFO", prefix, message, ...args);
  }

  /**
   * WARN 레벨 로그
   * @param {string} prefix - 로그 접두사
   * @param {string} message - 로그 메시지
   * @param {...any} args - 추가 인자
   */
  warn(prefix, message, ...args) {
    this._log(LOG_LEVELS.WARN, "WARN", prefix, message, ...args);
  }

  /**
   * ERROR 레벨 로그
   * @param {string} prefix - 로그 접두사
   * @param {string} message - 로그 메시지
   * @param {...any} args - 추가 인자
   */
  error(prefix, message, ...args) {
    this._log(LOG_LEVELS.ERROR, "ERROR", prefix, message, ...args);
  }

  /**
   * 로거 종료 - 파일 스트림 닫기
   */
  close() {
    if (this.stream) {
      this.stream.end();
      this.stream = null;
      this.initialized = false;
    }
  }
}

// 싱글톤 인스턴스
let loggerInstance = null;

/**
 * 로거 인스턴스 가져오기 (싱글톤)
 * @param {Object} [options] - 로거 옵션
 * @returns {Logger} 로거 인스턴스
 */
export function getLogger(options = {}) {
  if (!loggerInstance) {
    loggerInstance = new Logger({
      name: "LoadTest",
      logDir: "./logs",
      logFile: "VirtualClient.log",
      overwrite: true,
      ...options,
    });
    loggerInstance.init();
  }
  return loggerInstance;
}

/**
 * 로거 초기화 (테스트 시작 시 호출)
 * @param {Object} [options] - 로거 옵션
 * @returns {Logger} 로거 인스턴스
 */
export function initLogger(options = {}) {
  if (loggerInstance) {
    loggerInstance.close();
  }
  loggerInstance = new Logger({
    name: "LoadTest",
    logDir: "./logs",
    logFile: "VirtualClient.log",
    overwrite: true,
    ...options,
  });
  loggerInstance.init();
  return loggerInstance;
}

/**
 * 로거 종료 (테스트 종료 시 호출)
 */
export function closeLogger() {
  if (loggerInstance) {
    loggerInstance.close();
    loggerInstance = null;
  }
}

export default Logger;
