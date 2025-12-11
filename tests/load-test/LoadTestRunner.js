/**
 * LoadTestRunner.js
 *
 * 부하 테스트 시나리오 실행기
 * VirtualClient 풀을 관리하고 점진적 부하 증가 시나리오 실행
 *
 * @see REQ-014: 점진적 부하 증가
 * @see REQ-017: 테스트 시나리오 설정
 */

import { closeLogger, initLogger } from "./utils/logger.js";
import VirtualClient from "./VirtualClient.js";

/**
 * 부하 테스트 실행 클래스
 */
class LoadTestRunner {
  /**
   * @param {Object} options - 설정 옵션
   * @param {string} options.serverUrl - SFU 서버 URL
   * @param {string} options.roomId - 테스트할 방 ID
   * @param {number} options.targetUsers - 목표 사용자 수 (기본: 10)
   * @param {number} options.rampUpSeconds - 사용자 추가 간격(초) (기본: 10)
   * @param {number} options.durationMinutes - 테스트 지속 시간(분) (기본: 5)
   * @param {boolean} options.headless - Headless 모드 (기본: true)
   */
  constructor(options) {
    // 필수 파라미터 검증
    if (!options?.serverUrl) {
      throw new Error("[LoadTestRunner] serverUrl은 필수입니다");
    }
    if (!options?.roomId) {
      throw new Error("[LoadTestRunner] roomId는 필수입니다");
    }

    this.serverUrl = options.serverUrl;
    this.roomId = options.roomId;
    this.targetUsers = options.targetUsers ?? 10;
    this.rampUpSeconds = options.rampUpSeconds ?? 10;
    this.durationMinutes = options.durationMinutes ?? 5;
    this.headless = options.headless ?? true;

    // 클라이언트 풀
    this.clients = new Map(); // userId -> VirtualClient

    // 테스트 상태
    this.running = false;
    this.startTime = null;
    this.metrics = [];

    // 타이머 ID
    this.rampUpTimer = null;
    this.metricsTimer = null;
    this.durationTimer = null;

    // 이벤트 콜백
    this.onUserAdded = null;
    this.onUserRemoved = null;
    this.onMetrics = null;
    this.onComplete = null;
    this.onError = null;
  }

  /**
   * 테스트 시작
   * @returns {Promise<void>}
   */
  async start() {
    if (this.running) {
      console.log("[LoadTestRunner] 이미 실행 중");
      return;
    }

    // 로거 초기화 (덮어쓰기 모드)
    initLogger({
      logDir: "./logs",
      logFile: "VirtualClient.log",
      overwrite: true,
    });

    this.running = true;
    this.startTime = Date.now();
    this.metrics = [];

    console.log("═".repeat(60));
    console.log("[LoadTestRunner] 부하 테스트 시작");
    console.log(`  서버: ${this.serverUrl}`);
    console.log(`  방 ID: ${this.roomId}`);
    console.log(`  목표 사용자: ${this.targetUsers}명`);
    console.log(`  사용자 추가 간격: ${this.rampUpSeconds}초`);
    console.log(`  테스트 시간: ${this.durationMinutes}분`);
    console.log("═".repeat(60));

    // 점진적 부하 증가 시작
    await this._startRampUp();

    // 메트릭 수집 시작 (5초 간격)
    this._startMetricsCollection();

    // 테스트 종료 타이머
    this.durationTimer = setTimeout(() => this.stop(), this.durationMinutes * 60 * 1000);
  }

  /**
   * 테스트 중지
   * @returns {Promise<void>}
   */
  async stop() {
    if (!this.running) return;

    console.log("\n[LoadTestRunner] 테스트 종료 중...");
    this.running = false;

    // 타이머 정리
    if (this.rampUpTimer) {
      clearInterval(this.rampUpTimer);
      this.rampUpTimer = null;
    }
    if (this.metricsTimer) {
      clearInterval(this.metricsTimer);
      this.metricsTimer = null;
    }
    if (this.durationTimer) {
      clearTimeout(this.durationTimer);
      this.durationTimer = null;
    }

    // 모든 클라이언트 연결 해제
    const disconnectPromises = [];
    for (const [userId, client] of this.clients) {
      disconnectPromises.push(
        client.disconnect().catch((err) => {
          console.error(`[LoadTestRunner] ${userId} 연결 해제 실패:`, err.message);
        })
      );
    }
    await Promise.all(disconnectPromises);
    this.clients.clear();

    // 결과 리포트 생성
    const report = this.generateReport();

    console.log("\n[LoadTestRunner] 테스트 완료");
    console.log("═".repeat(60));
    console.log(report.summary);
    console.log("═".repeat(60));

    if (this.onComplete) {
      this.onComplete(report);
    }

    // 로거 종료
    closeLogger();

    return report;
  }

  /**
   * 점진적 부하 증가 실행
   * @private
   */
  async _startRampUp() {
    let userCount = 0;

    // 첫 번째 사용자 즉시 추가
    await this._addUser(userCount++);

    // 나머지 사용자 점진적 추가
    if (this.targetUsers > 1) {
      this.rampUpTimer = setInterval(async () => {
        if (!this.running || userCount >= this.targetUsers) {
          if (this.rampUpTimer) {
            clearInterval(this.rampUpTimer);
            this.rampUpTimer = null;
          }
          console.log(`\n[LoadTestRunner] 목표 사용자 수 도달: ${this.clients.size}명`);
          return;
        }

        await this._addUser(userCount++);
      }, this.rampUpSeconds * 1000);
    }
  }

  /**
   * 가상 사용자 추가
   * @private
   * @param {number} index - 사용자 인덱스
   */
  async _addUser(index) {
    const userId = `virtual_user_${index + 1}`;

    try {
      const client = new VirtualClient({
        serverUrl: this.serverUrl,
        roomId: this.roomId,
        userId,
        headless: this.headless,
      });

      await client.connect();
      this.clients.set(userId, client);

      console.log(`[LoadTestRunner] 사용자 추가: ${userId} (현재 ${this.clients.size}명)`);

      if (this.onUserAdded) {
        this.onUserAdded({ userId, totalUsers: this.clients.size });
      }
    } catch (error) {
      console.error(`[LoadTestRunner] 사용자 추가 실패: ${userId}`, error.message);

      if (this.onError) {
        this.onError({ userId, error: error.message });
      }
    }
  }

  /**
   * 메트릭 수집 시작
   * @private
   */
  _startMetricsCollection() {
    this.metricsTimer = setInterval(() => {
      if (!this.running) return;

      const snapshot = this._collectMetrics();
      this.metrics.push(snapshot);

      // 콘솔 출력
      this._printMetrics(snapshot);

      if (this.onMetrics) {
        this.onMetrics(snapshot);
      }
    }, 5000); // 5초 간격
  }

  /**
   * 현재 메트릭 수집
   * @private
   * @returns {Object}
   */
  _collectMetrics() {
    const now = Date.now();
    const elapsed = now - this.startTime;

    const clientStats = [];
    let connectedCount = 0;

    for (const [_, client] of this.clients) {
      const stats = client.getStats();
      clientStats.push(stats);
      if (stats.connected) connectedCount++;
    }

    return {
      timestamp: new Date().toISOString(),
      elapsedMs: elapsed,
      totalClients: this.clients.size,
      connectedClients: connectedCount,
      failedClients: this.clients.size - connectedCount,
      clientStats,
    };
  }

  /**
   * 메트릭 콘솔 출력
   * @private
   * @param {Object} snapshot
   */
  _printMetrics(snapshot) {
    const elapsed = Math.floor(snapshot.elapsedMs / 1000);
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;

    console.log(
      `\n[Metrics ${minutes}:${seconds.toString().padStart(2, "0")}] ` +
        `클라이언트: ${snapshot.connectedClients}/${snapshot.totalClients} ` +
        `(실패: ${snapshot.failedClients})`
    );
  }

  /**
   * 테스트 결과 리포트 생성
   * @returns {Object}
   */
  generateReport() {
    const totalDuration = Date.now() - this.startTime;
    const totalClients = this.clients.size;

    // 연결된 클라이언트 수 계산
    let connectedCount = 0;
    const clientSummaries = [];

    for (const [userId, client] of this.clients) {
      const stats = client.getStats();
      clientSummaries.push({
        userId,
        connected: stats.connected,
        uptime: stats.uptime,
        attempts: stats.connectionAttempts,
        lastError: stats.lastError,
      });
      if (stats.connected) connectedCount++;
    }

    // 메트릭 통계
    const metricsCount = this.metrics.length;
    const avgConnected =
      metricsCount > 0
        ? this.metrics.reduce((sum, m) => sum + m.connectedClients, 0) / metricsCount
        : 0;

    const summary = `
테스트 결과 요약
────────────────────────────────────
총 테스트 시간: ${Math.floor(totalDuration / 1000)}초
목표 사용자 수: ${this.targetUsers}명
실제 생성 수: ${totalClients}명
연결 성공: ${connectedCount}명
연결 실패: ${totalClients - connectedCount}명
성공률: ${totalClients > 0 ? ((connectedCount / totalClients) * 100).toFixed(1) : 0}%
평균 연결 클라이언트: ${avgConnected.toFixed(1)}명
메트릭 샘플 수: ${metricsCount}
────────────────────────────────────
		`.trim();

    return {
      summary,
      config: {
        serverUrl: this.serverUrl,
        roomId: this.roomId,
        targetUsers: this.targetUsers,
        rampUpSeconds: this.rampUpSeconds,
        durationMinutes: this.durationMinutes,
      },
      results: {
        totalDuration,
        totalClients,
        connectedCount,
        failedCount: totalClients - connectedCount,
        successRate: totalClients > 0 ? connectedCount / totalClients : 0,
        avgConnected,
      },
      clients: clientSummaries,
      metrics: this.metrics,
    };
  }

  /**
   * 메트릭 CSV 내보내기
   * @returns {string} CSV 형식 문자열
   */
  exportMetrics() {
    if (this.metrics.length === 0) {
      return "timestamp,elapsed_ms,total_clients,connected_clients,failed_clients\n";
    }

    const headers = [
      "timestamp",
      "elapsed_ms",
      "total_clients",
      "connected_clients",
      "failed_clients",
    ];
    const rows = this.metrics.map((m) => [
      m.timestamp,
      m.elapsedMs,
      m.totalClients,
      m.connectedClients,
      m.failedClients,
    ]);

    return [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  }

  /**
   * 점진적 부하 증가 테스트 실행 (편의 메서드)
   * @returns {Promise<Object>} 테스트 리포트
   */
  async runGradualLoad() {
    await this.start();

    // 테스트 완료까지 대기
    return new Promise((resolve) => {
      this.onComplete = resolve;
    });
  }

  /**
   * 스트레스 테스트 (한 번에 모든 사용자 추가)
   * @returns {Promise<Object>} 테스트 리포트
   */
  async runStress() {
    if (this.running) {
      console.log("[LoadTestRunner] 이미 실행 중");
      return;
    }

    // 로거 초기화 (덮어쓰기 모드)
    initLogger({
      logDir: "./logs",
      logFile: "VirtualClient.log",
      overwrite: true,
    });

    this.running = true;
    this.startTime = Date.now();
    this.metrics = [];

    console.log("═".repeat(60));
    console.log("[LoadTestRunner] 스트레스 테스트 시작");
    console.log(`  서버: ${this.serverUrl}`);
    console.log(`  방 ID: ${this.roomId}`);
    console.log(`  동시 사용자: ${this.targetUsers}명`);
    console.log("═".repeat(60));

    // 모든 사용자 동시 추가
    const promises = [];
    for (let i = 0; i < this.targetUsers; i++) {
      promises.push(this._addUser(i));
    }
    await Promise.allSettled(promises);

    // 메트릭 수집 및 테스트 종료
    this._startMetricsCollection();
    this.durationTimer = setTimeout(() => this.stop(), this.durationMinutes * 60 * 1000);

    return new Promise((resolve) => {
      this.onComplete = resolve;
    });
  }
}

export default LoadTestRunner;
