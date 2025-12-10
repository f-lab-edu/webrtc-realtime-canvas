/**
 * TransportManager 클래스
 * WebRTC Transport 생성/연결/삭제 및 Peer별 Transport 추적
 *
 * 책임:
 * - Transport 생성 및 DTLS 연결
 * - Transport 조회 (캡슐화 개선)
 * - Peer별 Transport 추적
 * - Transport 정리
 *
 * 의존성: 없음 (Router는 파라미터로 전달)
 */

import { webRtcTransportOptions } from "../../config/mediasoupConfig.js";

class TransportManager {
  constructor() {
    /** @type {Map<string, Object>} transportId → Transport */
    this.transports = new Map();

    /** @type {Map<string, Set<string>>} socketId → Set<transportId> */
    this.peerTransports = new Map();

    console.log("[TransportManager] 인스턴스 생성");
  }

  /**
   * WebRTC Transport 생성
   * @param {Object} router Router 인스턴스
   * @param {string} socketId 소켓 ID
   * @returns {Promise<Object>} Transport 인스턴스
   */
  async createWebRtcTransport(router, socketId) {
    if (!router) {
      throw new Error("[TransportManager] router는 필수입니다.");
    }
    if (!socketId) {
      throw new Error("[TransportManager] socketId는 필수입니다.");
    }

    const transport = await router.createWebRtcTransport({
      ...webRtcTransportOptions,
      appData: { socketId },
    });

    // Transport 저장
    this.transports.set(transport.id, transport);

    // peer별 Transport 추적
    if (!this.peerTransports.has(socketId)) {
      this.peerTransports.set(socketId, new Set());
    }
    this.peerTransports.get(socketId).add(transport.id);

    // Transport 이벤트 핸들러
    this._setupTransportEvents(transport);

    console.log(`[TransportManager] Transport 생성: id=${transport.id}, socketId=${socketId}`);

    return transport;
  }

  /**
   * Transport 연결 (DTLS 핸드셰이크)
   * @param {string} transportId Transport ID
   * @param {object} dtlsParameters DTLS 파라미터
   */
  async connectTransport(transportId, dtlsParameters) {
    const transport = this.transports.get(transportId);
    if (!transport) {
      throw new Error(`[TransportManager] Transport를 찾을 수 없습니다: ${transportId}`);
    }

    await transport.connect({ dtlsParameters });
    console.log(`[TransportManager] Transport 연결 완료: ${transportId}`);
  }

  /**
   * Transport 조회 (캡슐화 개선)
   * @param {string} transportId Transport ID
   * @returns {Object|undefined}
   */
  getTransport(transportId) {
    return this.transports.get(transportId);
  }

  /**
   * Peer의 Transport ID 목록 조회 (캡슐화 개선)
   * @param {string} socketId Socket ID
   * @returns {Set<string>|undefined}
   */
  getTransportIdsBySocketId(socketId) {
    return this.peerTransports.get(socketId);
  }

  /**
   * Transport 삭제
   * @param {string} transportId Transport ID
   */
  closeTransport(transportId) {
    const transport = this.transports.get(transportId);
    if (!transport) {
      return;
    }

    // Transport 닫기
    if (!transport.closed) {
      transport.close();
    }

    // 추적 맵에서 제거
    this.transports.delete(transportId);

    // peerTransports에서도 제거
    const socketId = transport.appData?.socketId;
    if (socketId && this.peerTransports.has(socketId)) {
      this.peerTransports.get(socketId).delete(transportId);
    }

    console.log(`[TransportManager] Transport 삭제: ${transportId}`);
  }

  /**
   * Peer의 모든 Transport 삭제
   * @param {string} socketId Socket ID
   */
  closeTransportsBySocketId(socketId) {
    const transportIds = this.peerTransports.get(socketId);
    if (!transportIds) {
      return;
    }

    for (const transportId of transportIds) {
      const transport = this.transports.get(transportId);
      if (transport && !transport.closed) {
        transport.close();
      }
      this.transports.delete(transportId);
    }

    this.peerTransports.delete(socketId);
    console.log(`[TransportManager] socketId=${socketId}의 Transport 모두 삭제`);
  }

  /**
   * Transport 이벤트 핸들러 설정
   * @param {Object} transport Transport 인스턴스
   * @private
   */
  _setupTransportEvents(transport) {
    transport.on("dtlsstatechange", (dtlsState) => {
      if (dtlsState === "closed" || dtlsState === "failed") {
        console.log(`[TransportManager] Transport DTLS ${dtlsState}: ${transport.id}`);
        this.closeTransport(transport.id);
      }
    });

    transport.on("@close", () => {
      // 내부 정리는 closeTransport에서 처리
    });
  }

  /**
   * 닫힌 Transport ID 목록 반환 (고아 리소스 정리용)
   * @returns {string[]}
   */
  getClosedTransportIds() {
    const closedIds = [];
    for (const [transportId, transport] of this.transports.entries()) {
      if (transport.closed) {
        closedIds.push(transportId);
      }
    }
    return closedIds;
  }

  /**
   * Transport 개수 반환
   * @returns {number}
   */
  getTransportCount() {
    return this.transports.size;
  }

  /**
   * 리소스 정리
   */
  cleanup() {
    console.log("[TransportManager] 리소스 정리");

    for (const [transportId, transport] of this.transports.entries()) {
      try {
        if (!transport.closed) {
          transport.close();
        }
      } catch (e) {
        console.warn(`[TransportManager] Transport 정리 에러: ${transportId}`, e);
      }
    }

    this.transports.clear();
    this.peerTransports.clear();

    console.log("[TransportManager] 리소스 정리 완료");
  }
}

export default TransportManager;
