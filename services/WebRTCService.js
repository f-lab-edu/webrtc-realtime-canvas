import SimplePeer from "simple-peer";

/**
 * WebRTCService 클래스
 * SimplePeer를 사용한 WebRTC P2P 연결 관리
 *
 */
class WebRTCService {
  constructor() {
    this.peer = null;
    this.localStream = null;
    this.remoteStream = null;
    this.isInitiator = false;

    // 이벤트 핸들러 저장
    this.handlers = {
      signal: null,
      stream: null,
      error: null,
      close: null,
      connect: null,
    };
  }

  /**
   * SimplePeer 인스턴스 초기화
   * @param {boolean} initiator - offer를 생성하는 측인지 여부
   * @param {MediaStream} stream - 로컬 미디어 스트림
   * @param {Object} config - STUN/TURN 서버 설정 (선택적)
   */
  initialize(initiator, stream, config = {}) {
    try {
      this.isInitiator = initiator;
      this.localStream = stream;

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
      const audioTracks = stream.getAudioTracks();
      const videoTracks = stream.getVideoTracks();
      console.log(`WebRTC 초기화 - 로컬 스트림 트랙:`);
      console.log(
        `- 비디오: ${videoTracks.length}개`,
        videoTracks.map((t) => `${t.label} (enabled: ${t.enabled})`)
      );
      console.log(
        `- 오디오: ${audioTracks.length}개`,
        audioTracks.map((t) => `${t.label} (enabled: ${t.enabled})`)
      );

      // 개발 환경 체크
      const isDevelopment = process.env.NODE_ENV === "development";

      // SimplePeer 인스턴스 생성
      this.peer = new SimplePeer({
        initiator,
        stream,
        // 개발 환경: trickle false (안정성 우선)
        // 프로덕션: trickle true (성능 우선)
        trickle: !isDevelopment,
        config: config.iceServers ? config : defaultConfig,
      });

      console.log(
        `WebRTC 초기화 - 환경: ${isDevelopment ? "개발" : "프로덕션"}, trickle: ${!isDevelopment}`
      );

      // peer.on('signal') 첫 호출 시 ICE/Connection 모니터링 설정
      let isMonitoringSetup = false;

      // 시그널 이벤트 (SDP offer/answer, ICE candidate)
      this.peer.on("signal", (signal) => {
        console.log("WebRTC 시그널 생성:", signal.type || "candidate");

        // 첫 signal 이벤트 시 _pc 모니터링 설정
        if (!isMonitoringSetup && this.peer._pc) {
          console.log(
            "🎯 [WebRTCService] 첫 signal 이벤트, ICE/Connection 모니터링 설정 시작"
          );

          // ICE Connection State 모니터링
          this.peer._pc.oniceconnectionstatechange = () => {
            const state = this.peer._pc.iceConnectionState;
            console.log(`🧊 [WebRTCService] ICE Connection State: ${state}`);

            if (state === "failed") {
              console.error("❌ ICE Connection Failed - TURN 서버 필요할 수 있음");
            }
          };

          // RTCPeerConnection State 모니터링 (이중 안전장치)
          this.peer._pc.onconnectionstatechange = () => {
            const state = this.peer._pc.connectionState;
            console.log(`🔗 [WebRTCService] RTCPeerConnection State: ${state}`);

            if (state === "connected") {
              console.log("✅ Peer Connection Established");

              // RTCPeerConnection이 connected 상태가 되면
              // peer.on('connect')와 동일하게 처리 (이중 안전장치)
              console.log(
                "🎬 [WebRTCService] RTCPeerConnection connected, connect 핸들러 호출"
              );

              if (this.handlers.connect) {
                this.handlers.connect();
              } else {
                console.log("⚠️ [WebRTCService] connect 핸들러 미등록 (타이밍 이슈)");
              }
            }

            if (state === "failed" || state === "disconnected" || state === "closed") {
              console.error(`❌ RTCPeerConnection State: ${state}`);
              if (this.handlers.close) {
                this.handlers.close();
              }
            }
          };

          isMonitoringSetup = true;
          console.log("✅ [WebRTCService] ICE/Connection 모니터링 설정 완료");
        }

        // 기존 시그널 핸들러 호출
        if (this.handlers.signal) {
          this.handlers.signal(signal);
        }
      });

      // 원격 스트림 수신 이벤트
      this.peer.on("stream", (stream) => {
        console.log(`\n========== [WebRTCService peer.on('stream')] ==========`);
        console.log(`⏰ 타임스탬프: ${new Date().toISOString()}`);
        console.log(`🆔 Stream ID: ${stream.id}`);
        console.log(`📊 Stream 상태:`);
        console.log(`   - active: ${stream.active}`);

        // 트랙 정보 로깅 (디버깅용)
        const audioTracks = stream.getAudioTracks();
        const videoTracks = stream.getVideoTracks();

        console.log(`\n🎥 비디오 트랙: ${videoTracks.length}개`);
        videoTracks.forEach((t, i) => {
          console.log(`   [${i}] ${t.label}`);
          console.log(`       - id: ${t.id}`);
          console.log(`       - kind: ${t.kind}`);
          console.log(`       - enabled: ${t.enabled}`);
          console.log(`       - muted: ${t.muted}`);
          console.log(`       - readyState: ${t.readyState}`);
        });

        console.log(`\n🎵 오디오 트랙: ${audioTracks.length}개`);
        audioTracks.forEach((t, i) => {
          console.log(`   [${i}] ${t.label}`);
          console.log(`       - id: ${t.id}`);
          console.log(`       - kind: ${t.kind}`);
          console.log(`       - enabled: ${t.enabled}`);
          console.log(`       - muted: ${t.muted}`);
          console.log(`       - readyState: ${t.readyState}`);
        });

        // 비디오 트랙이 muted 상태면 unmute 대기
        if (videoTracks.length > 0 && videoTracks[0].muted) {
          const videoTrack = videoTracks[0];
          console.log(`⏳ [WebRTCService] 비디오 트랙 muted, unmute 대기 중...`);

          const handleUnmute = () => {
            console.log(`🔊 [WebRTCService] 비디오 트랙 unmute됨, React 상태 업데이트 시작`);
            this.remoteStream = stream;
            if (this.handlers.stream) {
              this.handlers.stream(stream);
            }
          };

          videoTrack.addEventListener("unmute", handleUnmute, { once: true });

          // 3초 타임아웃
          setTimeout(() => {
            if (videoTrack.muted) {
              console.log(`⚠️ [WebRTCService] Unmute 타임아웃 (3초), 강제 전달`);
              videoTrack.removeEventListener("unmute", handleUnmute);
            }
            // 타임아웃이어도 전달 (VideoPlayer에서 처리)
            this.remoteStream = stream;
            if (this.handlers.stream) {
              this.handlers.stream(stream);
            }
          }, 3000);
        } else {
          // 이미 unmuted이거나 비디오 트랙 없으면 즉시 전달
          console.log(`✅ [WebRTCService] 비디오 트랙 이미 unmuted, 즉시 전달`);
          this.remoteStream = stream;
          if (this.handlers.stream) {
            this.handlers.stream(stream);
          }
        }

        // peer.on('stream')을 P2P 연결 완료 신호로 사용
        // SimplePeer는 video/audio 전용 연결에서 peer.on('connect') 이벤트를 발생시키지 않음
        // (connect 이벤트는 data channel이 있을 때만 발생)
        console.log(`🎬 [WebRTCService] peer.on('stream') 수신 = P2P 연결 완료`);
        if (this.handlers.connect) {
          console.log(`✅ [WebRTCService] connect 핸들러 호출 (stream 기반)`);
          this.handlers.connect();
        }

        console.log(`========== [WebRTCService peer.on('stream') 종료] ==========\n`);
      });

      // 연결 성공 이벤트
      this.peer.on("connect", () => {
        console.log("WebRTC P2P 연결 성공");
        if (this.handlers.connect) {
          this.handlers.connect();
        }
      });

      // 에러 이벤트
      this.peer.on("error", (error) => {
        console.error("WebRTC 에러:", error);
        if (this.handlers.error) {
          this.handlers.error(error);
        }
      });

      // 연결 종료 이벤트
      this.peer.on("close", () => {
        console.log("WebRTC 연결 종료");
        if (this.handlers.close) {
          this.handlers.close();
        }
      });

      console.log(`WebRTC 초기화 완료 (initiator: ${initiator})`);
    } catch (error) {
      console.error("WebRTC 초기화 에러:", error);
      throw error;
    }
  }

  /**
   * 상대방의 시그널 데이터 처리 (SDP offer/answer, ICE candidate)
   * @param {Object} signalData - SimplePeer 시그널 데이터
   */
  signal(signalData) {
    if (!this.peer) {
      console.error("Peer가 초기화되지 않았습니다.");
      return;
    }

    try {
      this.peer.signal(signalData);
      console.log("시그널 처리 완료:", signalData.type || "candidate");
    } catch (error) {
      console.error("시그널 처리 에러:", error);
      throw error;
    }
  }

  /**
   * 미디어 트랙 교체 (화면 공유용)
   * @param {MediaStreamTrack} oldTrack - 교체할 기존 트랙
   * @param {MediaStreamTrack} newTrack - 새로운 트랙
   */
  replaceTrack(oldTrack, newTrack) {
    if (!this.peer) {
      console.error("Peer가 초기화되지 않았습니다.");
      return;
    }

    try {
      // SimplePeer의 내부 RTCPeerConnection에 접근하여 트랙 교체
      const sender = this.peer._pc.getSenders().find((s) => s.track === oldTrack);

      if (sender) {
        sender.replaceTrack(newTrack);
        console.log("미디어 트랙 교체 완료");
      } else {
        console.log("교체할 트랙을 찾을 수 없습니다.");
      }
    } catch (error) {
      console.error("트랙 교체 에러:", error);
      throw error;
    }
  }

  /**
   * 현재 전송 중인 비디오 트랙 가져오기
   * @returns {MediaStreamTrack|null}
   */
  getCurrentVideoTrack() {
    if (!this.peer || !this.peer._pc) {
      return null;
    }

    const sender = this.peer._pc.getSenders().find((s) => s.track && s.track.kind === "video");

    return sender ? sender.track : null;
  }

  /**
   * 현재 전송 중인 오디오 트랙 가져오기
   * @returns {MediaStreamTrack|null}
   */
  getCurrentAudioTrack() {
    if (!this.peer || !this.peer._pc) {
      return null;
    }

    const sender = this.peer._pc.getSenders().find((s) => s.track && s.track.kind === "audio");

    return sender ? sender.track : null;
  }

  /**
   * WebRTC 연결 종료 및 리소스 정리
   */
  destroy() {
    try {
      if (this.peer) {
        this.peer.destroy();
        this.peer = null;
        console.log("WebRTC 연결 종료 및 리소스 정리 완료");
      }

      this.remoteStream = null;
      this.localStream = null;
      this.isInitiator = false;

      // 핸들러 초기화
      this.handlers = {
        signal: null,
        stream: null,
        error: null,
        close: null,
        connect: null,
      };
    } catch (error) {
      console.error("WebRTC 종료 에러:", error);
    }
  }

  /**
   * 시그널 이벤트 핸들러 등록
   * @param {Function} handler - 시그널 데이터를 받을 콜백 함수
   */
  onSignal(handler) {
    this.handlers.signal = handler;
  }

  /**
   * 원격 스트림 수신 이벤트 핸들러 등록
   * @param {Function} handler - 원격 스트림을 받을 콜백 함수
   */
  onStream(handler) {
    this.handlers.stream = handler;
  }

  /**
   * 에러 이벤트 핸들러 등록
   * @param {Function} handler - 에러를 받을 콜백 함수
   */
  onError(handler) {
    this.handlers.error = handler;
  }

  /**
   * 연결 종료 이벤트 핸들러 등록
   * @param {Function} handler - 연결 종료 시 호출될 콜백 함수
   */
  onClose(handler) {
    this.handlers.close = handler;
  }

  /**
   * 연결 성공 이벤트 핸들러 등록
   * @param {Function} handler - 연결 성공 시 호출될 콜백 함수
   */
  onConnect(handler) {
    this.handlers.connect = handler;
  }

  /**
   * 연결 상태 확인
   * @returns {string|null} - 연결 상태 ('connected', 'connecting', 'disconnected' 등)
   */
  getConnectionState() {
    if (!this.peer || !this.peer._pc) {
      return null;
    }

    return this.peer._pc.connectionState;
  }

  /**
   * ICE 연결 상태 확인
   * @returns {string|null}
   */
  getIceConnectionState() {
    if (!this.peer || !this.peer._pc) {
      return null;
    }

    return this.peer._pc.iceConnectionState;
  }
}

export default WebRTCService;
