/**
 * SFUSocketAdapter 클래스
 * Socket.io 통신 추상화 및 재시도 로직
 *
 * 책임:
 * - SocketService 래핑
 * - Promise 기반 Socket emit with acknowledgment
 * - 재시도 로직 제공
 *
 * 목적:
 * - Socket 통신 로직 중앙화
 * - 재시도 로직 재사용
 * - Mock 테스트 용이성
 */

import { ICE_RETRY_CONFIG } from "./constants.js";

class SFUSocketAdapter {
  constructor() {
    /** @type {Object|null} SocketService 인스턴스 */
    this.socketService = null;

    console.log("[SFUSocketAdapter] 인스턴스 생성");
  }

  /**
   * SocketService 설정
   * @param {Object} socketService - SocketService 인스턴스
   */
  setSocketService(socketService) {
    if (!socketService) {
      throw new Error("[SFUSocketAdapter] socketService는 필수입니다");
    }
    this.socketService = socketService;
    console.log("[SFUSocketAdapter] SocketService 설정 완료");
  }

  /**
   * Socket이 연결되어 있는지 확인
   * @returns {boolean}
   */
  isSocketConnected() {
    return this.socketService?.isSocketConnected();
  }

  /**
   * Socket emit (일반)
   * @param {string} event - 이벤트명
   * @param {Object} data - 데이터
   */
  emit(event, data) {
    if (!this.isSocketConnected()) {
      throw new Error("[SFUSocketAdapter] Socket이 연결되지 않았습니다");
    }

    this.socketService.socket.emit(event, data);
  }

  /**
   * Socket emit with acknowledgment
   * Promise 기반으로 서버 응답을 기다림
   *
   * @param {string} event - 이벤트명
   * @param {Object} data - 데이터
   * @returns {Promise<Object>} 서버 응답
   */
  emitWithAck(event, data) {
    return new Promise((resolve, reject) => {
      if (!this.isSocketConnected()) {
        reject(new Error("[SFUSocketAdapter] Socket이 연결되지 않았습니다"));
        return;
      }

      this.socketService.socket.emit(event, data, (response) => {
        resolve(response);
      });
    });
  }

  /**
   * Socket emit with acknowledgment + 재시도
   * 실패 시 지정된 횟수만큼 재시도
   *
   * @param {string} event - 이벤트명
   * @param {Object} data - 데이터
   * @param {number} [retries] - 재시도 횟수 (기본값: ICE_RETRY_CONFIG.maxRetries)
   * @returns {Promise<Object>} 서버 응답
   */
  async emitWithAckRetry(event, data, retries = ICE_RETRY_CONFIG.maxRetries) {
    let lastError;

    for (let i = 0; i < retries; i++) {
      try {
        const response = await this.emitWithAck(event, data);
        return response;
      } catch (error) {
        lastError = error;
        console.warn(`[SFUSocketAdapter] ${event} 재시도 ${i + 1}/${retries}:`, error.message);

        if (i < retries - 1) {
          await new Promise((resolve) => setTimeout(resolve, ICE_RETRY_CONFIG.retryDelayMs));
        }
      }
    }

    throw lastError;
  }
}

export default SFUSocketAdapter;
