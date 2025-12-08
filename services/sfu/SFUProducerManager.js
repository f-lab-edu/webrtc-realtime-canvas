/**
 * SFUProducerManager 클래스
 * Producer 생성 및 관리 (Simulcast 인코딩 포함)
 *
 * 책임:
 * - Producer 생성 (Simulcast 적용)
 * - Producer 일시정지/재개/종료
 * - Producer 조회 (kind, type 기준)
 *
 * 의존성:
 * - SFUTransportManager: Send Transport 필요
 *
 * 핸들러 주입:
 * - onProducerCreated(producer): Producer 생성 시 호출
 */

import { SIMULCAST_ENCODINGS } from "./constants.js";

class SFUProducerManager {
  /**
   * @param {SFUTransportManager} transportManager - Transport Manager
   */
  constructor(transportManager) {
    if (!transportManager) {
      throw new Error("[SFUProducerManager] transportManager는 필수입니다");
    }

    /** @type {SFUTransportManager} */
    this.transportManager = transportManager;

    /** @type {Map<string, Object>} producerId → Producer 인스턴스 */
    this.producers = new Map();

    /** @type {Function|null} Producer 생성 핸들러 */
    this.onProducerCreated = null;

    console.log("[SFUProducerManager] 인스턴스 생성");
  }

  /**
   * Producer 생성 (미디어 송신)
   * @param {MediaStreamTrack} track - 비디오 또는 오디오 트랙
   * @param {Object} appData - 추가 메타데이터 (예: screenShare 여부)
   * @returns {Promise<Object>} Producer 인스턴스
   */
  async produce(track, appData = {}) {
    if (!track) {
      throw new Error("[SFUProducerManager] track은 필수입니다");
    }

    const sendTransport = this.transportManager.getSendTransport();
    if (!sendTransport) {
      throw new Error("[SFUProducerManager] Send Transport가 생성되지 않았습니다");
    }

    const kind = track.kind;
    const isScreenShare = appData.screenShare === true;

    // 동일 kind + screenShare 타입의 기존 Producer 확인
    // 화면 공유와 일반 비디오는 별도로 관리
    const existingProducer = this._getProducerByKindAndType(kind, isScreenShare);
    if (existingProducer) {
      const typeLabel = isScreenShare ? "화면 공유" : kind;
      console.warn(`[SFUProducerManager] 기존 ${typeLabel} Producer 존재, 교체 진행`);
      await this.closeProducer(existingProducer.id);
    }

    try {
      // Producer 옵션 구성
      const produceOptions = {
        track,
        appData: { ...appData, kind },
      };

      // 비디오인 경우 Simulcast 인코딩 적용
      if (kind === "video" && !appData.screenShare) {
        produceOptions.encodings = SIMULCAST_ENCODINGS;
        produceOptions.codecOptions = {
          videoGoogleStartBitrate: 1000,
        };
        console.log("[SFUProducerManager] Simulcast 인코딩 적용");
      }

      const producer = await sendTransport.produce(produceOptions);

      // Producer 저장
      this.producers.set(producer.id, producer);

      // Producer 이벤트 핸들러
      this._setupProducerEvents(producer);

      // 핸들러 호출
      if (this.onProducerCreated) {
        this.onProducerCreated(producer);
      }

      console.log(`[SFUProducerManager] ${kind} Producer 생성 완료:`, producer.id);

      return producer;
    } catch (error) {
      console.error("[SFUProducerManager] Producer 생성 실패:", error);
      throw error;
    }
  }

  /**
   * Producer 일시정지
   * @param {string} producerId - Producer ID
   */
  async pauseProducer(producerId) {
    const producer = this.producers.get(producerId);
    if (!producer) {
      console.warn(`[SFUProducerManager] Producer를 찾을 수 없음: ${producerId}`);
      return;
    }

    try {
      await producer.pause();
      console.log(`[SFUProducerManager] Producer 일시정지: ${producerId}`);
    } catch (error) {
      console.error("[SFUProducerManager] Producer 일시정지 실패:", error);
      throw error;
    }
  }

  /**
   * Producer 재개
   * @param {string} producerId - Producer ID
   */
  async resumeProducer(producerId) {
    const producer = this.producers.get(producerId);
    if (!producer) {
      console.warn(`[SFUProducerManager] Producer를 찾을 수 없음: ${producerId}`);
      return;
    }

    try {
      await producer.resume();
      console.log(`[SFUProducerManager] Producer 재개: ${producerId}`);
    } catch (error) {
      console.error("[SFUProducerManager] Producer 재개 실패:", error);
      throw error;
    }
  }

  /**
   * Producer 종료
   * @param {string} producerId - Producer ID
   */
  closeProducer(producerId) {
    const producer = this.producers.get(producerId);
    if (!producer) {
      console.warn(`[SFUProducerManager] Producer를 찾을 수 없음: ${producerId}`);
      return;
    }

    try {
      producer.close();
      this.producers.delete(producerId);
      console.log(`[SFUProducerManager] Producer 종료: ${producerId}`);
    } catch (error) {
      console.error("[SFUProducerManager] Producer 종료 실패:", error);
    }
  }

  /**
   * kind로 Producer 조회 (deprecated, getProducerByKindAndType 사용 권장)
   * @param {string} kind - 'audio' | 'video'
   * @returns {Object|undefined}
   */
  getProducerByKind(kind) {
    for (const producer of this.producers.values()) {
      if (producer.kind === kind) {
        return producer;
      }
    }
    return undefined;
  }

  /**
   * kind + screenShare 타입으로 Producer 조회
   * 화면 공유와 일반 비디오를 구분하여 관리
   * @param {string} kind - 'audio' | 'video'
   * @param {boolean} isScreenShare - 화면 공유 여부
   * @returns {Object|undefined}
   */
  getProducerByKindAndType(kind, isScreenShare = false) {
    return this._getProducerByKindAndType(kind, isScreenShare);
  }

  /**
   * 모든 Producer 반환
   * @returns {Map<string, Object>}
   */
  getAllProducers() {
    return this.producers;
  }

  /**
   * Producer 이벤트 핸들러 설정
   * @param {Object} producer - Producer 인스턴스
   * @private
   */
  _setupProducerEvents(producer) {
    producer.on("trackended", () => {
      console.log(`[SFUProducerManager] Producer 트랙 종료: ${producer.id}`);
      this.closeProducer(producer.id);
    });

    producer.on("transportclose", () => {
      console.log(`[SFUProducerManager] Producer Transport 종료: ${producer.id}`);
      this.producers.delete(producer.id);
    });
  }

  /**
   * kind + screenShare 타입으로 Producer 조회
   * @param {string} kind - 'audio' | 'video'
   * @param {boolean} isScreenShare - 화면 공유 여부
   * @returns {Object|undefined}
   * @private
   */
  _getProducerByKindAndType(kind, isScreenShare = false) {
    for (const producer of this.producers.values()) {
      const producerIsScreenShare = producer.appData?.screenShare === true;
      if (producer.kind === kind && producerIsScreenShare === isScreenShare) {
        return producer;
      }
    }
    return undefined;
  }

  /**
   * 리소스 정리
   */
  cleanup() {
    console.log("[SFUProducerManager] 리소스 정리");

    for (const [producerId, producer] of this.producers.entries()) {
      try {
        producer.close();
      } catch (e) {
        console.warn(`[SFUProducerManager] Producer 정리 에러: ${producerId}`, e);
      }
    }
    this.producers.clear();
  }
}

export default SFUProducerManager;
