/**
 * RoomTrafficLogger - 방 단위 트래픽 세션 로깅
 *
 * 기능:
 * - 방(roomId) 단위로 트래픽 세션 관리
 * - 세션 시작/종료 시 로그 파일에 기록
 * - 세션 중 메트릭 수집 (메모리에만 저장, 콘솔 출력 없음)
 * - 세션 종료 시 요약 통계 계산 후 파일에 저장
 *
 * 타임스탬프: Asia/Seoul (한국 시간) 기준
 */

import fs from "node:fs";
import path from "node:path";

class RoomTrafficLogger {
  /**
   * @param {Object} mediasoupManager - MediasoupManager 인스턴스
   * @param {Object} roomManager - RoomManager 인스턴스
   * @param {Object} options - 설정 옵션
   * @param {string} [options.logDir='./logs/traffic'] - 로그 파일 디렉토리
   * @param {number} [options.intervalMs=1000] - 메트릭 수집 간격 (밀리초)
   */
  constructor(mediasoupManager, roomManager, options = {}) {
    // 필수 파라미터 검증
    if (!mediasoupManager) {
      throw new Error("[RoomTrafficLogger] mediasoupManager는 필수입니다.");
    }
    if (!roomManager) {
      throw new Error("[RoomTrafficLogger] roomManager는 필수입니다.");
    }

    this.manager = mediasoupManager;
    this.roomManager = roomManager;
    this.logDir = options.logDir || "./logs/traffic";
    this.intervalMs = options.intervalMs || 1000;

    // Map<roomId, SessionData>
    this.sessions = new Map();

    // 로그 디렉토리 생성
    this._ensureLogDir();

    console.log("[RoomTrafficLogger] 인스턴스 생성");
  }

  /**
   * 로그 디렉토리 생성
   * @private
   */
  _ensureLogDir() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
      console.log(`[RoomTrafficLogger] 로그 디렉토리 생성: ${this.logDir}`);
    }
  }

  /**
   * 한국 시간(Asia/Seoul) Date 객체 생성
   * @returns {Date} 한국 시간 기준 Date 객체
   * @private
   */
  _getKoreaDate() {
    // Intl API를 사용하여 시간대 안전하게 처리
    return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  }

  /**
   * 한국 시간(Asia/Seoul) ISO 형식 타임스탬프 생성
   * @returns {string} ISO 형식 타임스탬프 (예: 2025-12-17T10:49:54+09:00)
   * @private
   */
  _getKoreanTimestamp() {
    const koreaDate = this._getKoreaDate();
    return koreaDate.toISOString().replace("Z", "+09:00");
  }

  /**
   * 로그 파일명용 한국 날짜 문자열 (YYYY-MM-DD)
   * @returns {string} 날짜 문자열
   * @private
   */
  _getKoreanDateString() {
    const koreaDate = this._getKoreaDate();
    return koreaDate.toISOString().split("T")[0];
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
   * 세션 시작 (첫 Transport 생성 시 호출)
   * @param {string} roomId - 방 ID
   */
  startSession(roomId) {
    if (!roomId) return;
    if (this.sessions.has(roomId)) return;

    const session = {
      id: `sess-${Date.now()}-${roomId}`,
      roomId,
      startTime: new Date(),
      metricsBuffer: [],
      intervalId: null,
      // 최대값 추적
      maxTransports: 0,
      maxProducers: 0,
      maxConsumers: 0,
      maxParticipants: 0,
      maxCpuPercent: 0,
      maxMemoryMb: 0,
      // 트래픽 통계
      totalBytesReceived: 0,
      totalBytesSent: 0,
      // 품질 지표 누적
      jitterSum: 0,
      jitterCount: 0,
      rttSum: 0,
      rttCount: 0,
      packetsReceived: 0,
      packetsLost: 0,
      // CPU 사용률 계산용
      previousResourceUsage: new Map(),
      // 델타 계산용 이전 Producer/Consumer 통계
      previousProducerStats: new Map(),
      previousConsumerStats: new Map(),
    };

    this.sessions.set(roomId, session);
    this._writeSessionStart(session);
    this._startMetricCollection(roomId);

    console.log(`[RoomTrafficLogger] 세션 시작: roomId=${roomId}, sessionId=${session.id}`);
  }

  /**
   * 세션 종료 (방 삭제 또는 모든 Transport 닫힘 시 호출)
   * @param {string} roomId - 방 ID
   */
  endSession(roomId) {
    if (!roomId) return;

    const session = this.sessions.get(roomId);
    if (!session) return;

    this._stopMetricCollection(roomId);
    this._writeSessionEnd(session);
    this.sessions.delete(roomId);

    console.log(`[RoomTrafficLogger] 세션 종료: roomId=${roomId}, sessionId=${session.id}`);
  }

  /**
   * 메트릭 수집 시작 (1초 간격)
   * @param {string} roomId - 방 ID
   * @private
   */
  _startMetricCollection(roomId) {
    const session = this.sessions.get(roomId);
    if (!session) return;

    session.intervalId = setInterval(async () => {
      try {
        await this._collectMetric(roomId);
      } catch (error) {
        console.error(`[RoomTrafficLogger] 메트릭 수집 실패: ${error.message}`);
      }
    }, this.intervalMs);
  }

  /**
   * 메트릭 수집 중지
   * @param {string} roomId - 방 ID
   * @private
   */
  _stopMetricCollection(roomId) {
    const session = this.sessions.get(roomId);
    if (!session || !session.intervalId) return;

    clearInterval(session.intervalId);
    session.intervalId = null;
  }

  /**
   * Worker CPU 및 메모리 메트릭 수집
   * @param {Object} session - 세션 데이터
   * @returns {Promise<Object>} { totalCpuPercent, totalMemoryMb }
   * @private
   */
  async _collectWorkerMetrics(session) {
    const workers = this.manager.workerPoolManager.workers;
    let totalCpuPercent = 0;
    let totalMemoryMb = 0;

    for (const worker of workers) {
      if (worker.closed) continue;

      try {
        const usage = await worker.getResourceUsage();
        const workerId = worker.pid.toString();
        const now = Date.now();

        // CPU 사용률 계산
        const cpuPercent = this._calculateCpuPercent(
          session,
          workerId,
          usage.ru_utime,
          usage.ru_stime,
          now
        );

        // 메모리 계산 (ru_maxrss: Linux/Windows = KB, macOS = bytes)
        const isMacOS = process.platform === "darwin";
        const memoryMb = isMacOS
          ? Math.round((usage.ru_maxrss / 1024 / 1024) * 100) / 100
          : Math.round((usage.ru_maxrss / 1024) * 100) / 100;

        totalCpuPercent += cpuPercent;
        totalMemoryMb += memoryMb;
      } catch {
        // Worker 메트릭 수집 실패 무시
      }
    }

    return {
      totalCpuPercent: Math.round(totalCpuPercent * 100) / 100,
      totalMemoryMb: Math.round(totalMemoryMb * 100) / 100,
    };
  }

  /**
   * CPU 사용률 계산 (델타 기반)
   * @param {Object} session - 세션 데이터
   * @param {string} workerId - Worker ID (PID)
   * @param {number} currentUtime - 현재 ru_utime (밀리초)
   * @param {number} currentStime - 현재 ru_stime (밀리초)
   * @param {number} currentTimestamp - 현재 타임스탬프
   * @returns {number} CPU 사용률 (0-100)
   * @private
   */
  _calculateCpuPercent(session, workerId, currentUtime, currentStime, currentTimestamp) {
    const previous = session.previousResourceUsage.get(workerId);

    // 현재 값 저장
    session.previousResourceUsage.set(workerId, {
      utime: currentUtime,
      stime: currentStime,
      timestamp: currentTimestamp,
    });

    // 첫 번째 측정에서는 0 반환
    if (!previous) {
      return 0;
    }

    const deltaUtime = currentUtime - previous.utime;
    const deltaStime = currentStime - previous.stime;
    const elapsedWallTime = currentTimestamp - previous.timestamp;

    if (elapsedWallTime <= 0) {
      return 0;
    }

    const cpuPercent = ((deltaUtime + deltaStime) / elapsedWallTime) * 100;
    return Math.max(0, Math.min(100, cpuPercent));
  }

  /**
   * 단일 메트릭 수집 (방별 Producer/Consumer 통계)
   * @param {string} roomId - 방 ID
   * @private
   */
  async _collectMetric(roomId) {
    const session = this.sessions.get(roomId);
    if (!session) return;

    const stats = this.manager.getStats();
    const roomParticipants = this.roomManager.getRoomParticipants(roomId);

    // 최대값 업데이트
    session.maxTransports = Math.max(session.maxTransports, stats.transports);
    session.maxProducers = Math.max(session.maxProducers, stats.producers);
    session.maxConsumers = Math.max(session.maxConsumers, stats.consumers);
    session.maxParticipants = Math.max(session.maxParticipants, roomParticipants.length);

    // CPU 및 메모리 수집
    const cpuMemMetrics = await this._collectWorkerMetrics(session);
    session.maxCpuPercent = Math.max(session.maxCpuPercent, cpuMemMetrics.totalCpuPercent);
    session.maxMemoryMb = Math.max(session.maxMemoryMb, cpuMemMetrics.totalMemoryMb);

    // Producer 통계 수집 (델타 기반)
    const producers = this.manager.producerManager.getAll();
    for (const producer of producers) {
      if (producer.closed) continue;
      try {
        const producerStats = await producer.getStats();
        for (const stat of producerStats) {
          if (stat.type === "inbound-rtp") {
            const producerId = producer.id;
            const prevStats = session.previousProducerStats.get(producerId) || {
              byteCount: 0,
              packetCount: 0,
              packetsLost: 0,
            };

            // 델타 계산 (현재값 - 이전값)
            const deltaBytes = (stat.byteCount || 0) - prevStats.byteCount;
            const deltaPackets = (stat.packetCount || 0) - prevStats.packetCount;
            const deltaLost = (stat.packetsLost || 0) - prevStats.packetsLost;

            // 양수인 경우에만 누적 (리셋 방지)
            if (deltaBytes > 0) session.totalBytesReceived += deltaBytes;
            if (deltaPackets > 0) session.packetsReceived += deltaPackets;
            if (deltaLost > 0) session.packetsLost += deltaLost;

            // 이전 값 저장
            session.previousProducerStats.set(producerId, {
              byteCount: stat.byteCount || 0,
              packetCount: stat.packetCount || 0,
              packetsLost: stat.packetsLost || 0,
            });

            if (typeof stat.jitter === "number" && stat.jitter >= 0) {
              // mediasoup은 jitter를 이미 ms 단위로 제공
              session.jitterSum += stat.jitter;
              session.jitterCount++;
            }
            if (typeof stat.roundTripTime === "number" && stat.roundTripTime > 0) {
              session.rttSum += stat.roundTripTime;
              session.rttCount++;
            }
          }
        }
      } catch {
        // closed producer 무시
      }
    }

    // Consumer 통계 수집 (델타 기반)
    const consumers = this.manager.consumerManager.getAll();
    for (const consumer of consumers) {
      if (consumer.closed) continue;
      try {
        const consumerStats = await consumer.getStats();
        for (const stat of consumerStats) {
          if (stat.type === "outbound-rtp") {
            const consumerId = consumer.id;
            const prevStats = session.previousConsumerStats.get(consumerId) || {
              byteCount: 0,
            };

            // 델타 계산 (현재값 - 이전값)
            const deltaBytes = (stat.byteCount || 0) - prevStats.byteCount;

            // 양수인 경우에만 누적 (리셋 방지)
            if (deltaBytes > 0) session.totalBytesSent += deltaBytes;

            // 이전 값 저장
            session.previousConsumerStats.set(consumerId, {
              byteCount: stat.byteCount || 0,
            });

            if (typeof stat.roundTripTime === "number" && stat.roundTripTime > 0) {
              session.rttSum += stat.roundTripTime;
              session.rttCount++;
            }
          }
        }
      } catch {
        // closed consumer 무시
      }
    }

    // 메트릭 버퍼에 현재 상태 저장
    session.metricsBuffer.push({
      timestamp: Date.now(),
      transports: stats.transports,
      producers: stats.producers,
      consumers: stats.consumers,
      participants: roomParticipants.length,
    });
  }

  /**
   * 세션 시작 로그 쓰기
   * @param {Object} session - 세션 데이터
   * @private
   */
  _writeSessionStart(session) {
    const timestamp = this._getKoreanTimestamp();
    const content = `========== 세션 시작: ${timestamp} ==========
방 ID: ${session.roomId}
세션 ID: ${session.id}
---

`;
    this._appendToLog(content);
  }

  /**
   * 세션 종료 로그 쓰기 (요약 통계 포함)
   * @param {Object} session - 세션 데이터
   * @private
   */
  _writeSessionEnd(session) {
    const timestamp = this._getKoreanTimestamp();
    const endTime = new Date();
    const durationMs = endTime.getTime() - session.startTime.getTime();
    const durationSec = Math.round(durationMs / 1000);

    // 트래픽 통계 계산
    const totalReceivedMB = (session.totalBytesReceived / 1024 / 1024).toFixed(2);
    const totalSentMB = (session.totalBytesSent / 1024 / 1024).toFixed(2);
    const avgInboundMbps =
      durationMs > 0
        ? ((session.totalBytesReceived * 8) / (durationMs / 1000) / 1000000).toFixed(2)
        : "0.00";
    const avgOutboundMbps =
      durationMs > 0
        ? ((session.totalBytesSent * 8) / (durationMs / 1000) / 1000000).toFixed(2)
        : "0.00";

    // 품질 지표 계산
    const avgJitterMs =
      session.jitterCount > 0 ? (session.jitterSum / session.jitterCount).toFixed(2) : "0.00";
    const avgRtt = session.rttCount > 0 ? (session.rttSum / session.rttCount).toFixed(2) : "0.00";
    const totalPackets = session.packetsReceived + session.packetsLost;
    const packetLossRate =
      totalPackets > 0 ? ((session.packetsLost / totalPackets) * 100).toFixed(2) : "0.00";

    const content = `========== 세션 종료: ${timestamp} ==========
      방 ID: ${session.roomId}
      세션 ID: ${session.id}
      ---
      [세션 요약]
      - 세션 지속 시간: ${durationSec}초
      - 최대 동시 참가자: ${session.maxParticipants}명
      - 최대 동시 Transport: ${session.maxTransports}
      - 최대 동시 Producer: ${session.maxProducers}
      - 최대 동시 Consumer: ${session.maxConsumers}
      [리소스 사용량]
      - 최대 CPU 사용률: ${session.maxCpuPercent}%
      - 최대 메모리 사용량: ${session.maxMemoryMb} MB
      [트래픽 통계]
      - 총 수신: ${totalReceivedMB} MB (평균 ${avgInboundMbps} Mbps)
      - 총 송신: ${totalSentMB} MB (평균 ${avgOutboundMbps} Mbps)
      [품질 지표]
      - 패킷 손실률: ${packetLossRate}%
      - 평균 Jitter: ${avgJitterMs}ms
      - 평균 RTT: ${avgRtt}ms
      ---
      `;
    this._appendToLog(content);
  }

  /**
   * 로그 파일에 append
   * @param {string} content - 로그 내용
   * @private
   */
  _appendToLog(content) {
    const dateStr = this._getKoreanDateString();
    const filename = `traffic-${dateStr}.log`;
    const filepath = path.join(this.logDir, filename);

    try {
      fs.appendFileSync(filepath, content, "utf8");
    } catch (error) {
      console.error(`[RoomTrafficLogger] 로그 파일 쓰기 실패: ${error.message}`);
    }
  }

  /**
   * 모든 세션 종료 (서버 종료 시 호출)
   */
  cleanup() {
    for (const roomId of this.sessions.keys()) {
      this.endSession(roomId);
    }
    console.log("[RoomTrafficLogger] 리소스 정리 완료");
  }
}

export default RoomTrafficLogger;
