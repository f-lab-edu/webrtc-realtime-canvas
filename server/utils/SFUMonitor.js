/**
 * SFUMonitor - mediasoup 리소스 모니터링 클래스
 *
 * 기능:
 * - Worker CPU 사용률 계산 (ru_utime + ru_stime 기반)
 * - Worker 메모리 사용량 (ru_maxrss)
 * - Node.js 힙 메모리 (process.memoryUsage())
 * - 리소스 개수 (routers, transports, producers, consumers)
 * - CSV 파일 자동 생성 및 실시간 출력
 *
 * @see documents/load-testing/design.md
 */

import fs from "node:fs";
import path from "node:path";
import serverLogger from "./logger.js";

class SFUMonitor {
  /**
   * @param {Object} mediasoupManager - MediasoupManager 인스턴스
   * @param {Object} options - 설정 옵션
   * @param {number} [options.intervalMs=1000] - 측정 간격 (밀리초)
   * @param {string} [options.outputDir='./metrics'] - CSV 출력 디렉토리
   * @param {boolean} [options.consoleOutput=true] - 콘솔 출력 여부
   */
  constructor(mediasoupManager, options = {}) {
    // 필수 파라미터 검증
    if (!mediasoupManager) {
      throw new Error("[SFUMonitor] mediasoupManager는 필수입니다.");
    }

    this.manager = mediasoupManager;
    this.intervalMs = options.intervalMs || 1000;
    this.outputDir = options.outputDir || "./metrics";
    this.consoleOutput = options.consoleOutput ?? true;

    // 내부 상태
    this.intervalId = null;
    this.csvStream = null;
    this.csvFilepath = null;
    this.startTime = null;
    this.isRunning = false;

    // CPU 사용률 계산용 이전 값 저장
    // Map<workerId, { utime, stime, timestamp }>
    this.previousResourceUsage = new Map();

    // RTP 비트레이트 계산용 이전 값 저장
    this.previousRtpStats = null;

    serverLogger.info("SFUMonitor", "인스턴스 생성");
  }

  /**
   * 모니터링 시작
   */
  async start() {
    if (this.isRunning) {
      serverLogger.warn("SFUMonitor", "이미 실행 중입니다.");
      return;
    }

    // 출력 디렉토리 생성
    this._ensureOutputDir();

    // CSV 파일 초기화
    this._initCsvFile();

    // 주기적 측정 시작
    this.isRunning = true;
    this.intervalId = setInterval(() => this._collectAndRecord(), this.intervalMs);

    serverLogger.info("SFUMonitor", `모니터링 시작 (간격: ${this.intervalMs}ms)`);
    serverLogger.info("SFUMonitor", `CSV 파일: ${this.csvFilepath}`);
  }

  /**
   * 모니터링 중지
   */
  stop() {
    if (!this.isRunning) {
      return;
    }

    clearInterval(this.intervalId);
    this.intervalId = null;
    this.isRunning = false;

    if (this.csvStream) {
      this.csvStream.end();
      this.csvStream = null;
    }

    serverLogger.info("SFUMonitor", "모니터링 중지");
    serverLogger.info("SFUMonitor", `CSV 파일 저장 완료: ${this.csvFilepath}`);
  }

  /**
   * 출력 디렉토리 생성
   * @private
   */
  _ensureOutputDir() {
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
      serverLogger.info("SFUMonitor", `메트릭 디렉토리 생성: ${this.outputDir}`);
    }
  }

  /**
   * CSV 파일 초기화
   * @private
   */
  _initCsvFile() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `sfu-metrics-${timestamp}.csv`;
    this.csvFilepath = path.join(this.outputDir, filename);

    // CSV 헤더
    const headers = [
      "timestamp",
      "elapsed_ms",
      // Worker 메트릭
      "worker_count",
      "total_cpu_percent",
      "avg_cpu_percent",
      "total_memory_mb",
      // Node.js 메모리
      "node_heap_used_mb",
      "node_heap_total_mb",
      "node_rss_mb",
      // SFU 리소스 개수
      "routers",
      "transports",
      "producers",
      "consumers",
      // RTP 전송량 통계
      "rtp_bytes_received",
      "rtp_bytes_sent",
      "rtp_inbound_bitrate",
      "rtp_outbound_bitrate",
      "rtp_active_producers",
      "rtp_active_consumers",
      // 품질 지표 (QoE)
      "packets_received",
      "packets_sent",
      "packets_lost",
      "packet_loss_rate_percent",
      "avg_jitter_ms",
      "avg_rtt_ms",
      // Worker별 상세 (JSON)
      "worker_details",
    ].join(",");

    this.csvStream = fs.createWriteStream(this.csvFilepath, { flags: "w" });
    this.csvStream.write(headers + "\n");

    this.startTime = Date.now();
  }

  /**
   * 메트릭 수집 및 기록
   * @private
   */
  async _collectAndRecord() {
    try {
      const metrics = await this._collectMetrics();
      this._recordToCsv(metrics);

      if (this.consoleOutput) {
        this._printToConsole(metrics);
      }
    } catch (error) {
      serverLogger.error("SFUMonitor", `메트릭 수집 실패: ${error.message}`);
    }
  }

  /**
   * 모든 메트릭 수집
   * @private
   * @returns {Promise<Object>} 수집된 메트릭
   */
  async _collectMetrics() {
    const timestamp = new Date().toISOString();
    const elapsedMs = Date.now() - this.startTime;

    // 1. Worker 리소스 사용량 수집
    const workerMetrics = await this._collectWorkerMetrics();

    // 2. Node.js 메모리 사용량
    const memUsage = process.memoryUsage();
    const nodeMemory = {
      heapUsedMb: Math.round((memUsage.heapUsed / 1024 / 1024) * 100) / 100,
      heapTotalMb: Math.round((memUsage.heapTotal / 1024 / 1024) * 100) / 100,
      rssMb: Math.round((memUsage.rss / 1024 / 1024) * 100) / 100,
    };

    // 3. SFU 리소스 개수
    const stats = this.manager.getStats();

    // 4. RTP 전송량 수집
    const rtpStats = await this._collectRtpStats();

    return {
      timestamp,
      elapsedMs,
      workerMetrics,
      nodeMemory,
      stats,
      rtpStats,
    };
  }

  /**
   * Worker 리소스 사용량 수집 및 CPU 사용률 계산
   * @private
   * @returns {Promise<Object>} Worker 메트릭
   */
  async _collectWorkerMetrics() {
    const workers = this.manager.workerPoolManager.workers;
    const workerDetails = [];

    let totalCpuPercent = 0;
    let totalMemoryMb = 0;

    for (const worker of workers) {
      if (worker.closed) continue;

      try {
        // worker.getResourceUsage() 호출
        const usage = await worker.getResourceUsage();
        const workerId = worker.pid.toString();
        const now = Date.now();

        // CPU 사용률 계산
        const cpuPercent = this._calculateCpuPercent(workerId, usage.ru_utime, usage.ru_stime, now);

        // 메모리 계산 (ru_maxrss 단위가 플랫폼마다 다름)
        // libuv: Linux/Windows = KB, macOS/BSD = bytes
        // 참고: https://docs.libuv.org/en/v1.x/misc.html
        const isMacOS = process.platform === "darwin";
        const memoryMb = isMacOS
          ? Math.round((usage.ru_maxrss / 1024 / 1024) * 100) / 100  // bytes → MB
          : Math.round((usage.ru_maxrss / 1024) * 100) / 100;        // KB → MB

        totalCpuPercent += cpuPercent;
        totalMemoryMb += memoryMb;

        workerDetails.push({
          pid: worker.pid,
          cpuPercent: Math.round(cpuPercent * 100) / 100,
          memoryMb,
          ruUtime: usage.ru_utime,
          ruStime: usage.ru_stime,
        });
      } catch (error) {
        serverLogger.error("SFUMonitor", `Worker ${worker.pid} 메트릭 수집 실패: ${error.message}`);
      }
    }

    const workerCount = workerDetails.length;
    const avgCpuPercent = workerCount > 0 ? totalCpuPercent / workerCount : 0;

    return {
      workerCount,
      totalCpuPercent: Math.round(totalCpuPercent * 100) / 100,
      avgCpuPercent: Math.round(avgCpuPercent * 100) / 100,
      totalMemoryMb: Math.round(totalMemoryMb * 100) / 100,
      workerDetails,
    };
  }

  /**
   * CPU 사용률 계산 (델타 기반)
   *
   * 계산 공식:
   * CPU% = ((delta_utime + delta_stime) / elapsed_wall_time) * 100
   *
   * @private
   * @param {string} workerId - Worker 식별자 (PID)
   * @param {number} currentUtime - 현재 ru_utime (밀리초, ms)
   * @param {number} currentStime - 현재 ru_stime (밀리초, ms)
   * @param {number} currentTimestamp - 현재 타임스탬프
   * @returns {number} CPU 사용률 (0-100)
   */
  _calculateCpuPercent(workerId, currentUtime, currentStime, currentTimestamp) {
    const previous = this.previousResourceUsage.get(workerId);

    // 현재 값 저장
    this.previousResourceUsage.set(workerId, {
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

    // 경과 시간이 0이면 계산 불가
    if (elapsedWallTime <= 0) {
      return 0;
    }

    // CPU 사용률 계산 (mediasoup이 이미 밀리초로 변환하므로 직접 나눗셈)
    // 참고: Worker.cpp에서 (tv_sec * 1000) + (tv_usec / 1000) 형태로 ms 변환됨
    const cpuPercent = ((deltaUtime + deltaStime) / elapsedWallTime) * 100;

    // 0-100 범위로 클램핑
    return Math.max(0, Math.min(100, cpuPercent));
  }

  /**
   * RTP 전송량 및 품질 통계 수집
   *
   * Producer: 클라이언트 → SFU (bytesReceived, jitter, packetsLost, roundTripTime)
   * Consumer: SFU → 클라이언트 (bytesSent, packetsLost, roundTripTime)
   *
   * @private
   * @returns {Promise<Object>} RTP 통계
   */
  async _collectRtpStats() {
    const producers = this.manager.producerManager.getAll();
    const consumers = this.manager.consumerManager.getAll();
    const now = Date.now();

    let totalBytesReceived = 0;
    let totalBytesSent = 0;
    let activeProducers = 0;
    let activeConsumers = 0;

    // 품질 지표 집계용
    let totalPacketsReceived = 0;
    let totalPacketsSent = 0;
    let totalPacketsLost = 0;
    let jitterSum = 0;
    let jitterCount = 0;
    let rttSum = 0;
    let rttCount = 0;

    // Producer 통계 (서버로 들어오는 RTP)
    for (const producer of producers) {
      if (producer.closed) continue;
      try {
        const stats = await producer.getStats();
        for (const stat of stats) {
          if (stat.type === "inbound-rtp") {
            totalBytesReceived += stat.byteCount || 0;
            totalPacketsReceived += stat.packetCount || 0;
            totalPacketsLost += stat.packetsLost || 0;

            // Jitter (Producer inbound-rtp에서만 제공)
            if (typeof stat.jitter === "number" && stat.jitter >= 0) {
              jitterSum += stat.jitter;
              jitterCount++;
            }

            // RTT (Producer에서 RTCP SR/RR 기반)
            if (typeof stat.roundTripTime === "number" && stat.roundTripTime > 0) {
              rttSum += stat.roundTripTime;
              rttCount++;
            }

            if (stat.byteCount > 0) activeProducers++;
          }
        }
      } catch (e) {
        // closed producer 무시
      }
    }

    // Consumer 통계 (서버에서 나가는 RTP)
    for (const consumer of consumers) {
      if (consumer.closed) continue;
      try {
        const stats = await consumer.getStats();
        for (const stat of stats) {
          if (stat.type === "outbound-rtp") {
            totalBytesSent += stat.byteCount || 0;
            totalPacketsSent += stat.packetCount || 0;

            // Consumer RTT
            if (typeof stat.roundTripTime === "number" && stat.roundTripTime > 0) {
              rttSum += stat.roundTripTime;
              rttCount++;
            }

            if (stat.byteCount > 0) activeConsumers++;
          }
        }
      } catch (e) {
        // closed consumer 무시
      }
    }

    // 비트레이트 계산 (이전 측정치와 비교)
    let inboundBitrate = 0;
    let outboundBitrate = 0;

    if (this.previousRtpStats) {
      const elapsedMs = now - this.previousRtpStats.timestamp;
      if (elapsedMs > 0) {
        const deltaReceived = totalBytesReceived - this.previousRtpStats.bytesReceived;
        const deltaSent = totalBytesSent - this.previousRtpStats.bytesSent;

        // bits per second
        inboundBitrate = (deltaReceived * 8 * 1000) / elapsedMs;
        outboundBitrate = (deltaSent * 8 * 1000) / elapsedMs;
      }
    }

    // 평균 품질 지표 계산
    const avgJitter = jitterCount > 0 ? Math.round((jitterSum / jitterCount) * 100) / 100 : 0;
    const avgRtt = rttCount > 0 ? Math.round((rttSum / rttCount) * 100) / 100 : 0;

    // Packet Loss Rate 계산 (%)
    const totalPackets = totalPacketsReceived + totalPacketsLost;
    const packetLossRate = totalPackets > 0
      ? Math.round((totalPacketsLost / totalPackets) * 10000) / 100  // 소수점 2자리 %
      : 0;

    // 현재 값 저장
    this.previousRtpStats = {
      bytesReceived: totalBytesReceived,
      bytesSent: totalBytesSent,
      timestamp: now,
    };

    return {
      // 기존 전송량 통계
      totalBytesReceived,
      totalBytesSent,
      activeProducers,
      activeConsumers,
      inboundBitrate: Math.round(inboundBitrate),
      outboundBitrate: Math.round(outboundBitrate),
      // 품질 지표 (QoE)
      totalPacketsReceived,
      totalPacketsSent,
      totalPacketsLost,
      packetLossRate,      // % (0-100)
      avgJitter,           // ms
      avgRtt,              // ms
    };
  }

  /**
   * CSV 파일에 기록
   * @private
   * @param {Object} metrics - 수집된 메트릭
   */
  _recordToCsv(metrics) {
    if (!this.csvStream) return;

    const { timestamp, elapsedMs, workerMetrics, nodeMemory, stats, rtpStats } = metrics;

    const row = [
      timestamp,
      elapsedMs,
      workerMetrics.workerCount,
      workerMetrics.totalCpuPercent,
      workerMetrics.avgCpuPercent,
      workerMetrics.totalMemoryMb,
      nodeMemory.heapUsedMb,
      nodeMemory.heapTotalMb,
      nodeMemory.rssMb,
      stats.routers,
      stats.transports,
      stats.producers,
      stats.consumers,
      // RTP 전송량 통계
      rtpStats.totalBytesReceived,
      rtpStats.totalBytesSent,
      rtpStats.inboundBitrate,
      rtpStats.outboundBitrate,
      rtpStats.activeProducers,
      rtpStats.activeConsumers,
      // 품질 지표 (QoE)
      rtpStats.totalPacketsReceived,
      rtpStats.totalPacketsSent,
      rtpStats.totalPacketsLost,
      rtpStats.packetLossRate,
      rtpStats.avgJitter,
      rtpStats.avgRtt,
      // Worker 상세 정보는 JSON 문자열로 저장 (CSV 이스케이프)
      `"${JSON.stringify(workerMetrics.workerDetails).replace(/"/g, '""')}"`,
    ].join(",");

    this.csvStream.write(row + "\n");
  }

  /**
   * 콘솔에 실시간 출력
   * @private
   * @param {Object} metrics - 수집된 메트릭
   */
  _printToConsole(metrics) {
    const { workerMetrics, nodeMemory, stats, rtpStats } = metrics;

    // 경고 체크
    const warnings = [];

    // CPU 경고 (80% 초과)
    if (workerMetrics.totalCpuPercent > 80) {
      warnings.push(`CPU ${workerMetrics.totalCpuPercent}% (경고: 80% 초과)`);
    }

    // 메모리 경고 (3.5GB 초과)
    if (nodeMemory.rssMb > 3500) {
      warnings.push(`메모리 ${nodeMemory.rssMb}MB (경고: 3.5GB 초과)`);
    }

    // RTP 전송이 없는 경우 경고
    if (stats.producers > 0 && rtpStats.activeProducers === 0) {
      warnings.push("RTP 수신 없음 (Producer 존재하나 데이터 없음)");
    }

    // 품질 지표 경고 (QoE)
    // Packet Loss > 1% 주의, > 5% 경고
    if (rtpStats.packetLossRate > 5) {
      warnings.push(`패킷 손실 ${rtpStats.packetLossRate}% (심각: 5% 초과)`);
    } else if (rtpStats.packetLossRate > 1) {
      warnings.push(`패킷 손실 ${rtpStats.packetLossRate}% (주의: 1% 초과)`);
    }

    // Jitter > 30ms 경고
    if (rtpStats.avgJitter > 30) {
      warnings.push(`Jitter ${rtpStats.avgJitter}ms (경고: 30ms 초과)`);
    }

    // RTT > 150ms 경고
    if (rtpStats.avgRtt > 150) {
      warnings.push(`RTT ${rtpStats.avgRtt}ms (경고: 150ms 초과)`);
    }

    const separator = "━".repeat(60);
    const header = `[SFU Monitor] ${new Date().toLocaleTimeString("ko-KR")}`;

    // Worker 메트릭
    const workerLine = `📊 Worker: ${workerMetrics.workerCount}개 | CPU: ${workerMetrics.totalCpuPercent}% | 메모리: ${workerMetrics.totalMemoryMb}MB`;

    // Node.js 메모리
    const nodeLine = `📦 Node.js: Heap ${nodeMemory.heapUsedMb}/${nodeMemory.heapTotalMb}MB | RSS ${nodeMemory.rssMb}MB`;

    // SFU 리소스
    const resourceLine = `🔗 리소스: Router ${stats.routers} | Transport ${stats.transports} | Producer ${stats.producers} | Consumer ${stats.consumers}`;

    // RTP 전송량 통계
    const inMbps = (rtpStats.inboundBitrate / 1000000).toFixed(2);
    const outMbps = (rtpStats.outboundBitrate / 1000000).toFixed(2);
    const rtpLine = `📡 RTP: 수신 ${inMbps} Mbps | 송신 ${outMbps} Mbps | 활성 Producer ${rtpStats.activeProducers}/${stats.producers} | Consumer ${rtpStats.activeConsumers}/${stats.consumers}`;

    // 품질 지표 (QoE)
    const qoeLine = `📈 QoE: 패킷손실 ${rtpStats.packetLossRate}% | Jitter ${rtpStats.avgJitter}ms | RTT ${rtpStats.avgRtt}ms`;

    // Worker별 상세 정보
    let workerDetailLines = "";
    if (workerMetrics.workerDetails.length > 0) {
      workerDetailLines = "\n┌─ Worker 상세";
      for (const worker of workerMetrics.workerDetails) {
        workerDetailLines += `\n│  PID ${worker.pid}: CPU ${worker.cpuPercent}% | 메모리 ${worker.memoryMb}MB`;
      }
      workerDetailLines += "\n└─";
    }

    // 경고 출력
    let warningLine = "";
    if (warnings.length > 0) {
      warningLine = `\n⚠️  경고: ${warnings.join(", ")}`;
    }

    // 전체 메시지 조합
    const fullMessage = `\n${separator}\n${header}\n${separator}\n${workerLine}\n${nodeLine}\n${resourceLine}\n${rtpLine}\n${qoeLine}${workerDetailLines}${warningLine}`;

    serverLogger.info("SFUMonitor", fullMessage);
  }

  /**
   * 현재 스냅샷 반환 (API용)
   * @returns {Promise<Object>} 현재 메트릭 스냅샷
   */
  async getSnapshot() {
    return this._collectMetrics();
  }

  /**
   * CSV 파일 경로 반환
   * @returns {string|null} CSV 파일 경로
   */
  getCsvFilepath() {
    return this.csvFilepath || null;
  }

  /**
   * 모니터링 실행 여부 반환
   * @returns {boolean}
   */
  isMonitoring() {
    return this.isRunning;
  }
}

export default SFUMonitor;
