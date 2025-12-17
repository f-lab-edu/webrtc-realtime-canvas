/**
 * SFU 시그널링 이벤트 핸들러
 *
 * 설계 의도:
 * - SFU 관련 시그널링 이벤트만 분리하여 처리
 * - 모든 이벤트에 `sfu:` 접두사를 붙여 명확한 역할 구분
 * - 기존 room:join/leave 등 방 관리 이벤트는 그대로 유지
 *
 * @see design/server-architecture.md 섹션 3.3
 */

/**
 * SFU 이벤트 핸들러 등록
 * @param {Object} io - Socket.io 서버 인스턴스
 * @param {Object} socket - Socket.io 소켓 인스턴스
 * @param {Object} roomManager - RoomManager 인스턴스
 * @param {Object} mediasoupManager - MediasoupManager 인스턴스
 * @param {Object} [roomTrafficLogger] - RoomTrafficLogger 인스턴스 (선택)
 */
export const registerSfuHandlers = (
  io,
  socket,
  roomManager,
  mediasoupManager,
  roomTrafficLogger = null
) => {
  // 파라미터 검증
  if (!io || !socket || !roomManager || !mediasoupManager) {
    throw new Error("[sfuHandler] 필수 파라미터가 누락되었습니다");
  }

  /**
   * sfu:get-router-rtp-capabilities
   * 클라이언트 Device 초기화에 필요한 코덱 정보 제공
   */
  socket.on("sfu:get-router-rtp-capabilities", async (data, callback) => {
    try {
      const { roomId } = data || {};

      if (!roomId) {
        return callback({ error: "roomId는 필수입니다" });
      }

      // Router 조회 또는 생성
      let router = mediasoupManager.getRouter(roomId);
      if (!router) {
        router = await mediasoupManager.createRouter(roomId);
      }

      console.log(`[sfu:get-router-rtp-capabilities] roomId=${roomId}, socketId=${socket.id}`);

      callback({
        rtpCapabilities: router.rtpCapabilities,
      });
    } catch (error) {
      console.error("[sfu:get-router-rtp-capabilities] 에러:", error);
      callback({ error: error.message });
    }
  });

  /**
   * sfu:create-send-transport
   * 송신용 WebRTC Transport 생성
   */
  socket.on("sfu:create-send-transport", async (data, callback) => {
    try {
      const { roomId } = data || {};

      if (!roomId) {
        return callback({ error: "roomId는 필수입니다" });
      }

      const router = mediasoupManager.getRouter(roomId);
      if (!router) {
        return callback({
          error: "Router가 존재하지 않습니다. 먼저 rtpCapabilities를 요청하세요.",
        });
      }

      const transport = await mediasoupManager.createWebRtcTransport(router, socket.id, roomId);

      // 트래픽 세션 시작 (첫 Transport 생성 시)
      if (roomTrafficLogger && !roomTrafficLogger.hasSession(roomId)) {
        roomTrafficLogger.startSession(roomId);
      }

      console.log(`[sfu:create-send-transport] roomId=${roomId}, transportId=${transport.id}`);

      callback({
        id: transport.id,
        iceParameters: transport.iceParameters,
        iceCandidates: transport.iceCandidates,
        dtlsParameters: transport.dtlsParameters,
      });
    } catch (error) {
      console.error("[sfu:create-send-transport] 에러:", error);
      callback({ error: error.message });
    }
  });

  /**
   * sfu:create-recv-transport
   * 수신용 WebRTC Transport 생성
   */
  socket.on("sfu:create-recv-transport", async (data, callback) => {
    try {
      const { roomId } = data || {};

      if (!roomId) {
        return callback({ error: "roomId는 필수입니다" });
      }

      const router = mediasoupManager.getRouter(roomId);
      if (!router) {
        return callback({
          error: "Router가 존재하지 않습니다. 먼저 rtpCapabilities를 요청하세요.",
        });
      }

      const transport = await mediasoupManager.createWebRtcTransport(router, socket.id, roomId);

      // 트래픽 세션 시작 (첫 Transport 생성 시)
      if (roomTrafficLogger && !roomTrafficLogger.hasSession(roomId)) {
        roomTrafficLogger.startSession(roomId);
      }

      console.log(`[sfu:create-recv-transport] roomId=${roomId}, transportId=${transport.id}`);

      callback({
        id: transport.id,
        iceParameters: transport.iceParameters,
        iceCandidates: transport.iceCandidates,
        dtlsParameters: transport.dtlsParameters,
      });
    } catch (error) {
      console.error("[sfu:create-recv-transport] 에러:", error);
      callback({ error: error.message });
    }
  });

  /**
   * sfu:connect-transport
   * Transport DTLS 연결
   */
  socket.on("sfu:connect-transport", async (data, callback) => {
    try {
      const { transportId, dtlsParameters } = data || {};

      if (!transportId || !dtlsParameters) {
        return callback({ error: "transportId와 dtlsParameters는 필수입니다" });
      }

      await mediasoupManager.connectTransport(transportId, dtlsParameters);

      console.log(`[sfu:connect-transport] transportId=${transportId}`);

      callback({ success: true });
    } catch (error) {
      console.error("[sfu:connect-transport] 에러:", error);
      callback({ error: error.message });
    }
  });

  /**
   * sfu:produce
   * Producer 생성 후 다른 참가자에게 브로드캐스트
   */
  socket.on("sfu:produce", async (data, callback) => {
    try {
      const { transportId, kind, rtpParameters, appData } = data || {};

      if (!transportId || !kind || !rtpParameters) {
        return callback({ error: "transportId, kind, rtpParameters는 필수입니다" });
      }

      const transport = mediasoupManager.getTransport(transportId);
      if (!transport) {
        return callback({ error: `Transport를 찾을 수 없습니다: ${transportId}` });
      }

      const producer = await mediasoupManager.createProducer(
        transport,
        kind,
        rtpParameters,
        appData || {}
      );

      // RoomManager에 producer 정보 등록 (있는 경우)
      const roomId = roomManager.getRoomIdBySocketId(socket.id);
      if (roomId) {
        roomManager.addProducerId(socket.id, producer.id);

        // 같은 방의 다른 참가자들에게 새 Producer 알림
        // appData 포함: 화면공유 여부, 닉네임 등 클라이언트 식별 정보
        socket.to(roomId).emit("sfu:new-producer", {
          producerId: producer.id,
          producerSocketId: socket.id,
          kind: producer.kind,
          appData: producer.appData || {},
        });

        console.log(`[sfu:produce] roomId=${roomId}, producerId=${producer.id}, kind=${kind}`);
      }

      callback({
        id: producer.id,
      });
    } catch (error) {
      console.error("[sfu:produce] 에러:", error);
      callback({ error: error.message });
    }
  });

  /**
   * sfu:pause-producer
   * Producer 일시정지 (음소거, 비디오 끄기)
   */
  socket.on("sfu:pause-producer", async (data, callback) => {
    try {
      const { producerId } = data || {};

      if (!producerId) {
        return callback({ error: "producerId는 필수입니다" });
      }

      await mediasoupManager.pauseProducer(producerId);

      // 방의 다른 참가자들에게 알림
      const roomId = roomManager.getRoomIdBySocketId(socket.id);
      if (roomId) {
        socket.to(roomId).emit("sfu:producer-paused", {
          producerId,
          producerSocketId: socket.id,
        });
      }

      console.log(`[sfu:pause-producer] producerId=${producerId}`);

      callback({ success: true });
    } catch (error) {
      console.error("[sfu:pause-producer] 에러:", error);
      callback({ error: error.message });
    }
  });

  /**
   * sfu:resume-producer
   * Producer 재개
   */
  socket.on("sfu:resume-producer", async (data, callback) => {
    try {
      const { producerId } = data || {};

      if (!producerId) {
        return callback({ error: "producerId는 필수입니다" });
      }

      await mediasoupManager.resumeProducer(producerId);

      // 방의 다른 참가자들에게 알림
      const roomId = roomManager.getRoomIdBySocketId(socket.id);
      if (roomId) {
        socket.to(roomId).emit("sfu:producer-resumed", {
          producerId,
          producerSocketId: socket.id,
        });
      }

      console.log(`[sfu:resume-producer] producerId=${producerId}`);

      callback({ success: true });
    } catch (error) {
      console.error("[sfu:resume-producer] 에러:", error);
      callback({ error: error.message });
    }
  });

  /**
   * sfu:close-producer
   * Producer 종료
   */
  socket.on("sfu:close-producer", async (data, callback) => {
    try {
      const { producerId } = data || {};

      if (!producerId) {
        return callback({ error: "producerId는 필수입니다" });
      }

      // Producer 정보를 종료 전에 조회 (appData 포함)
      const producer = mediasoupManager.getProducer(producerId);
      const producerKind = producer?.kind;
      const producerAppData = producer?.appData || {};

      mediasoupManager.closeProducer(producerId);

      // RoomManager에서 producer 정보 제거
      roomManager.removeProducerId(socket.id, producerId);

      // 방의 다른 참가자들에게 알림 (appData 포함)
      const roomId = roomManager.getRoomIdBySocketId(socket.id);
      if (roomId) {
        socket.to(roomId).emit("sfu:producer-closed", {
          producerId,
          producerSocketId: socket.id,
          kind: producerKind,
          appData: producerAppData, // 화면 공유 여부 등 메타데이터 전달
        });
      }

      console.log(
        `[sfu:close-producer] producerId=${producerId}, appData=${JSON.stringify(producerAppData)}`
      );

      callback({ success: true });
    } catch (error) {
      console.error("[sfu:close-producer] 에러:", error);
      callback({ error: error.message });
    }
  });

  /**
   * sfu:consume
   * Consumer 생성 (다른 참가자의 미디어 수신)
   */
  socket.on("sfu:consume", async (data, callback) => {
    try {
      const { roomId, producerId, rtpCapabilities } = data || {};

      if (!roomId || !producerId || !rtpCapabilities) {
        return callback({ error: "roomId, producerId, rtpCapabilities는 필수입니다" });
      }

      const router = mediasoupManager.getRouter(roomId);
      if (!router) {
        return callback({ error: "Router가 존재하지 않습니다" });
      }

      // canConsume 검증은 MediasoupManager에서 수행
      // 수신용 Transport 찾기 (해당 socketId의 Transport 중 하나 사용)
      const peerTransportIds = mediasoupManager.getTransportIdsBySocketId(socket.id);
      if (!peerTransportIds || peerTransportIds.size === 0) {
        return callback({
          error: "수신용 Transport가 없습니다. 먼저 create-recv-transport를 호출하세요.",
        });
      }

      // peerTransportIds 중 하나를 사용 (일반적으로 recv transport)
      // 클라이언트에서 transportId를 명시적으로 전달하는 방식으로 개선 가능
      let recvTransport = null;
      for (const transportId of peerTransportIds) {
        const transport = mediasoupManager.getTransport(transportId);
        // Send transport에는 이미 producer가 있으므로, producer가 없는 transport를 recv로 간주
        if (transport && transport.appData?.socketId === socket.id) {
          recvTransport = transport;
          break;
        }
      }

      if (!recvTransport) {
        return callback({ error: "수신용 Transport를 찾을 수 없습니다" });
      }

      const consumer = await mediasoupManager.createConsumer(
        router,
        recvTransport,
        producerId,
        rtpCapabilities
      );

      console.log(
        `[sfu:consume] roomId=${roomId}, consumerId=${consumer.id}, producerId=${producerId}`
      );

      callback({
        id: consumer.id,
        producerId: consumer.producerId,
        kind: consumer.kind,
        rtpParameters: consumer.rtpParameters,
      });
    } catch (error) {
      console.error("[sfu:consume] 에러:", error);
      callback({ error: error.message });
    }
  });

  /**
   * sfu:consume-with-transport
   * Consumer 생성 (transportId 명시적 지정)
   */
  socket.on("sfu:consume-with-transport", async (data, callback) => {
    try {
      const { roomId, transportId, producerId, rtpCapabilities } = data || {};

      if (!roomId || !transportId || !producerId || !rtpCapabilities) {
        return callback({
          error: "roomId, transportId, producerId, rtpCapabilities는 필수입니다",
        });
      }

      const router = mediasoupManager.getRouter(roomId);
      if (!router) {
        return callback({ error: "Router가 존재하지 않습니다" });
      }

      const transport = mediasoupManager.getTransport(transportId);
      if (!transport) {
        return callback({ error: `Transport를 찾을 수 없습니다: ${transportId}` });
      }

      const consumer = await mediasoupManager.createConsumer(
        router,
        transport,
        producerId,
        rtpCapabilities
      );

      // Producer의 appData 조회 (화면 공유 여부 등)
      const producer = mediasoupManager.getProducer(producerId);
      const producerAppData = producer?.appData || {};

      console.log(
        `[sfu:consume-with-transport] roomId=${roomId}, consumerId=${consumer.id}, producerId=${producerId}, appData=${JSON.stringify(producerAppData)}`
      );

      callback({
        id: consumer.id,
        producerId: consumer.producerId,
        kind: consumer.kind,
        rtpParameters: consumer.rtpParameters,
        appData: producerAppData, // 화면 공유 여부 등 Producer 메타데이터 전달
      });
    } catch (error) {
      console.error("[sfu:consume-with-transport] 에러:", error);
      callback({ error: error.message });
    }
  });

  /**
   * sfu:resume-consumer
   * Consumer 재개 (Consumer는 기본 일시정지 상태로 생성됨)
   */
  socket.on("sfu:resume-consumer", async (data, callback) => {
    try {
      const { consumerId } = data || {};

      if (!consumerId) {
        return callback({ error: "consumerId는 필수입니다" });
      }

      await mediasoupManager.resumeConsumer(consumerId);

      console.log(`[sfu:resume-consumer] consumerId=${consumerId}`);

      callback({ success: true });
    } catch (error) {
      console.error("[sfu:resume-consumer] 에러:", error);
      callback({ error: error.message });
    }
  });

  /**
   * sfu:get-producers
   * 방의 다른 참가자들의 Producer 목록 조회
   * 응답 구조: sfu:new-producer와 동일하게 { producerId, socketId, kind, appData }
   */
  socket.on("sfu:get-producers", (data, callback) => {
    try {
      const { roomId } = data || {};

      if (!roomId) {
        return callback({ error: "roomId는 필수입니다" });
      }

      // RoomManager에서 기본 Producer 목록 조회
      const basicProducers = roomManager.getProducersInRoom(roomId, socket.id);

      // MediasoupManager에서 Producer 상세 정보(kind, appData) 조회하여 응답 구조 통일
      const producers = basicProducers.map((item) => {
        const producer = mediasoupManager.getProducer(item.producerId);
        return {
          producerId: item.producerId,
          producerSocketId: item.socketId,
          kind: producer?.kind || "unknown",
          appData: producer?.appData || {},
        };
      });

      console.log(`[sfu:get-producers] roomId=${roomId}, count=${producers.length}`);

      callback({ producers });
    } catch (error) {
      console.error("[sfu:get-producers] 에러:", error);
      callback({ error: error.message });
    }
  });

  /**
   * disconnect 이벤트 시 SFU 리소스 정리
   * roomHandler의 disconnect와 별도로 SFU 리소스만 정리
   *
   * prependListener 사용: roomHandler보다 먼저 실행되어야
   * roomId 조회 및 세션 종료가 정상 동작함
   */
  socket.prependListener("disconnect", () => {
    // 세션 종료 검사 (리소스 정리 전에 roomId 조회)
    const roomId = roomManager.getRoomIdBySocketId(socket.id);

    console.log(`[sfuHandler:disconnect] SFU 리소스 정리: ${socket.id}`);
    mediasoupManager.cleanupPeer(socket.id);

    // 방에 남은 참가자가 없으면 세션 종료
    if (roomId && roomTrafficLogger && roomTrafficLogger.hasSession(roomId)) {
      const remaining = roomManager.getRoomParticipants(roomId);
      // 자신 제외 (아직 RoomManager에서 제거 안 됐을 수 있음)
      const othersCount = remaining.filter((id) => id !== socket.id).length;
      if (othersCount === 0) {
        roomTrafficLogger.endSession(roomId);
      }
    }
  });
};

export default registerSfuHandlers;
