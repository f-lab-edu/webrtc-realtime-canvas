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

import { program } from "commander";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import LoadTestRunner from "./LoadTestRunner.js";

// ESM에서 __dirname 구하기
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 버전 정보
const VERSION = "1.0.0";

// CLI 설정
program
	.name("load-test")
	.description("WebRTC SFU 서버 부하 테스트 도구")
	.version(VERSION);

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

/**
 * 부하 테스트 실행
 * @param {Object} options - CLI 옵션
 */
async function runLoadTest(options) {
	console.log("\n" + "═".repeat(60));
	console.log("  WebRTC SFU 부하 테스트 도구 v" + VERSION);
	console.log("═".repeat(60) + "\n");

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
		console.error("오류: 사용자 수는 1 이상이어야 합니다");
		process.exit(1);
	}

	console.log("테스트 설정:");
	console.log(`  서버 URL: ${config.serverUrl}`);
	console.log(`  방 ID: ${config.roomId}`);
	console.log(`  목표 사용자: ${config.targetUsers}명`);
	console.log(`  사용자 추가 간격: ${config.rampUpSeconds}초`);
	console.log(`  테스트 시간: ${config.durationMinutes}분`);
	console.log(`  Headless 모드: ${config.headless}`);
	console.log(`  테스트 모드: ${options.stress ? "스트레스" : "점진적"}`);
	console.log("");

	// 사용자 확인 (취소할 기회 제공)
	console.log("3초 후 테스트가 시작됩니다. 취소하려면 Ctrl+C를 누르세요...\n");
	await sleep(3000);

	// 테스트 러너 생성
	const runner = new LoadTestRunner(config);

	// SIGINT 핸들러 (Ctrl+C)
	process.on("SIGINT", async () => {
		console.log("\n\n인터럽트 감지. 테스트 중지 중...");
		const report = await runner.stop();
		await saveResults(report, options.output);
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
	await saveResults(report, options.output);

	console.log("\n테스트 완료!");
	process.exit(0);
}

/**
 * 단일 클라이언트 테스트
 * @param {Object} options - CLI 옵션
 */
async function runSingleClient(options) {
	const { default: VirtualClient } = await import("./VirtualClient.js");

	console.log("\n" + "═".repeat(60));
	console.log("  단일 클라이언트 연결 테스트");
	console.log("═".repeat(60) + "\n");

	const config = {
		serverUrl: options.server,
		roomId: options.room,
		userId: `test_user_${Date.now()}`,
		headless: options.headless !== false,
	};
	const timeout = Number.parseInt(options.timeout, 10) * 1000;

	console.log(`서버: ${config.serverUrl}`);
	console.log(`방 ID: ${config.roomId}`);
	console.log(`사용자 ID: ${config.userId}`);
	console.log(`Headless: ${config.headless}`);
	console.log(`연결 유지 시간: ${timeout / 1000}초`);
	console.log("");

	const client = new VirtualClient(config);

	// SIGINT 핸들러
	process.on("SIGINT", async () => {
		console.log("\n인터럽트 감지. 연결 해제 중...");
		await client.disconnect();
		process.exit(0);
	});

	try {
		console.log("연결 시도 중...\n");
		await client.connect();
		console.log("\n연결 성공!");
		console.log(`${timeout / 1000}초 후 자동 연결 해제됩니다...\n`);

		// 지정된 시간 동안 연결 유지
		await sleep(timeout);

		// 연결 해제
		await client.disconnect();
		console.log("\n연결 해제 완료!");
	} catch (error) {
		console.error("\n연결 실패:", error.message);
		await client.disconnect();
		process.exit(1);
	}
}

/**
 * 테스트 결과 저장
 * @param {Object} report - 테스트 리포트
 * @param {string} outputDir - 출력 디렉토리
 */
async function saveResults(report, outputDir) {
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
	console.log(`\n리포트 저장: ${jsonPath}`);

	// CSV 메트릭 저장 (메트릭이 있는 경우)
	if (report.metrics && report.metrics.length > 0) {
		const csvPath = path.join(absOutputDir, `load-test-${timestamp}.csv`);
		const headers = ["timestamp", "elapsed_ms", "total_clients", "connected_clients", "failed_clients"];
		const rows = report.metrics.map((m) => [
			m.timestamp,
			m.elapsedMs,
			m.totalClients,
			m.connectedClients,
			m.failedClients,
		]);
		const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
		fs.writeFileSync(csvPath, csv);
		console.log(`메트릭 CSV 저장: ${csvPath}`);
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
