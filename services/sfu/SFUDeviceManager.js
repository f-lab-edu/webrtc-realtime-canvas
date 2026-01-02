/**
 * SFUDeviceManager 클래스
 * mediasoup-client Device 생명주기 관리
 *
 * 책임:
 * - Device 로드 및 RTP Capabilities 관리
 * - Device 로드 상태 추적
 *
 * 의존성:
 * - SFUSocketAdapter: 서버 통신
 */

import { Device } from "mediasoup-client";

class SFUDeviceManager {
  /**
   * @param {SFUSocketAdapter} socketAdapter - Socket 통신 어댑터
   */
  constructor(socketAdapter) {
    if (!socketAdapter) {
      throw new Error("[SFUDeviceManager] socketAdapter는 필수입니다");
    }

    /** @type {SFUSocketAdapter} */
    this.socketAdapter = socketAdapter;

    /** @type {Device|null} mediasoup-client Device 인스턴스 */
    this.device = null;

    /** @type {string|null} 현재 방 ID */
    this.roomId = null;

    /** @type {boolean} Device 로드 완료 여부 */
    this._isDeviceLoaded = false;

    console.log("[SFUDeviceManager] 인스턴스 생성");
  }

  /**
   * Device 초기화
   * 서버에서 Router RTP Capabilities를 받아 Device 로드
   *
   * @param {string} roomId - 방 ID
   * @returns {Promise<Object>} rtpCapabilities
   */
  async loadDevice(roomId) {
    if (!roomId) {
      throw new Error("[SFUDeviceManager] roomId는 필수입니다");
    }

    this.roomId = roomId;

    try {
      // 서버에서 Router RTP Capabilities 요청
      const response = await this.socketAdapter.emitWithAck("sfu:get-router-rtp-capabilities", {
        roomId,
      });

      if (response.error) {
        throw new Error(response.error);
      }

      const { rtpCapabilities } = response;

      // Device 생성 및 로드
      this.device = new Device();
      await this.device.load({ routerRtpCapabilities: rtpCapabilities });

      this._isDeviceLoaded = true;

      console.log("[SFUDeviceManager] Device 로드 완료", {
        canProduce: {
          video: this.device.canProduce("video"),
          audio: this.device.canProduce("audio"),
        },
      });

      return rtpCapabilities;
    } catch (error) {
      console.error("[SFUDeviceManager] Device 로드 실패:", error);
      this._isDeviceLoaded = false;
      throw error;
    }
  }

  /**
   * Device RTP Capabilities 반환
   * @returns {Object|null}
   */
  getRtpCapabilities() {
    return this.device?.rtpCapabilities || null;
  }

  /**
   * Device 로드 상태 확인
   * @returns {boolean}
   */
  isDeviceLoaded() {
    return this._isDeviceLoaded;
  }

  /**
   * Device 인스턴스 반환
   * @returns {Device|null}
   */
  getDevice() {
    return this.device;
  }

  /**
   * 리소스 정리
   */
  cleanup() {
    console.log("[SFUDeviceManager] 리소스 정리");

    this.device = null;
    this._isDeviceLoaded = false;
    this.roomId = null;
  }
}

export default SFUDeviceManager;
