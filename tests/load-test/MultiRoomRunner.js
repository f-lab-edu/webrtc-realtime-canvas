/**
 * MultiRoomRunner.js
 *
 * 다중 방 부하 테스트 실행기
 * - 여러 방에 사용자를 완전 랜덤 분배
 * - 각 방에 순차적으로 클라이언트 투입
 *
 * @see 계획: 다중 방 부하 테스트 구현 계획
 */

import { getLogger } from "./utils/logger.js";
import {
  createAssignmentQueue,
  formatDistribution,
  getRoomDistribution,
} from "./utils/userDistributor.js";
import VirtualClient from "./VirtualClient.js";

/**
 * @typedef {Object} RoomState
 * @property {string} roomId - 방 ID
 * @property {VirtualClient[]} clients - 해당 방의 클라이언트 배열
 * @property {number} targetCount - 목표 클라이언트 수
 * @property {boolean} initialized - 방 생성 완료 여부
 */

/**
 * 다중 방 부하 테스트 실행 클래스
 */
class MultiRoomRunner {
  /**
   * @param {Object} options - 설정 옵션
   * @param {string} options.serverUrl - SFU 서버 URL
   * @param {number} options.roomCount - 생성할 방 개수
   * @param {number} options.targetUsers - 전체 사용자 수
   * @param {number} options.rampUpSeconds - 사용자 추가 간격(초)
   * @param {number} options.durationMinutes - 테스트 지속 시간(분)
   * @param {boolean} options.headless - Headless 모드
   * @param {string} options.videoUrl - 비디오 HTTP URL (선택)
   */
  constructor(options) {
    // 필수 파라미터 검증
    if (!options?.serverUrl) {
      throw new Error("[MultiRoomRunner] serverUrl은 필수입니다");
    }
    if (!options?.roomCount || options.roomCount < 1) {
      throw new Error("[MultiRoomRunner] roomCount는 1 이상이어야 합니다");
    }
    if (!options?.targetUsers || options.targetUsers < options.roomCount) {
      throw new Error("[MultiRoomRunner] targetUsers는 roomCount 이상이어야 합니다");
    }

    this.serverUrl = options.serverUrl;
    this.roomCount = options.roomCount;
    this.targetUsers = options.targetUsers;
    this.rampUpSeconds = options.rampUpSeconds ?? 5;
    this.durationMinutes = options.durationMinutes ?? 5;
    this.headless = options.headless ?? true;
    this.videoUrl = options.videoUrl ?? null;

    // 로거
    this.logger = getLogger();
    this.prefix = "MultiRoomRunner";

    // 방 상태 관리
    /** @type {Map<string, RoomState>} */
    this.rooms = new Map();

    // 클라이언트 전체 관리
    /** @type {Map<string, VirtualClient>} */
    this.clients = new Map();

    // 할당 큐
    this.roomIds = [];
    this.assignmentQueue = [];
    this.queueIndex = 0;

    // 테스트 상태
    this.running = false;
    this.startTime = null;
    this.metrics = [];

    // 타이머 ID
    this.rampUpTimer = null;
    this.metricsTimer = null;
    this.durationTimer = null;

    // 이벤트 콜백
    this.onComplete = null;
    this.onError = null;
  }

  /**
   * 테스트 시작
   * @returns {Promise<Object>} 테스트 리포트
   */
  async start() {
    if (this.running) {
      this.logger.info(this.prefix, "이미 실행 중");
      return;
    }

    this.running = true;
    this.startTime = Date.now();
    this.metrics = [];

    this._printHeader();

    // Phase 1: 할당 큐 생성
    this._createAssignmentQueue();

    // Phase 2: 방 초기화 (각 방에 첫 번째 클라이언트 투입)
    await this._initializeRooms();

    // Phase 3: 나머지 클라이언트 순차 투입
    this._startRampUp();

    // 메트릭 수집 시작
    this._startMetricsCollection();

    // 테스트 종료 타이머
    this.durationTimer = setTimeout(() => this.stop(), this.durationMinutes * 60 * 1000);

    // 완료 대기
    return new Promise((resolve) => {
      this.onComplete = resolve;
    });
  }

  /**
   * 테스트 헤더 출력
   * @private
   */
  _printHeader() {
    this.logger.info(this.prefix, "═".repeat(60));
    this.logger.info(this.prefix, "다중 방 부하 테스트 시작");
    this.logger.info(this.prefix, `  서버: ${this.serverUrl}`);
    this.logger.info(this.prefix, `  방 개수: ${this.roomCount}`);
    this.logger.info(this.prefix, `  전체 사용자: ${this.targetUsers}명`);
    this.logger.info(this.prefix, `  사용자 추가 간격: ${this.rampUpSeconds}초`);
    this.logger.info(this.prefix, `  테스트 시간: ${this.durationMinutes}분`);
    this.logger.info(this.prefix, "═".repeat(60));
  }

  /**
   * 할당 큐 생성
   * @private
   */
  _createAssignmentQueue() {
    const result = createAssignmentQueue(this.targetUsers, this.roomCount);
    this.roomIds = result.roomIds;
    this.assignmentQueue = result.queue;

    // 방별 분배 현황 출력
    const distribution = getRoomDistribution(this.assignmentQueue);
    this.logger.info(this.prefix, "방 분배 (완전 랜덤):");
    this.logger.info(this.prefix, formatDistribution(distribution));

    // 방 상태 초기화
    for (const roomId of this.roomIds) {
      const targetCount = distribution.get(roomId) || 0;
      this.rooms.set(roomId, {
        roomId,
        clients: [],
        targetCount,
        initialized: false,
      });
    }
  }

  /**
   * 방 초기화 (각 방에 첫 번째 클라이언트 투입)
   * @private
   */
  async _initializeRooms() {
    this.logger.info(this.prefix, "방 초기화 시작...");

    // 각 방에 배정된 첫 번째 클라이언트 찾기
    const firstClients = new Map(); // roomId -> assignment

    for (const assignment of this.assignmentQueue) {
      if (!firstClients.has(assignment.roomId)) {
        firstClients.set(assignment.roomId, assignment);
      }
    }

    // 각 방의 첫 번째 클라이언트 동시 투입
    const initPromises = [];

    for (const [_roomId, assignment] of firstClients) {
      initPromises.push(this._addClient(assignment, true));
    }

    await Promise.allSettled(initPromises);

    // 초기화 완료된 방 확인
    let initializedCount = 0;
    for (const roomState of this.rooms.values()) {
      if (roomState.initialized) {
        initializedCount++;
      }
    }

    this.logger.info(this.prefix, `방 초기화 완료: ${initializedCount}/${this.roomCount}개`);
  }

  /**
   * 클라이언트 추가
   * @private
   * @param {Object} assignment - 할당 정보
   * @param {boolean} isInitial - 방 초기화용 첫 클라이언트 여부
   */
  async _addClient(assignment, isInitial = false) {
    const { userId, roomId } = assignment;

    try {
      const client = new VirtualClient({
        serverUrl: this.serverUrl,
        roomId,
        userId,
        headless: this.headless,
        videoUrl: this.videoUrl,
      });

      await client.connect();

      // 전체 클라이언트 맵에 추가
      this.clients.set(userId, client);

      // 방별 클라이언트 배열에 추가
      const roomState = this.rooms.get(roomId);
      if (roomState) {
        roomState.clients.push(client);
        if (isInitial) {
          roomState.initialized = true;
        }
      }

      // 방 이름 축약
      const shortRoomName = `room_${roomId.split("_").pop()}`;
      this.logger.info(
        this.prefix,
        `사용자 추가: ${userId} → ${shortRoomName} (전체 ${this.clients.size}명)`
      );
    } catch (error) {
      this.logger.error(this.prefix, `사용자 추가 실패: ${userId} - ${error.message}`);

      // 비디오 파일 로드 실패인 경우 전체 테스트 중단
      if (error.message.includes("비디오 파일 로드 실패")) {
        this.logger.error(this.prefix, "비디오 파일 로드 실패로 테스트를 중단합니다.");
        await this.stop();
        throw error; // 상위로 전파
      }

      if (this.onError) {
        this.onError({ userId, roomId, error: error.message });
      }
    }
  }

  /**
   * 나머지 클라이언트 순차 투입 시작
   * - setTimeout 기반 순차 실행 (이전 클라이언트 완료 후 다음 시작)
   * @private
   */
  _startRampUp() {
    // 이미 투입된 첫 번째 클라이언트들 건너뛰기
    const initialClients = new Set();
    for (const roomState of this.rooms.values()) {
      if (roomState.clients.length > 0) {
        initialClients.add(roomState.clients[0].userId);
      }
    }

    // 남은 클라이언트 필터링
    const remainingQueue = this.assignmentQueue.filter((a) => !initialClients.has(a.userId));

    if (remainingQueue.length === 0) {
      this.logger.info(this.prefix, "모든 클라이언트 투입 완료");
      return;
    }

    this.logger.info(this.prefix, `나머지 ${remainingQueue.length}명 순차 투입 시작...`);

    let index = 0;

    // 순차 투입 함수 (이전 클라이언트 연결 완료 후 다음 시작)
    const addNextClient = async () => {
      if (!this.running || index >= remainingQueue.length) {
        this.logger.info(this.prefix, `목표 사용자 수 도달: ${this.clients.size}명`);
        return;
      }

      // 클라이언트 추가 (완료까지 대기)
      await this._addClient(remainingQueue[index++]);

      // 다음 클라이언트 예약 (rampUpSeconds 후)
      if (this.running && index < remainingQueue.length) {
        this.rampUpTimer = setTimeout(addNextClient, this.rampUpSeconds * 1000);
      } else if (index >= remainingQueue.length) {
        this.logger.info(this.prefix, `목표 사용자 수 도달: ${this.clients.size}명`);
      }
    };

    // 첫 번째 클라이언트 즉시 시작
    addNextClient();
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
      this._printMetrics(snapshot);
    }, 5000);
  }

  /**
   * 메트릭 수집
   * @private
   * @returns {Object}
   */
  _collectMetrics() {
    const now = Date.now();
    const elapsed = now - this.startTime;

    // 전체 통계
    let totalConnected = 0;
    const roomStats = {};

    for (const [roomId, roomState] of this.rooms) {
      const shortName = `room_${roomId.split("_").pop()}`;
      let roomConnected = 0;

      for (const client of roomState.clients) {
        if (client.isConnected()) {
          roomConnected++;
          totalConnected++;
        }
      }

      roomStats[shortName] = {
        connected: roomConnected,
        total: roomState.clients.length,
        target: roomState.targetCount,
      };
    }

    return {
      timestamp: new Date().toISOString(),
      elapsedMs: elapsed,
      totalClients: this.clients.size,
      connectedClients: totalConnected,
      failedClients: this.clients.size - totalConnected,
      roomStats,
    };
  }

  /**
   * 메트릭 출력
   * @private
   * @param {Object} snapshot
   */
  _printMetrics(snapshot) {
    const elapsed = Math.floor(snapshot.elapsedMs / 1000);
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;

    // 방별 현황 문자열
    const roomParts = Object.entries(snapshot.roomStats)
      .map(([name, stats]) => `${name}(${stats.connected}/${stats.total})`)
      .join(", ");

    this.logger.info(
      this.prefix,
      `[Metrics ${minutes}:${seconds.toString().padStart(2, "0")}] ` +
        `총: ${snapshot.connectedClients}/${snapshot.totalClients} | ` +
        `방별: ${roomParts}`
    );
  }

  /**
   * 테스트 중지
   * @returns {Promise<Object>} 테스트 리포트
   */
  async stop() {
    if (!this.running) return;

    this.logger.info(this.prefix, "테스트 종료 중...");
    this.running = false;

    // 타이머 정리
    if (this.rampUpTimer) {
      clearTimeout(this.rampUpTimer);
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
          this.logger.error(this.prefix, `${userId} 연결 해제 실패: ${err.message}`);
        })
      );
    }
    await Promise.all(disconnectPromises);

    // 리포트 생성
    const report = this._generateReport();

    this.logger.info(this.prefix, "테스트 완료");
    this.logger.info(this.prefix, "═".repeat(60));
    this.logger.info(this.prefix, report.summary);
    this.logger.info(this.prefix, "═".repeat(60));

    if (this.onComplete) {
      this.onComplete(report);
    }

    return report;
  }

  /**
   * 테스트 리포트 생성
   * @private
   * @returns {Object}
   */
  _generateReport() {
    const totalDuration = Date.now() - this.startTime;
    const totalClients = this.clients.size;

    // 클라이언트별 상태
    let connectedCount = 0;
    const clientSummaries = [];

    for (const [userId, client] of this.clients) {
      const stats = client.getStats();
      clientSummaries.push({
        userId,
        roomId: stats.roomId,
        connected: stats.connected,
        uptime: stats.uptime,
      });
      if (stats.connected) connectedCount++;
    }

    // 방별 통계
    const roomSummaries = [];
    for (const [roomId, roomState] of this.rooms) {
      const shortName = `room_${roomId.split("_").pop()}`;
      const connected = roomState.clients.filter((c) => c.isConnected()).length;
      roomSummaries.push({
        roomId: shortName,
        fullRoomId: roomId,
        connected,
        total: roomState.clients.length,
        target: roomState.targetCount,
      });
    }

    const summary = `
      다중 방 테스트 결과 요약
      ────────────────────────────────────
      총 테스트 시간: ${Math.floor(totalDuration / 1000)}초
      방 개수: ${this.roomCount}개
      목표 사용자 수: ${this.targetUsers}명
      실제 생성 수: ${totalClients}명
      연결 성공: ${connectedCount}명
      연결 실패: ${totalClients - connectedCount}명
      성공률: ${totalClients > 0 ? ((connectedCount / totalClients) * 100).toFixed(1) : 0}%

      방별 현황:
      ${roomSummaries.map((r) => `  ${r.roomId}: ${r.connected}/${r.total}명 (목표: ${r.target}명)`).join("\n")}
      ────────────────────────────────────
    `.trim();

    return {
      summary,
      config: {
        serverUrl: this.serverUrl,
        roomCount: this.roomCount,
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
      },
      rooms: roomSummaries,
      clients: clientSummaries,
      metrics: this.metrics,
    };
  }
}

export default MultiRoomRunner;
