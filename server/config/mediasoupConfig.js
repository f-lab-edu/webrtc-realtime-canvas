/**
 * mediasoup 설정 파일
 *
 * 설계 의도:
 * - 환경별(개발/운영) 설정 분리를 위한 중앙 설정 파일
 * - 참조: design/server-architecture.md 섹션 5
 *
 * @see https://mediasoup.org/documentation/v3/mediasoup/api/
 */

import os from "node:os";

// 환경 변수
const isProduction = process.env.NODE_ENV === "production";

/**
 * Worker 설정
 * - logLevel: 개발 환경에서는 debug, 운영 환경에서는 warn
 * - rtcMinPort/rtcMaxPort: RTP 미디어 트래픽용 UDP 포트 범위
 */
export const workerSettings = {
  logLevel: isProduction ? "warn" : "debug",
  logTags: [
    "info",
    "ice",
    "dtls",
    "rtp",
    "srtp",
    "rtcp",
    // 'rtx',      // RTX 관련 (필요 시 활성화)
    // 'bwe',      // 대역폭 추정 (필요 시 활성화)
    // 'score',    // 품질 점수 (필요 시 활성화)
    // 'simulcast' // Simulcast 디버깅 (필요 시 활성화)
  ],
  rtcMinPort: 10000,
  rtcMaxPort: 10100,
};

/**
 * Worker 풀 크기
 * - 개발 환경: 1개 (디버깅 용이)
 * - 운영 환경: CPU 코어 수 (성능 최적화)
 */
export const numWorkers = isProduction ? os.cpus().length : 1;

/**
 * Router 설정 - 미디어 코덱
 * - audio/opus: 필수, 고품질 오디오, 모든 브라우저 지원
 * - video/VP8: 필수, 브라우저 호환성 우수
 * - video/VP9: 선택, 더 나은 압축률
 * - video/H264: 선택, Safari 호환성
 */
export const routerOptions = {
  mediaCodecs: [
    {
      kind: "audio",
      mimeType: "audio/opus",
      clockRate: 48000,
      channels: 2,
    },
    {
      kind: "video",
      mimeType: "video/VP8",
      clockRate: 90000,
      parameters: {
        "x-google-start-bitrate": 1000,
      },
    },
    {
      kind: "video",
      mimeType: "video/VP9",
      clockRate: 90000,
      parameters: {
        "profile-id": 2,
        "x-google-start-bitrate": 1000,
      },
    },
    {
      kind: "video",
      mimeType: "video/H264",
      clockRate: 90000,
      parameters: {
        "packetization-mode": 1,
        "profile-level-id": "4d0032",
        "level-asymmetry-allowed": 1,
        "x-google-start-bitrate": 1000,
      },
    },
    {
      kind: "video",
      mimeType: "video/H264",
      clockRate: 90000,
      parameters: {
        "packetization-mode": 1,
        "profile-level-id": "42e01f",
        "level-asymmetry-allowed": 1,
        "x-google-start-bitrate": 1000,
      },
    },
  ],
};

/**
 * WebRTC Transport 설정
 * - listenIps: 개발 환경 127.0.0.1, 운영 환경 공인 IP
 * - enableUdp/enableTcp: UDP 우선, TCP 폴백
 * - initialAvailableOutgoingBitrate: 초기 송신 비트레이트
 */
export const webRtcTransportOptions = {
  listenIps: [
    {
      ip: process.env.MEDIASOUP_LISTEN_IP || "0.0.0.0",
      announcedIp: process.env.MEDIASOUP_ANNOUNCED_IP || "127.0.0.1",
    },
  ],
  // UDP 우선 사용 (실시간 미디어에 적합)
  enableUdp: true,
  enableTcp: true,
  preferUdp: true,
  // 초기 송신 대역폭 (bps)
  initialAvailableOutgoingBitrate: 1000000,
  // Transport 연결 타임아웃 (확정: 15초 - 빠른 실패 감지 우선)
  // 참조: tasks/README.md 확정된 설정값
  iceConsentTimeout: 15,
};

/**
 * Simulcast 인코딩 설정 (확정: 활성화)
 * - 대역폭 적응을 위해 다중 해상도 인코딩
 * - 참조: tasks/README.md 확정된 설정값
 */
export const simulcastEncodings = [
  { rid: "r0", maxBitrate: 100000, scaleResolutionDownBy: 4 },
  { rid: "r1", maxBitrate: 300000, scaleResolutionDownBy: 2 },
  { rid: "r2", maxBitrate: 900000, scaleResolutionDownBy: 1 },
];

/**
 * ICE 재연결 설정 (확정)
 * - 재시도 횟수: 3회 (빠른 에러 표시 우선)
 * - 참조: tasks/README.md 확정된 설정값
 */
export const iceRetryConfig = {
  maxRetries: 3,
  retryDelayMs: 1000,
};

/**
 * 전체 설정 객체 (하위 호환성)
 */
const mediasoupConfig = {
  workerSettings,
  numWorkers,
  routerOptions,
  webRtcTransportOptions,
  simulcastEncodings,
  iceRetryConfig,
};

export default mediasoupConfig;
