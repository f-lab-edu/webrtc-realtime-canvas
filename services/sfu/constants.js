/**
 * SFU 공통 상수
 * mediasoup-client 및 SFU 관련 설정 상수 정의
 */

/**
 * Simulcast 인코딩 설정
 * 서버 설정(mediasoupConfig.js)과 동일한 값 사용
 *
 * @type {Array<Object>}
 */
export const SIMULCAST_ENCODINGS = [
  { rid: "r0", maxBitrate: 100000, scaleResolutionDownBy: 4 }, // Low
  { rid: "r1", maxBitrate: 300000, scaleResolutionDownBy: 2 }, // Medium
  { rid: "r2", maxBitrate: 900000, scaleResolutionDownBy: 1 }, // High
];

/**
 * ICE 연결 재시도 설정
 *
 * @type {Object}
 */
export const ICE_RETRY_CONFIG = {
  maxRetries: 3,
  retryDelayMs: 1000,
};
