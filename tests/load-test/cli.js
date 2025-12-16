#!/usr/bin/env node

/**
 * cli.js
 *
 * SFU 부하 테스트 CLI 인터페이스
 *
 * 사용법:
 *   npm run load-test -- --room <roomId> --users <count> --ramp-up <seconds>
 *
 * @see REQ-016: CLI 인터페이스
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { program } from "commander";
import LoadTestRunner from "./LoadTestRunner.js";
import MultiRoomRunner from "./MultiRoomRunner.js";
import { closeLogger, getLogger, initLogger } from "./utils/logger.js";

// ESM에서 __dirname 구하기
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 버전 정보
const VERSION = "1.0.0";

// CLI 설정
program.name("load-test").description("WebRTC SFU 서버 부하 테스트 도구").version(VERSION);

// 기본 부하 테스트 명령
program
  .option("-r, --room <roomId>", "테스트할 방 ID", `load-test-${Date.now()}`)
  .option("-u, --users <count>", "목표 사용자 수", "5")
  .option("-i, --interval <seconds>", "사용자 추가 간격(초)", "10")
  .option("-d, --duration <minutes>", "테스트 지속 시간(분)", "3")
  .option("-s, --server <url>", "프론트엔드 서버 URL", "http://localhost:3000")
  .option("--no-headless", "브라우저 창 표시 (디버깅용)")
  .option("-o, --output <path>", "결과 CSV 파일 경로", "./metrics")
  .option("--stress", "스트레스 테스트 모드 (동시 접속)")
  .action(runLoadTest);

// 단일 클라이언트 테스트 명령
program
  .command("single")
  .description("단일 가상 클라이언트 테스트 (연결 확인용)")
  .option("-r, --room <roomId>", "테스트할 방 ID", "test-room")
  .option("-s, --server <url>", "프론트엔드 서버 URL", "http://localhost:3000")
  .option("--no-headless", "브라우저 창 표시")
  .option("-t, --timeout <seconds>", "연결 유지 시간(초)", "30")
  .action(runSingleClient);

// 다중 방 부하 테스트 명령
program
  .command("multi")
  .description("다중 방 부하 테스트 (완전 랜덤 분배)")
  .option("-n, --rooms <count>", "생성할 방 개수", "3")
  .option("-u, --users <count>", "전체 사용자 수", "30")
  .option("-i, --interval <seconds>", "사용자 추가 간격(초)", "5")
  .option("-d, --duration <minutes>", "테스트 지속 시간(분)", "5")
  .option("-s, --server <url>", "프론트엔드 서버 URL", "http://localhost:3000")
  .option("--no-headless", "브라우저 창 표시")
  .option("-o, --output <path>", "결과 저장 경로", "./metrics")
  .option("-v, --video <filename>", "비디오 파일명 (public/video/ 폴더 내, mp4/webm 지원)")
  .action(runMultiRoomTest);

/**
 * 부하 테스트 실행
 * @param {Object} options - CLI 옵션
 */
async function runLoadTest(options) {
  // 로거 초기화 (덮어쓰기 모드)
  initLogger({
    logDir: "./logs",
    logFile: "VirtualClient.log",
    overwrite: true,
  });
  const logger = getLogger();
  const prefix = "CLI:LoadTest";

  logger.info(prefix, "═".repeat(60));
  logger.info(prefix, "  WebRTC SFU 부하 테스트 도구 v" + VERSION);
  logger.info(prefix, "═".repeat(60));

  // 옵션 파싱
  const config = {
    serverUrl: options.server,
    roomId: options.room,
    targetUsers: Number.parseInt(options.users, 10),
    rampUpSeconds: Number.parseInt(options.interval, 10),
    durationMinutes: Number.parseInt(options.duration, 10),
    headless: options.headless !== false,
  };

  // 설정 검증
  if (Number.isNaN(config.targetUsers) || config.targetUsers < 1) {
    logger.error(prefix, "오류: 사용자 수는 1 이상이어야 합니다");
    closeLogger();
    process.exit(1);
  }

  logger.info(prefix, "테스트 설정:");
  logger.info(prefix, `  서버 URL: ${config.serverUrl}`);
  logger.info(prefix, `  방 ID: ${config.roomId}`);
  logger.info(prefix, `  목표 사용자: ${config.targetUsers}명`);
  logger.info(prefix, `  사용자 추가 간격: ${config.rampUpSeconds}초`);
  logger.info(prefix, `  테스트 시간: ${config.durationMinutes}분`);
  logger.info(prefix, `  Headless 모드: ${config.headless}`);
  logger.info(prefix, `  테스트 모드: ${options.stress ? "스트레스" : "점진적"}`);

  // 사용자 확인 (취소할 기회 제공)
  logger.info(prefix, "3초 후 테스트가 시작됩니다. 취소하려면 Ctrl+C를 누르세요...");
  await sleep(3000);

  // 테스트 러너 생성
  const runner = new LoadTestRunner(config);

  // SIGINT 핸들러 (Ctrl+C)
  process.on("SIGINT", async () => {
    logger.info(prefix, "인터럽트 감지. 테스트 중지 중...");
    const report = await runner.stop();
    await saveResults(report, options.output, logger);
    closeLogger();
    process.exit(0);
  });

  // 테스트 실행
  let report;
  if (options.stress) {
    report = await runner.runStress();
  } else {
    report = await runner.runGradualLoad();
  }

  // 결과 저장
  await saveResults(report, options.output, logger);

  logger.info(prefix, "테스트 완료!");
  closeLogger();
  process.exit(0);
}

/**
 * 단일 클라이언트 테스트
 * @param {Object} options - CLI 옵션
 */
async function runSingleClient(options) {
  // 로거 초기화 (덮어쓰기 모드)
  initLogger({
    logDir: "./logs",
    logFile: "VirtualClient.log",
    overwrite: true,
  });
  const logger = getLogger();
  const prefix = "CLI:SingleClient";

  const { default: VirtualClient } = await import("./VirtualClient.js");

  logger.info(prefix, "═".repeat(60));
  logger.info(prefix, "  단일 클라이언트 연결 테스트");
  logger.info(prefix, "═".repeat(60));

  const config = {
    serverUrl: options.server,
    roomId: options.room,
    userId: `test_user_${Date.now()}`,
    headless: options.headless !== false,
  };
  const timeout = Number.parseInt(options.timeout, 10) * 1000;

  logger.info(prefix, `서버: ${config.serverUrl}`);
  logger.info(prefix, `방 ID: ${config.roomId}`);
  logger.info(prefix, `사용자 ID: ${config.userId}`);
  logger.info(prefix, `Headless: ${config.headless}`);
  logger.info(prefix, `연결 유지 시간: ${timeout / 1000}초`);

  const client = new VirtualClient(config);

  // SIGINT 핸들러
  process.on("SIGINT", async () => {
    logger.info(prefix, "인터럽트 감지. 연결 해제 중...");
    await client.disconnect();
    closeLogger();
    process.exit(0);
  });

  try {
    logger.info(prefix, "연결 시도 중...");
    await client.connect();
    logger.info(prefix, "연결 성공!");
    logger.info(prefix, `${timeout / 1000}초 후 자동 연결 해제됩니다...`);

    // 지정된 시간 동안 연결 유지
    await sleep(timeout);

    // 연결 해제
    await client.disconnect();
    logger.info(prefix, "연결 해제 완료!");
    closeLogger();
  } catch (error) {
    logger.error(prefix, `연결 실패: ${error.message}`);
    await client.disconnect();
    closeLogger();
    process.exit(1);
  }
}

/**
 * 다중 방 부하 테스트 실행
 * @param {Object} options - CLI 옵션
 */
async function runMultiRoomTest(options) {
  // 로거 초기화 (덮어쓰기 모드)
  initLogger({
    logDir: "./logs",
    logFile: "VirtualClient.log",
    overwrite: true,
  });
  const logger = getLogger();
  const prefix = "CLI:MultiRoom";

  logger.info(prefix, "═".repeat(60));
  logger.info(prefix, `  WebRTC SFU 다중 방 부하 테스트 도구 v${VERSION}`);
  logger.info(prefix, "═".repeat(60));

  // 비디오 파일 검증 (public/video/ 폴더에서 확인)
  let videoUrl = null;
  if (options.video) {
    const videoFileName = options.video;
    const publicVideoPath = path.resolve(__dirname, "../../public/video", videoFileName);

    // 파일 존재 확인
    if (!fs.existsSync(publicVideoPath)) {
      logger.error(prefix, `오류: 비디오 파일을 찾을 수 없습니다: ${publicVideoPath}`);
      logger.error(prefix, "힌트: public/video/ 폴더에 비디오 파일을 배치하세요");
      closeLogger();
      process.exit(1);
    }

    // HTTP URL 생성 (브라우저에서 접근 가능)
    videoUrl = `${options.server}/video/${videoFileName}`;
    logger.info(prefix, `비디오 URL: ${videoUrl}`);
  }

  // 옵션 파싱
  const config = {
    serverUrl: options.server,
    roomCount: Number.parseInt(options.rooms, 10),
    targetUsers: Number.parseInt(options.users, 10),
    rampUpSeconds: Number.parseInt(options.interval, 10),
    durationMinutes: Number.parseInt(options.duration, 10),
    headless: options.headless !== false,
    videoUrl,
  };

  // 설정 검증
  if (Number.isNaN(config.roomCount) || config.roomCount < 1) {
    logger.error(prefix, "오류: 방 개수는 1 이상이어야 합니다");
    closeLogger();
    process.exit(1);
  }
  if (Number.isNaN(config.targetUsers) || config.targetUsers < config.roomCount) {
    logger.error(prefix, "오류: 사용자 수는 방 개수 이상이어야 합니다");
    closeLogger();
    process.exit(1);
  }

  logger.info(prefix, "테스트 설정:");
  logger.info(prefix, `  서버 URL: ${config.serverUrl}`);
  logger.info(prefix, `  방 개수: ${config.roomCount}개`);
  logger.info(prefix, `  전체 사용자: ${config.targetUsers}명`);
  logger.info(prefix, `  사용자 추가 간격: ${config.rampUpSeconds}초`);
  logger.info(prefix, `  테스트 시간: ${config.durationMinutes}분`);
  logger.info(prefix, `  Headless 모드: ${config.headless}`);
  logger.info(prefix, `  비디오 소스: ${videoUrl ?? "Canvas 패턴 (기본)"}`);

  // 사용자 확인 (취소할 기회 제공)
  logger.info(prefix, "3초 후 테스트가 시작됩니다. 취소하려면 Ctrl+C를 누르세요...");
  await sleep(3000);

  // 테스트 러너 생성
  const runner = new MultiRoomRunner(config);

  // SIGINT 핸들러 (Ctrl+C)
  process.on("SIGINT", async () => {
    logger.info(prefix, "인터럽트 감지. 테스트 중지 중...");
    const report = await runner.stop();
    await saveResults(report, options.output, logger);
    closeLogger();
    process.exit(0);
  });

  // 테스트 실행
  const report = await runner.start();

  // 결과 저장
  await saveResults(report, options.output, logger);

  logger.info(prefix, "테스트 완료!");
  closeLogger();
  process.exit(0);
}

/**
 * 테스트 결과 저장
 * @param {Object} report - 테스트 리포트
 * @param {string} outputDir - 출력 디렉토리
 * @param {Object} logger - 로거 인스턴스
 */
async function saveResults(report, outputDir, logger) {
  const prefix = "CLI:SaveResults";

  // 출력 디렉토리 생성
  const absOutputDir = path.resolve(outputDir);
  if (!fs.existsSync(absOutputDir)) {
    fs.mkdirSync(absOutputDir, { recursive: true });
  }

  // 타임스탬프
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

  // JSON 리포트 저장
  const jsonPath = path.join(absOutputDir, `load-test-${timestamp}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  logger.info(prefix, `리포트 저장: ${jsonPath}`);

  // CSV 메트릭 저장 (메트릭이 있는 경우)
  if (report.metrics && report.metrics.length > 0) {
    const csvPath = path.join(absOutputDir, `load-test-${timestamp}.csv`);
    const headers = [
      "timestamp",
      "elapsed_ms",
      "total_clients",
      "connected_clients",
      "failed_clients",
    ];
    const rows = report.metrics.map((m) => [
      m.timestamp,
      m.elapsedMs,
      m.totalClients,
      m.connectedClients,
      m.failedClients,
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    fs.writeFileSync(csvPath, csv);
    logger.info(prefix, `메트릭 CSV 저장: ${csvPath}`);
  }
}

/**
 * sleep 유틸리티
 * @param {number} ms - 밀리초
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// CLI 실행
program.parse(process.argv);
