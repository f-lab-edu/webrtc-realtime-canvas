import SimplePeer from "simple-peer";

/**
 * WebRTCService 클래스
 * SimplePeer를 사용한 WebRTC P2P Mesh 연결 관리
 *
 * P2P Mesh 아키텍처:
 * - 각 참가자는 다른 모든 참가자와 1:1 Peer 연결을 맺음
 * - peers Map으로 다중 Peer 인스턴스 관리 (Map<socketId, SimplePeer>)
 * - pendingSignals Map으로 Early Candidates 문제 해결
 */
class WebRTCService {
  constructor() {
    // P2P Mesh를 위한 다중 Peer 관리
    this.peers = new Map(); // Map<socketId, SimplePeer>
    this.pendingSignals = new Map(); // Map<socketId, Signal[]> - Early Candidates 문제 해결

    this.localStream = null;

    // 이벤트 핸들러 저장 (각 socketId별로 호출됨)
    this.handlers = {
      signal: null, // (socketId, signal) => void
      stream: null, // (socketId, stream) => void
      error: null, // (socketId, error) => void
      close: null, // (socketId) => void
      connect: null, // (socketId) => void
      iceStateChange: null, // (socketId, state) => void - High priority
    };
  }

  /**
   * 특정 참가자와의 Peer 연결 초기화
   * @param {string} socketId - 연결할 상대방의 소켓 ID
   * @param {boolean} initiator - offer를 생성하는 측인지 여부
   * @param {MediaStream|null} stream - 로컬 미디어 스트림 (optional, 시청자 모드면 null 가능)
   * @param {Object} config - STUN/TURN 서버 설정 (선택적)
   */
  initializePeer(socketId, initiator, stream, config = {}) {
    try {
      // 이미 존재하는 Peer는 정리
      if (this.peers.has(socketId)) {
        console.warn(`[WebRTCService] 기존 Peer 존재 (${socketId}), 재생성`);
        this.removePeer(socketId);
      }

      // stream이 null이면 빈 MediaStream 생성 (시청자 모드 지원)
      if (!stream) {
        console.log("⚠️ [WebRTCService] stream이 null, 빈 MediaStream 생성 (시청자 모드)");
        this.localStream = new MediaStream();
      } else {
        this.localStream = stream;
      }

      // 환경 변수에서 STUN/TURN 서버 설정 가져오기
      const iceServers = [];

      // STUN 서버 추가
      const stunServer = process.env.NEXT_PUBLIC_STUN_SERVER;
      if (stunServer) {
        iceServers.push({ urls: stunServer });
      }

      // TURN 서버 추가 (선택적)
      const turnServer = process.env.NEXT_PUBLIC_TURN_SERVER;
      if (turnServer) {
        const turnConfig = { urls: turnServer };

        const turnUsername = process.env.NEXT_PUBLIC_TURN_USERNAME;
        const turnCredential = process.env.NEXT_PUBLIC_TURN_CREDENTIAL;

        if (turnUsername && turnCredential) {
          turnConfig.username = turnUsername;
          turnConfig.credential = turnCredential;
        }

        iceServers.push(turnConfig);
      }

      // 기본 STUN 서버 설정 (환경 변수가 없을 경우)
      const defaultConfig = {
        iceServers:
          iceServers.length > 0
            ? iceServers
            : [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }],
      };

      // 로컬 스트림 트랙 확인
      const audioTracks = this.localStream.getAudioTracks();
      const videoTracks = this.localStream.getVideoTracks();
      const hasStream = stream !== null;

      console.log(`[WebRTCService] Peer 초기화 - ${socketId} (hasStream: ${hasStream})`);
      console.log(`   - initiator: ${initiator}`);
      console.log(
        `   - 비디오: ${videoTracks.length}개`,
        videoTracks.map((t) => `${t.label} (enabled: ${t.enabled})`)
      );
      console.log(
        `   - 오디오: ${audioTracks.length}개`,
        audioTracks.map((t) => `${t.label} (enabled: ${t.enabled})`)
      );

      if (!hasStream) {
        console.log(`ℹ️ [WebRTCService] 시청자 모드로 WebRTC 연결 시작 (빈 스트림)`);
      }

      // 개발 환경 체크
      const isDevelopment = process.env.NODE_ENV === "development";

      // SimplePeer 인스턴스 생성
      const peer = new SimplePeer({
        initiator,
        stream: this.localStream,
        // 개발 환경: trickle false (안정성 우선)
        // 프로덕션: trickle true (성능 우선)
        trickle: !isDevelopment,
        config: config.iceServers ? config : defaultConfig,
      });

      console.log(
        `[WebRTCService] SimplePeer 생성 완료 - 환경: ${isDevelopment ? "개발" : "프로덕션"}, trickle: ${!isDevelopment}`
      );

      // peers Map에 저장
      this.peers.set(socketId, peer);

      // ICE/Connection 상태 모니터링 설정 플래그
      let isMonitoringSetup = false;

      // 시그널 이벤트 (SDP offer/answer, ICE candidate)
      peer.on("signal", (signal) => {
        console.log(`[WebRTCService] 시그널 생성 - ${socketId}:`, signal.type || "candidate");

        // 첫 signal 이벤트 시 _pc 모니터링 설정
        if (!isMonitoringSetup && peer._pc) {
          console.log(`🎯 [WebRTCService] ${socketId} ICE/Connection 모니터링 설정 시작`);

          // ICE Connection State 모니터링
          peer._pc.oniceconnectionstatechange = () => {
            const state = peer._pc.iceConnectionState;
            console.log(`🧊 [WebRTCService] ${socketId} ICE Connection State: ${state}`);

            // iceStateChange 핸들러 호출 (High priority)
            if (this.handlers.iceStateChange) {
              this.handlers.iceStateChange(socketId, state);
            }

            if (state === "failed") {
              console.error(`❌ [WebRTCService] ${socketId} ICE Connection Failed - TURN 서버 필요할 수 있음`);
            }
          };

          // RTCPeerConnection State 모니터링
          peer._pc.onconnectionstatechange = () => {
            const state = peer._pc.connectionState;
            console.log(`🔗 [WebRTCService] ${socketId} RTCPeerConnection State: ${state}`);

            if (state === "connected") {
              console.log(`✅ [WebRTCService] ${socketId} Peer Connection Established`);

              if (this.handlers.connect) {
                console.log(`🎬 [WebRTCService] ${socketId} connect 핸들러 호출`);
                this.handlers.connect(socketId);
              } else {
                console.log(`⚠️ [WebRTCService] ${socketId} connect 핸들러 미등록`);
              }
            }

            if (state === "failed" || state === "disconnected" || state === "closed") {
              console.error(`❌ [WebRTCService] ${socketId} RTCPeerConnection State: ${state}`);
              if (this.handlers.close) {
                this.handlers.close(socketId);
              }
            }
          };

          isMonitoringSetup = true;
          console.log(`✅ [WebRTCService] ${socketId} ICE/Connection 모니터링 설정 완료`);
        }

        // 시그널 핸들러 호출
        if (this.handlers.signal) {
          this.handlers.signal(socketId, signal);
        }
      });

      // 원격 스트림 수신 이벤트
      peer.on("stream", (stream) => {
        console.log(`\n========== [WebRTCService] ${socketId} peer.on('stream') ==========`);
        console.log(`⏰ 타임스탬프: ${new Date().toISOString()}`);
        console.log(`🆔 Stream ID: ${stream.id}`);
        console.log(`📊 Stream 상태: active=${stream.active}`);

        // 트랙 정보 로깅
        const audioTracks = stream.getAudioTracks();
        const videoTracks = stream.getVideoTracks();

        console.log(`\n🎥 비디오 트랙: ${videoTracks.length}개`);
        videoTracks.forEach((t, i) => {
          console.log(`   [${i}] ${t.label} (id: ${t.id}, enabled: ${t.enabled}, muted: ${t.muted})`);
        });

        console.log(`\n🎵 오디오 트랙: ${audioTracks.length}개`);
        audioTracks.forEach((t, i) => {
          console.log(`   [${i}] ${t.label} (id: ${t.id}, enabled: ${t.enabled}, muted: ${t.muted})`);
        });

        // 비디오 트랙이 muted 상태면 unmute 대기
        if (videoTracks.length > 0 && videoTracks[0].muted) {
          const videoTrack = videoTracks[0];
          console.log(`⏳ [WebRTCService] ${socketId} 비디오 트랙 muted, unmute 대기 중...`);

          const handleUnmute = () => {
            console.log(`🔊 [WebRTCService] ${socketId} 비디오 트랙 unmute됨, 핸들러 호출`);
            if (this.handlers.stream) {
              this.handlers.stream(socketId, stream);
            }
          };

          videoTrack.addEventListener("unmute", handleUnmute, { once: true });

          // 3초 타임아웃
          setTimeout(() => {
            if (videoTrack.muted) {
              console.log(`⚠️ [WebRTCService] ${socketId} Unmute 타임아웃 (3초), 강제 전달`);
              videoTrack.removeEventListener("unmute", handleUnmute);
            }
            if (this.handlers.stream) {
              this.handlers.stream(socketId, stream);
            }
          }, 3000);
        } else {
          // 이미 unmuted이거나 비디오 트랙 없으면 즉시 전달
          console.log(`✅ [WebRTCService] ${socketId} 비디오 트랙 이미 unmuted, 즉시 전달`);
          if (this.handlers.stream) {
            this.handlers.stream(socketId, stream);
          }
        }

        // peer.on('stream')을 P2P 연결 완료 신호로 사용
        console.log(`🎬 [WebRTCService] ${socketId} peer.on('stream') 수신 = P2P 연결 완료`);

        if (this.handlers.connect) {
          console.log(`✅ [WebRTCService] ${socketId} connect 핸들러 호출 (stream 기반)`);
          this.handlers.connect(socketId);
        }

        console.log(`========== [WebRTCService] ${socketId} peer.on('stream') 종료 ==========\n`);
      });

      // 연결 성공 이벤트
      peer.on("connect", () => {
        console.log(`[WebRTCService] ${socketId} WebRTC P2P 연결 성공`);
        if (this.handlers.connect) {
          this.handlers.connect(socketId);
        }
      });

      // 에러 이벤트
      peer.on("error", (error) => {
        console.error(`[WebRTCService] ${socketId} WebRTC 에러:`, error);
        if (this.handlers.error) {
          this.handlers.error(socketId, error);
        }
      });

      // 연결 종료 이벤트
      peer.on("close", () => {
        console.log(`[WebRTCService] ${socketId} WebRTC 연결 종료`);
        if (this.handlers.close) {
          this.handlers.close(socketId);
        }
      });

      console.log(`[WebRTCService] Peer 초기화 완료 - ${socketId} (initiator: ${initiator})`);

      // 대기 중인 시그널이 있으면 flush
      this.flushPendingSignals(socketId);
    } catch (error) {
      console.error(`[WebRTCService] Peer 초기화 에러 - ${socketId}:`, error);
      throw error;
    }
  }

  /**
   * 상대방의 시그널 데이터 처리 (SDP offer/answer, ICE candidate)
   * Early Candidates 문제 해결: peer 미존재 시 pendingSignals에 큐잉
   *
   * @param {string} socketId - 시그널을 보낸 상대방의 소켓 ID
   * @param {Object} signalData - SimplePeer 시그널 데이터
   */
  signal(socketId, signalData) {
    const peer = this.peers.get(socketId);

    if (!peer) {
      // Peer가 아직 생성되지 않았으면 pendingSignals에 큐잉 (Early Candidates 해결)
      console.warn(
        `[WebRTCService] Peer 미존재 (${socketId}), pendingSignals에 큐잉:`,
        signalData.type || "candidate"
      );

      if (!this.pendingSignals.has(socketId)) {
        this.pendingSignals.set(socketId, []);
      }
      this.pendingSignals.get(socketId).push(signalData);
      return;
    }

    try {
      peer.signal(signalData);
      console.log(`[WebRTCService] 시그널 처리 완료 - ${socketId}:`, signalData.type || "candidate");
    } catch (error) {
      console.error(`[WebRTCService] 시그널 처리 에러 - ${socketId}:`, error);
      throw error;
    }
  }

  /**
   * 대기 중인 시그널 flush (Peer 생성 후 호출)
   * @param {string} socketId - flush할 socketId
   */
  flushPendingSignals(socketId) {
    const pendingSignals = this.pendingSignals.get(socketId);

    if (!pendingSignals || pendingSignals.length === 0) {
      return;
    }

    const peer = this.peers.get(socketId);
    if (!peer) {
      console.warn(`[WebRTCService] flushPendingSignals: Peer 미존재 (${socketId})`);
      return;
    }

    console.log(`[WebRTCService] Pending signals flush 시작 - ${socketId} (${pendingSignals.length}개)`);

    try {
      // 큐에 쌓인 시그널 순차 처리
      for (const signal of pendingSignals) {
        peer.signal(signal);
        console.log(`   - 처리: ${signal.type || "candidate"}`);
      }

      console.log(`[WebRTCService] Pending signals flush 완료 - ${socketId}`);
    } catch (error) {
      console.error(`[WebRTCService] Pending signals flush 에러 - ${socketId}:`, error);
    } finally {
      // 처리 후 큐 초기화
      this.pendingSignals.delete(socketId);
    }
  }

  /**
   * 특정 Peer 제거 및 리소스 정리
   * try-finally 패턴으로 리소스 정리 보장
   *
   * @param {string} socketId - 제거할 Peer의 소켓 ID
   */
  removePeer(socketId) {
    try {
      const peer = this.peers.get(socketId);
      if (peer) {
        console.log(`[WebRTCService] Peer 제거 시작 - ${socketId}`);
        peer.destroy();
        console.log(`[WebRTCService] Peer destroy 완료 - ${socketId}`);
      }
    } catch (error) {
      console.error(`[WebRTCService] Peer 제거 에러 - ${socketId}:`, error);
    } finally {
      // 에러 발생해도 Map에서 제거 보장
      this.peers.delete(socketId);
      this.pendingSignals.delete(socketId);
      console.log(`[WebRTCService] Peer 리소스 정리 완료 - ${socketId}`);
    }
  }

  /**
   * 모든 Peer 연결 종료 및 리소스 정리
   */
  destroyAll() {
    console.log(`[WebRTCService] 모든 Peer 제거 시작 (${this.peers.size}개)`);

    for (const socketId of this.peers.keys()) {
      this.removePeer(socketId);
    }

    this.peers.clear();
    this.pendingSignals.clear();
    this.localStream = null;

    console.log(`[WebRTCService] 모든 Peer 제거 완료`);
  }

  /**
   * 모든 Peer에 새로운 미디어 트랙 전송 (화면 공유용)
   * @param {MediaStreamTrack} newTrack - 새로운 트랙 (화면 공유 트랙)
   */
  replaceTrack(newTrack) {
    console.log(`[WebRTCService] 모든 Peer에 트랙 교체 시작 (${this.peers.size}개)`);

    let successCount = 0;
    let failCount = 0;

    for (const [socketId, peer] of this.peers.entries()) {
      try {
        if (!peer._pc) {
          console.warn(`[WebRTCService] ${socketId} - Peer._pc 미존재, 스킵`);
          failCount++;
          continue;
        }

        // 비디오 트랙을 전송하는 Sender 찾기
        const sender = peer._pc.getSenders().find((s) => s.track && s.track.kind === newTrack.kind);

        if (sender) {
          sender.replaceTrack(newTrack);
          console.log(`[WebRTCService] ${socketId} - 트랙 교체 완료`);
          successCount++;
        } else {
          console.warn(`[WebRTCService] ${socketId} - 교체할 ${newTrack.kind} Sender 없음`);
          failCount++;
        }
      } catch (error) {
        console.error(`[WebRTCService] ${socketId} - 트랙 교체 에러:`, error);
        failCount++;
      }
    }

    console.log(`[WebRTCService] 트랙 교체 완료 - 성공: ${successCount}, 실패: ${failCount}`);
  }

  /**
   * 현재 전송 중인 비디오 트랙 가져오기 (첫 번째 Peer 기준)
   * @returns {MediaStreamTrack|null}
   */
  getCurrentVideoTrack() {
    const firstPeer = this.peers.values().next().value;
    if (!firstPeer || !firstPeer._pc) {
      return null;
    }

    const sender = firstPeer._pc.getSenders().find((s) => s.track && s.track.kind === "video");
    return sender ? sender.track : null;
  }

  /**
   * 현재 전송 중인 오디오 트랙 가져오기 (첫 번째 Peer 기준)
   * @returns {MediaStreamTrack|null}
   */
  getCurrentAudioTrack() {
    const firstPeer = this.peers.values().next().value;
    if (!firstPeer || !firstPeer._pc) {
      return null;
    }

    const sender = firstPeer._pc.getSenders().find((s) => s.track && s.track.kind === "audio");
    return sender ? sender.track : null;
  }

  /**
   * 특정 Peer의 연결 상태 확인
   * @param {string} socketId - 확인할 Peer의 소켓 ID
   * @returns {string|null} - 연결 상태 ('connected', 'connecting', 'disconnected' 등)
   */
  getConnectionState(socketId) {
    const peer = this.peers.get(socketId);
    if (!peer || !peer._pc) {
      return null;
    }

    return peer._pc.connectionState;
  }

  /**
   * 특정 Peer의 ICE 연결 상태 확인
   * @param {string} socketId - 확인할 Peer의 소켓 ID
   * @returns {string|null}
   */
  getIceConnectionState(socketId) {
    const peer = this.peers.get(socketId);
    if (!peer || !peer._pc) {
      return null;
    }

    return peer._pc.iceConnectionState;
  }

  /**
   * 시그널 이벤트 핸들러 등록
   * @param {Function} handler - (socketId, signal) => void
   */
  onSignal(handler) {
    this.handlers.signal = handler;
  }

  /**
   * 원격 스트림 수신 이벤트 핸들러 등록
   * @param {Function} handler - (socketId, stream) => void
   */
  onStream(handler) {
    this.handlers.stream = handler;
  }

  /**
   * 에러 이벤트 핸들러 등록
   * @param {Function} handler - (socketId, error) => void
   */
  onError(handler) {
    this.handlers.error = handler;
  }

  /**
   * 연결 종료 이벤트 핸들러 등록
   * @param {Function} handler - (socketId) => void
   */
  onClose(handler) {
    this.handlers.close = handler;
  }

  /**
   * 연결 성공 이벤트 핸들러 등록
   * @param {Function} handler - (socketId) => void
   */
  onConnect(handler) {
    this.handlers.connect = handler;
  }

  /**
   * ICE 상태 변화 이벤트 핸들러 등록 (High priority)
   * @param {Function} handler - (socketId, state) => void
   */
  onIceStateChange(handler) {
    this.handlers.iceStateChange = handler;
  }

  /**
   * 현재 연결된 Peer 수 확인
   * @returns {number}
   */
  getPeerCount() {
    return this.peers.size;
  }

  /**
   * 모든 Peer의 소켓 ID 목록 반환
   * @returns {string[]}
   */
  getPeerIds() {
    return Array.from(this.peers.keys());
  }

  /**
   * 특정 Peer 존재 여부 확인
   * @param {string} socketId
   * @returns {boolean}
   */
  hasPeer(socketId) {
    return this.peers.has(socketId);
  }
}

export default WebRTCService;
