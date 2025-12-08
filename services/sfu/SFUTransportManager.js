/**
 * SFUTransportManager 클래스
 * Send/Recv Transport 생성 및 이벤트 관리
 *
 * 책임:
 * - 송신용/수신용 Transport 생성
 * - Transport 이벤트 핸들러 설정 (connect, produce, connectionstatechange)
 *
 * 의존성:
 * - SFUDeviceManager: Device 인스턴스 필요
 * - SFUSocketAdapter: 서버 통신
 *
 * 핸들러 주입:
 * - onConnectionStateChange(type, state): Transport 연결 상태 변경 콜백
 */

class SFUTransportManager {
  /**
   * @param {SFUDeviceManager} deviceManager - Device Manager
   * @param {SFUSocketAdapter} socketAdapter - Socket 통신 어댑터
   */
  constructor(deviceManager, socketAdapter) {
    if (!deviceManager) {
      throw new Error("[SFUTransportManager] deviceManager는 필수입니다");
    }
    if (!socketAdapter) {
      throw new Error("[SFUTransportManager] socketAdapter는 필수입니다");
    }

    /** @type {SFUDeviceManager} */
    this.deviceManager = deviceManager;

    /** @type {SFUSocketAdapter} */
    this.socketAdapter = socketAdapter;

    /** @type {Object|null} 송신용 Transport */
    this.sendTransport = null;

    /** @type {Object|null} 수신용 Transport */
    this.recvTransport = null;

    /** @type {Function|null} 연결 상태 변경 핸들러 */
    this.onConnectionStateChange = null;

    console.log("[SFUTransportManager] 인스턴스 생성");
  }

  /**
   * 송신용 Transport 생성
   * @returns {Promise<Object>} Transport 파라미터
   */
  async createSendTransport() {
    if (!this.deviceManager.isDeviceLoaded()) {
      throw new Error("[SFUTransportManager] Device가 로드되지 않았습니다");
    }

    try {
      const response = await this.socketAdapter.emitWithAck("sfu:create-send-transport", {
        roomId: this.deviceManager.roomId,
      });

      if (response.error) {
        throw new Error(response.error);
      }

      const { id, iceParameters, iceCandidates, dtlsParameters } = response;

      // Send Transport 생성
      const device = this.deviceManager.getDevice();
      this.sendTransport = device.createSendTransport({
        id,
        iceParameters,
        iceCandidates,
        dtlsParameters,
      });

      // Transport 이벤트 핸들러 등록
      this._setupSendTransportEvents(this.sendTransport);

      console.log("[SFUTransportManager] Send Transport 생성 완료:", id);

      return response;
    } catch (error) {
      console.error("[SFUTransportManager] Send Transport 생성 실패:", error);
      throw error;
    }
  }

  /**
   * 수신용 Transport 생성
   * @returns {Promise<Object>} Transport 파라미터
   */
  async createRecvTransport() {
    if (!this.deviceManager.isDeviceLoaded()) {
      throw new Error("[SFUTransportManager] Device가 로드되지 않았습니다");
    }

    try {
      const response = await this.socketAdapter.emitWithAck("sfu:create-recv-transport", {
        roomId: this.deviceManager.roomId,
      });

      if (response.error) {
        throw new Error(response.error);
      }

      const { id, iceParameters, iceCandidates, dtlsParameters } = response;

      // Recv Transport 생성
      const device = this.deviceManager.getDevice();
      this.recvTransport = device.createRecvTransport({
        id,
        iceParameters,
        iceCandidates,
        dtlsParameters,
      });

      // Transport 이벤트 핸들러 등록
      this._setupRecvTransportEvents(this.recvTransport);

      console.log("[SFUTransportManager] Recv Transport 생성 완료:", id);

      return response;
    } catch (error) {
      console.error("[SFUTransportManager] Recv Transport 생성 실패:", error);
      throw error;
    }
  }

  /**
   * Send Transport 반환
   * @returns {Object|null}
   */
  getSendTransport() {
    return this.sendTransport;
  }

  /**
   * Recv Transport 반환
   * @returns {Object|null}
   */
  getRecvTransport() {
    return this.recvTransport;
  }

  /**
   * Send Transport 이벤트 핸들러 설정
   * @param {Object} transport - Transport 인스턴스
   * @private
   */
  _setupSendTransportEvents(transport) {
    // connect 이벤트: DTLS 핸드셰이크 (수명 주기 동안 한 번만 발생)
    transport.on("connect", async ({ dtlsParameters }, callback, errback) => {
      console.log("[SFUTransportManager] Send Transport connect 이벤트");

      try {
        const response = await this.socketAdapter.emitWithAckRetry("sfu:connect-transport", {
          transportId: transport.id,
          dtlsParameters,
        });

        if (response.error) {
          throw new Error(response.error);
        }

        callback();
        console.log("[SFUTransportManager] Send Transport 연결 완료");
      } catch (error) {
        console.error("[SFUTransportManager] Send Transport 연결 실패:", error);
        errback(error);
      }
    });

    // produce 이벤트: Producer 생성 시 발생
    transport.on("produce", async ({ kind, rtpParameters, appData }, callback, errback) => {
      console.log(`[SFUTransportManager] produce 이벤트: kind=${kind}`);

      try {
        const response = await this.socketAdapter.emitWithAck("sfu:produce", {
          transportId: transport.id,
          kind,
          rtpParameters,
          appData,
        });

        if (response.error) {
          throw new Error(response.error);
        }

        callback({ id: response.id });
        console.log(`[SFUTransportManager] Producer 생성 완료: ${response.id}`);
      } catch (error) {
        console.error("[SFUTransportManager] produce 실패:", error);
        errback(error);
      }
    });

    // connectionstatechange 이벤트
    transport.on("connectionstatechange", (state) => {
      console.log(`[SFUTransportManager] Send Transport 상태 변경: ${state}`);

      if (this.onConnectionStateChange) {
        this.onConnectionStateChange("send", state);
      }

      if (state === "failed") {
        console.error("[SFUTransportManager] Send Transport 연결 실패");
      }
    });
  }

  /**
   * Recv Transport 이벤트 핸들러 설정
   * @param {Object} transport - Transport 인스턴스
   * @private
   */
  _setupRecvTransportEvents(transport) {
    // connect 이벤트: DTLS 핸드셰이크
    transport.on("connect", async ({ dtlsParameters }, callback, errback) => {
      console.log("[SFUTransportManager] Recv Transport connect 이벤트");

      try {
        const response = await this.socketAdapter.emitWithAckRetry("sfu:connect-transport", {
          transportId: transport.id,
          dtlsParameters,
        });

        if (response.error) {
          throw new Error(response.error);
        }

        callback();
        console.log("[SFUTransportManager] Recv Transport 연결 완료");
      } catch (error) {
        console.error("[SFUTransportManager] Recv Transport 연결 실패:", error);
        errback(error);
      }
    });

    // connectionstatechange 이벤트
    transport.on("connectionstatechange", (state) => {
      console.log(`[SFUTransportManager] Recv Transport 상태 변경: ${state}`);

      if (this.onConnectionStateChange) {
        this.onConnectionStateChange("recv", state);
      }

      if (state === "failed") {
        console.error("[SFUTransportManager] Recv Transport 연결 실패");
      }
    });
  }

  /**
   * 리소스 정리
   */
  cleanup() {
    console.log("[SFUTransportManager] 리소스 정리");

    // Send Transport 정리
    if (this.sendTransport) {
      try {
        this.sendTransport.close();
      } catch (e) {
        console.warn("[SFUTransportManager] Send Transport 정리 에러:", e);
      }
      this.sendTransport = null;
    }

    // Recv Transport 정리
    if (this.recvTransport) {
      try {
        this.recvTransport.close();
      } catch (e) {
        console.warn("[SFUTransportManager] Recv Transport 정리 에러:", e);
      }
      this.recvTransport = null;
    }
  }
}

export default SFUTransportManager;
