"use client";

/**
 * SFUContext
 * SFU 연결 상태 및 Producer/Consumer를 관리하는 Context
 *
 * 설계 의도:
 * - SFUService 인스턴스 관리
 * - Device/Transport 상태 추적
 * - Producer/Consumer 생명주기 관리
 * - 서버 이벤트(sfu:new-producer 등) 처리
 *
 * @see design/client-architecture.md 섹션 3.2
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import SFUService from "@/services/SFUService";
import { useRoomContext } from "./RoomContext";

const SFUContext = createContext(null);

/**
 * SFUProvider 컴포넌트
 * SFU 관련 전역 상태 및 SFUService 인스턴스를 관리
 */
export function SFUProvider({ children }) {
  // ============ 상태 관리 ============

  /** Device 로드 완료 여부 */
  const [isDeviceLoaded, setIsDeviceLoaded] = useState(false);

  /** Send Transport 준비 상태 */
  const [isSendTransportReady, setIsSendTransportReady] = useState(false);

  /** Recv Transport 준비 상태 */
  const [isRecvTransportReady, setIsRecvTransportReady] = useState(false);

  /** 로컬 Producer 목록 (producerId → { kind, paused }) */
  const [localProducers, setLocalProducers] = useState(new Map());

  /**
   * 원격 Producer 정보 맵
   * producerId → { socketId, kind, appData }
   */
  const [remoteProducers, setRemoteProducers] = useState(new Map());

  /**
   * 원격 스트림 맵 (VideoGrid 호환용)
   * socketId → MediaStream (일반 비디오/오디오만)
   */
  const [remoteStreams, setRemoteStreams] = useState(new Map());

  /**
   * 원격 화면 공유 스트림 맵
   * socketId → MediaStream (화면 공유만)
   */
  const [screenShareStreams, setScreenShareStreams] = useState(new Map());

  /** Transport 연결 상태 */
  const [connectionState, setConnectionState] = useState({
    send: "new",
    recv: "new",
  });

  /** SFU 초기화 상태 */
  const [sfuState, setSfuState] = useState("idle"); // 'idle' | 'initializing' | 'ready' | 'error'

  /** 에러 메시지 */
  const [error, setError] = useState(null);

  // ============ Refs ============

  /** SFUService 인스턴스 */
  const sfuServiceRef = useRef(null);

  /** 초기화 진행 중 플래그 (중복 방지) */
  const isInitializingRef = useRef(false);

  // ============ Context 의존성 ============

  const { socketService, isConnected } = useRoomContext();

  // ============ SFUService 인스턴스 초기화 ============

  if (!sfuServiceRef.current) {
    sfuServiceRef.current = new SFUService();
  }

  // ============ 콜백 함수들 ============

  /**
   * Consumer 트랙을 적절한 스트림 맵에 추가
   * - 일반 비디오/오디오: remoteStreams
   * - 화면 공유: screenShareStreams
   * @param {Object} consumer - Consumer 인스턴스
   * @private
   */
  const _addConsumerTrackToStream = useCallback((consumer) => {
    const { track, producerSocketId, appData } = consumer;

    if (!track || !producerSocketId) {
      console.warn("[SFUContext] Consumer에 track 또는 producerSocketId 없음");
      return;
    }

    // 화면 공유 여부 판단
    const isScreenShare = appData?.screenShare === true;
    const targetSetter = isScreenShare ? setScreenShareStreams : setRemoteStreams;
    const streamType = isScreenShare ? "화면 공유" : "일반";

    targetSetter((prev) => {
      const next = new Map(prev);
      let stream = next.get(producerSocketId);

      if (stream) {
        // 기존 스트림에 트랙 추가 (비동기 도착 처리)
        // 같은 kind의 트랙이 있으면 제거 후 추가
        const existingTracks = stream.getTracks().filter((t) => t.kind === track.kind);
        for (const t of existingTracks) {
          stream.removeTrack(t);
          t.stop();
        }
        stream.addTrack(track);
        console.log(
          `[SFUContext] ${streamType} 스트림에 ${track.kind} 트랙 추가: ${producerSocketId}`
        );
      } else {
        // 새 스트림 생성
        stream = new MediaStream([track]);
        next.set(producerSocketId, stream);
        console.log(`[SFUContext] ${streamType} 스트림 생성: ${producerSocketId}, ${track.kind}`);
      }

      return next;
    });
  }, []);

  /**
   * SFU 초기화
   * Device 로드 → Transport 생성
   * @param {string} targetRoomId - 방 ID
   */
  const initializeSFU = useCallback(
    async (targetRoomId) => {
      // 중복 초기화 방지
      if (isInitializingRef.current || sfuState === "ready") {
        console.log("[SFUContext] 이미 초기화 중이거나 완료됨");
        return;
      }

      if (!socketService || !targetRoomId) {
        console.warn("[SFUContext] socketService 또는 roomId가 없음");
        return;
      }

      isInitializingRef.current = true;
      setSfuState("initializing");
      setError(null);

      try {
        const sfuService = sfuServiceRef.current;

        // SocketService 설정
        sfuService.setSocketService(socketService);

        // 이벤트 핸들러 등록
        sfuService.onConnectionStateChange((type, state) => {
          setConnectionState((prev) => ({ ...prev, [type]: state }));
        });

        sfuService.onError((err) => {
          console.error("[SFUContext] SFU 에러:", err);
          setError(err.message);
        });

        sfuService.onProducerCreated((producer) => {
          setLocalProducers((prev) => {
            const next = new Map(prev);
            next.set(producer.id, {
              kind: producer.kind,
              paused: producer.paused,
            });
            return next;
          });
        });

        sfuService.onConsumerCreated((consumer) => {
          // Consumer 트랙을 remoteStreams에 추가
          _addConsumerTrackToStream(consumer);
        });

        // 1. Device 로드
        console.log("[SFUContext] Device 로드 시작");
        await sfuService.loadDevice(targetRoomId);
        setIsDeviceLoaded(true);

        // 2. Send Transport 생성
        console.log("[SFUContext] Send Transport 생성 시작");
        await sfuService.createSendTransport();
        setIsSendTransportReady(true);

        // 3. Recv Transport 생성
        console.log("[SFUContext] Recv Transport 생성 시작");
        await sfuService.createRecvTransport();
        setIsRecvTransportReady(true);

        // 4. 기존 Producer 조회 및 구독
        console.log("[SFUContext] 기존 Producer 조회");
        const existingProducers = await sfuService.getExistingProducers();
        for (const producerInfo of existingProducers) {
          // remoteProducers에 추가
          setRemoteProducers((prev) => {
            const next = new Map(prev);
            next.set(producerInfo.producerId, {
              socketId: producerInfo.producerSocketId,
              kind: producerInfo.kind,
              appData: producerInfo.appData,
            });
            return next;
          });

          // Consumer 생성
          try {
            await sfuService.consume(producerInfo.producerId, producerInfo.producerSocketId);
          } catch (err) {
            console.error("[SFUContext] 기존 Producer 구독 실패:", err);
          }
        }

        setSfuState("ready");
        console.log("[SFUContext] SFU 초기화 완료");
      } catch (err) {
        console.error("[SFUContext] SFU 초기화 실패:", err);
        setSfuState("error");
        setError(err.message);
      } finally {
        isInitializingRef.current = false;
      }
    },
    [socketService, sfuState, _addConsumerTrackToStream]
  );

  /**
   * 로컬 트랙 송신 (Producer 생성)
   * @param {MediaStreamTrack} track - 비디오 또는 오디오 트랙
   * @param {Object} appData - 추가 메타데이터
   * @returns {Promise<Object>} Producer 인스턴스
   */
  const produce = useCallback(
    async (track, appData = {}) => {
      if (sfuState !== "ready") {
        throw new Error("[SFUContext] SFU가 준비되지 않았습니다");
      }

      const sfuService = sfuServiceRef.current;
      return await sfuService.produce(track, appData);
    },
    [sfuState]
  );

  /**
   * 원격 Producer 구독 (Consumer 생성)
   * @param {string} producerId - Producer ID
   * @param {string} producerSocketId - Producer 소유자 Socket ID
   * @returns {Promise<Object>} Consumer 인스턴스
   */
  const consume = useCallback(
    async (producerId, producerSocketId) => {
      if (sfuState !== "ready") {
        throw new Error("[SFUContext] SFU가 준비되지 않았습니다");
      }

      const sfuService = sfuServiceRef.current;
      return await sfuService.consume(producerId, producerSocketId);
    },
    [sfuState]
  );

  /**
   * Producer 일시정지
   * @param {string} producerId - Producer ID
   */
  const pauseProducer = useCallback(
    async (producerId) => {
      if (sfuState !== "ready") return;

      const sfuService = sfuServiceRef.current;
      await sfuService.pauseProducer(producerId);

      setLocalProducers((prev) => {
        const next = new Map(prev);
        const producer = next.get(producerId);
        if (producer) {
          next.set(producerId, { ...producer, paused: true });
        }
        return next;
      });
    },
    [sfuState]
  );

  /**
   * Producer 재개
   * @param {string} producerId - Producer ID
   */
  const resumeProducer = useCallback(
    async (producerId) => {
      if (sfuState !== "ready") return;

      const sfuService = sfuServiceRef.current;
      await sfuService.resumeProducer(producerId);

      setLocalProducers((prev) => {
        const next = new Map(prev);
        const producer = next.get(producerId);
        if (producer) {
          next.set(producerId, { ...producer, paused: false });
        }
        return next;
      });
    },
    [sfuState]
  );

  /**
   * Producer 종료
   * @param {string} producerId - Producer ID
   */
  const closeProducer = useCallback(
    async (producerId) => {
      if (sfuState !== "ready") return;

      const sfuService = sfuServiceRef.current;
      await sfuService.closeProducer(producerId);

      setLocalProducers((prev) => {
        const next = new Map(prev);
        next.delete(producerId);
        return next;
      });
    },
    [sfuState]
  );

  /**
   * 특정 kind의 Producer ID 조회
   * @param {string} kind - 'audio' | 'video'
   * @returns {string|undefined}
   */
  const getProducerIdByKind = useCallback(
    (kind) => {
      for (const [producerId, info] of localProducers.entries()) {
        if (info.kind === kind) {
          return producerId;
        }
      }
      return undefined;
    },
    [localProducers]
  );

  /**
   * 리소스 정리
   */
  const cleanup = useCallback(() => {
    console.log("[SFUContext] 정리 시작");

    const sfuService = sfuServiceRef.current;
    if (sfuService) {
      sfuService.cleanup();
    }

    // 원격 스트림 트랙 정리
    setRemoteStreams((prev) => {
      for (const stream of prev.values()) {
        for (const track of stream.getTracks()) {
          track.stop();
        }
      }
      return new Map();
    });

    // 상태 초기화
    setIsDeviceLoaded(false);
    setIsSendTransportReady(false);
    setIsRecvTransportReady(false);
    setLocalProducers(new Map());
    setRemoteProducers(new Map());
    setConnectionState({ send: "new", recv: "new" });
    setSfuState("idle");
    setError(null);
    isInitializingRef.current = false;

    console.log("[SFUContext] 정리 완료");
  }, []);

  // ============ Socket 이벤트 리스너 ============

  useEffect(() => {
    if (!socketService || !isConnected) return;

    // sfu:new-producer - 새 Producer 알림
    const handleNewProducer = async (data) => {
      const { producerId, producerSocketId, kind, appData } = data;

      console.log("[SFUContext] 새 Producer 알림:", { producerId, producerSocketId, kind });

      // remoteProducers에 추가
      setRemoteProducers((prev) => {
        const next = new Map(prev);
        next.set(producerId, { socketId: producerSocketId, kind, appData });
        return next;
      });

      // SFU 준비 상태일 때만 자동 구독
      if (sfuState === "ready") {
        try {
          const sfuService = sfuServiceRef.current;
          await sfuService.consume(producerId, producerSocketId);
        } catch (err) {
          console.error("[SFUContext] 새 Producer 구독 실패:", err);
        }
      }
    };

    // sfu:producer-closed - Producer 종료 알림
    const handleProducerClosed = (data) => {
      const { producerId, producerSocketId, appData: eventAppData } = data;

      console.log("[SFUContext] Producer 종료 알림:", {
        producerId,
        producerSocketId,
        appData: eventAppData,
      });

      // appData가 이벤트에 없으면 remoteProducers에서 조회 (fallback)
      const producerInfo = remoteProducers.get(producerId);
      const appData = eventAppData || producerInfo?.appData || {};
      const isScreenShare = appData.screenShare === true;

      // remoteProducers에서 제거
      setRemoteProducers((prev) => {
        const next = new Map(prev);
        next.delete(producerId);
        return next;
      });

      // 해당 Consumer 종료
      const sfuService = sfuServiceRef.current;
      const consumer = sfuService?.getConsumerByProducerId(producerId);
      if (consumer) {
        sfuService.closeConsumer(consumer.id);
      }

      // 화면 공유면 screenShareStreams에서만 제거
      if (isScreenShare) {
        console.log("[SFUContext] 화면 공유 스트림 제거:", producerSocketId);
        setScreenShareStreams((prev) => {
          const next = new Map(prev);
          next.delete(producerSocketId);
          return next;
        });
      } else if (consumer) {
        // 일반 비디오/오디오면 remoteStreams에서 해당 트랙만 제거
        setRemoteStreams((prev) => {
          const next = new Map(prev);
          const stream = next.get(producerSocketId);
          if (stream) {
            const tracks = stream.getTracks().filter((t) => t.kind === consumer.kind);
            tracks.forEach((t) => {
              stream.removeTrack(t);
              t.stop();
            });
            // 트랙이 없으면 스트림 제거
            if (stream.getTracks().length === 0) {
              next.delete(producerSocketId);
            }
          }
          return next;
        });
      }
    };

    // sfu:producer-paused
    const handleProducerPaused = (data) => {
      const { producerId, producerSocketId } = data;
      console.log("[SFUContext] Producer 일시정지:", { producerId, producerSocketId });

      setRemoteProducers((prev) => {
        const next = new Map(prev);
        const producer = next.get(producerId);
        if (producer) {
          next.set(producerId, { ...producer, paused: true });
        }
        return next;
      });
    };

    // sfu:producer-resumed
    const handleProducerResumed = (data) => {
      const { producerId, producerSocketId } = data;
      console.log("[SFUContext] Producer 재개:", { producerId, producerSocketId });

      setRemoteProducers((prev) => {
        const next = new Map(prev);
        const producer = next.get(producerId);
        if (producer) {
          next.set(producerId, { ...producer, paused: false });
        }
        return next;
      });
    };

    // room:participant-left - 참가자 퇴장 시 완전 정리
    const handleParticipantLeft = (data) => {
      const socketId = data.socketId || data;
      console.log("[SFUContext] 참가자 퇴장:", socketId);

      // 1. 해당 socketId의 모든 remoteProducers 정리
      setRemoteProducers((prev) => {
        const next = new Map(prev);
        for (const [producerId, info] of next.entries()) {
          if (info.socketId === socketId) {
            next.delete(producerId);
          }
        }
        return next;
      });

      // 2. 해당 socketId의 모든 Consumers 정리
      const sfuService = sfuServiceRef.current;
      if (sfuService) {
        sfuService.closeConsumersBySocketId(socketId);
      }

      // 3. remoteStreams에서 완전 삭제
      setRemoteStreams((prev) => {
        const next = new Map(prev);
        const stream = next.get(socketId);
        if (stream) {
          stream.getTracks().forEach((track) => track.stop());
          next.delete(socketId);
        }
        return next;
      });
    };

    // 이벤트 리스너 등록
    socketService.on("sfu:new-producer", handleNewProducer);
    socketService.on("sfu:producer-closed", handleProducerClosed);
    socketService.on("sfu:producer-paused", handleProducerPaused);
    socketService.on("sfu:producer-resumed", handleProducerResumed);
    socketService.on("room:participant-left", handleParticipantLeft);

    // 정리
    return () => {
      socketService.off("sfu:new-producer", handleNewProducer);
      socketService.off("sfu:producer-closed", handleProducerClosed);
      socketService.off("sfu:producer-paused", handleProducerPaused);
      socketService.off("sfu:producer-resumed", handleProducerResumed);
      socketService.off("room:participant-left", handleParticipantLeft);
    };
  }, [socketService, isConnected, sfuState]);

  // 컴포넌트 언마운트 시 정리
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  // ============ Context Value ============

  const value = {
    // 상태
    isDeviceLoaded,
    isSendTransportReady,
    isRecvTransportReady,
    localProducers,
    remoteProducers,
    remoteStreams,
    screenShareStreams, // 원격 화면 공유 스트림 (socketId → MediaStream)
    connectionState,
    sfuState,
    error,

    // 액션
    initializeSFU,
    produce,
    consume,
    pauseProducer,
    resumeProducer,
    closeProducer,
    getProducerIdByKind,
    cleanup,

    // 서비스 인스턴스 (직접 접근용)
    sfuService: sfuServiceRef.current,
  };

  return <SFUContext.Provider value={value}>{children}</SFUContext.Provider>;
}

/**
 * SFUContext 사용을 위한 커스텀 훅
 * @returns {Object} SFUContext 값
 */
export function useSFUContext() {
  const context = useContext(SFUContext);
  if (!context) {
    throw new Error("useSFUContext는 SFUProvider 내부에서만 사용할 수 있습니다.");
  }
  return context;
}

export default SFUContext;
