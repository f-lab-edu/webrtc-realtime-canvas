/**
 * CpuProfiler - 세션 단위 CPU 프로파일링
 *
 * 기능:
 * - 방(roomId) 단위로 CPU 프로파일 세션 관리
 * - 세션 시작 시 v8-profiler-next 시작
 * - 세션 종료 시 .cpuprofile 파일 저장
 * - Chrome DevTools Performance 탭에서 Flame Graph로 분석 가능
 *
 * 사용법:
 * - Chrome DevTools 열기 (F12)
 * - Performance 탭 → Load Profile
 * - .cpuprofile 파일 선택
 * - Flame Chart 분석
 */

import fs from "node:fs";
import path from "node:path";

// v8-profiler-next는 native 모듈이므로 동적 import
let profiler = null;

class CpuProfiler {
	/**
	 * 팩토리 메서드 - 비동기 초기화를 위해 사용
	 * @param {Object} options - 설정 옵션
	 * @returns {Promise<CpuProfiler>}
	 */
	static async create(options = {}) {
		const instance = new CpuProfiler(options);
		await instance._initProfiler();
		return instance;
	}

	/**
	 * @param {Object} options - 설정 옵션
	 * @param {boolean} [options.enabled=false] - 프로파일링 활성화 여부
	 * @param {string} [options.logDir='./logs/profile'] - 프로파일 저장 디렉토리
	 */
	constructor(options = {}) {
		this.enabled = options.enabled || false;
		this.logDir = options.logDir || "./logs/profile";
		this.sessions = new Map(); // Map<roomId, SessionData>

		// 로그 디렉토리 생성
		this._ensureLogDir();

		console.log("[CpuProfiler] 인스턴스 생성");
	}

	/**
	 * v8-profiler-next 초기화 (비동기)
	 * @private
	 */
	async _initProfiler() {
		if (!this.enabled) return;

		try {
			// 동적 import (native 모듈)
			const module = await import("v8-profiler-next");
			profiler = module.default;

			// 고해상도 샘플링 설정 (기본값 사용)
			profiler.setGenerateType(1);

			console.log("[CpuProfiler] v8-profiler-next 초기화 완료");
		} catch (error) {
			console.error(`[CpuProfiler:ERROR] v8-profiler-next 초기화 실패: ${error.message}`);
			console.error("[CpuProfiler:ERROR] npm install v8-profiler-next 실행 필요");
			this.enabled = false;
		}
	}

	/**
	 * 로그 디렉토리 생성
	 * @private
	 */
	_ensureLogDir() {
		const absPath = path.resolve(this.logDir);
		if (!fs.existsSync(absPath)) {
			fs.mkdirSync(absPath, { recursive: true });
			console.log(`[CpuProfiler] 디렉토리 생성: ${absPath}`);
		}
	}

	/**
	 * 세션 존재 여부 확인
	 * @param {string} roomId - 방 ID
	 * @returns {boolean}
	 */
	hasSession(roomId) {
		return this.sessions.has(roomId);
	}

	/**
	 * 세션 시작 (CPU 프로파일 시작)
	 * @param {string} roomId - 방 ID
	 */
	startSession(roomId) {
		// 파라미터 검증
		if (!this.enabled || !roomId) return;
		if (!profiler) {
			console.warn("[CpuProfiler:WARN] 프로파일러가 초기화되지 않았습니다.");
			return;
		}
		if (this.sessions.has(roomId)) return;

		const session = {
			id: `sess-${Date.now()}-${roomId}`,
			roomId,
			startTime: new Date(),
			profileName: null,
		};

		try {
			// v8-profiler-next 시작 (recsamples=true: 샘플링 기반)
			profiler.startProfiling(session.id, true);
			session.profileName = session.id;
			this.sessions.set(roomId, session);

			console.log(`[CpuProfiler] 세션 시작: roomId=${roomId}, sessionId=${session.id}`);
		} catch (error) {
			console.error(`[CpuProfiler:ERROR] 세션 시작 실패: ${error.message}`);
		}
	}

	/**
	 * 세션 종료 (CPU 프로파일 저장)
	 * @param {string} roomId - 방 ID
	 */
	async endSession(roomId) {
		// 파라미터 검증
		if (!this.enabled || !roomId) return;
		if (!profiler) return;

		const session = this.sessions.get(roomId);
		if (!session) return;

		try {
			// 프로파일 종료
			const profile = profiler.stopProfiling(session.profileName);

			if (!profile) {
				console.warn(`[CpuProfiler:WARN] 프로파일 없음: ${session.profileName}`);
				this.sessions.delete(roomId);
				return;
			}

			// 비동기 export (Event Loop Blocking 완화)
			await this._exportProfile(profile, session);

			// 메모리 정리 (중요!)
			profile.delete();

			this.sessions.delete(roomId);

			console.log(`[CpuProfiler] 세션 종료: roomId=${roomId}, sessionId=${session.id}`);
		} catch (error) {
			console.error(`[CpuProfiler:ERROR] 세션 종료 실패: ${error.message}`);
			this.sessions.delete(roomId);
		}
	}

	/**
	 * 프로파일 export (비동기 처리)
	 * @param {Object} profile - v8-profiler 프로파일 객체
	 * @param {Object} session - 세션 데이터
	 * @returns {Promise<void>}
	 * @private
	 */
	_exportProfile(profile, session) {
		return new Promise((resolve, reject) => {
			profile.export((error, result) => {
				if (error) {
					reject(error);
					return;
				}

				try {
					const sizeMB = Buffer.byteLength(result, "utf8") / 1024 / 1024;

					// 파일 크기 경고 (50MB 이상)
					if (sizeMB > 50) {
						console.warn(`[CpuProfiler:WARN] 프로파일 크기가 큼: ${sizeMB.toFixed(2)} MB`);
					}

					const filename = `cpu-${session.id}.cpuprofile`;
					const filepath = path.join(this.logDir, filename);

					fs.writeFileSync(filepath, result, "utf8");
					console.log(`[CpuProfiler] 저장: ${filepath} (${sizeMB.toFixed(2)} MB)`);

					resolve();
				} catch (writeError) {
					console.error(`[CpuProfiler:ERROR] 파일 저장 실패: ${writeError.message}`);
					reject(writeError);
				}
			});
		});
	}

	/**
	 * 모든 세션 종료 (서버 종료 시 호출)
	 */
	async cleanup() {
		if (!this.enabled) return;

		for (const roomId of this.sessions.keys()) {
			await this.endSession(roomId);
		}
		console.log("[CpuProfiler] 리소스 정리 완료");
	}
}

export default CpuProfiler;
