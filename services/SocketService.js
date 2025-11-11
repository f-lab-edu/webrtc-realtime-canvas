import { io } from "socket.io-client";

/**
 * SocketService 클래스
 * Socket.io 클라이언트 연결 및 이벤트 관리를 담당
 *
 */
class SocketService {
  constructor() {
    this.socket = null;
    this.serverUrl = null;
    this.isConnected = false;
    this.nickname = null; // 현재 사용자 닉네임
  }

  /**
   * 닉네임 설정
   * @param {string} nickname - 설정할 닉네임
   */
  setNickname(nickname) {
    this.nickname = nickname;
    console.log("SocketService 닉네임 설정:", nickname);
  }

  /**
   * 닉네임 가져오기
   * @returns {string|null}
   */
  getNickname() {
    return this.nickname;
  }

  /**
   * Socket.io 서버에 연결
   * @param {string} serverUrl
   * @returns {Promise<void>}
   */
  connect(serverUrl) {
    return new Promise((resolve, reject) => {
      try {
        this.serverUrl = serverUrl;

        // Socket.io 클라이언트 초기화 (자동 재연결 활성화)
        this.socket = io(serverUrl, {
          reconnection: true,
          reconnectionDelay: 1000,
          reconnectionDelayMax: 5000,
          reconnectionAttempts: Infinity,
          transports: ["websocket", "polling"],
        });

        // 연결 성공 이벤트
        this.socket.on("connect", () => {
          console.log("Socket 연결 성공:", this.socket.id);
          this.isConnected = true;
          resolve();
        });

        // 연결 에러 이벤트
        this.socket.on("connect_error", (error) => {
          console.error("Socket 연결 에러:", error);
          this.isConnected = false;
          reject(error);
        });

        // 연결 해제 이벤트
        this.socket.on("disconnect", (reason) => {
          console.log("Socket 연결 해제:", reason);
          this.isConnected = false;
        });

        // 재연결 시도 이벤트
        this.socket.on("reconnect_attempt", (attemptNumber) => {
          console.log(`Socket 재연결 시도 중... (${attemptNumber}번째)`);
        });

        // 재연결 성공 이벤트
        this.socket.on("reconnect", (attemptNumber) => {
          console.log(`Socket 재연결 성공 (${attemptNumber}번째 시도)`);
          this.isConnected = true;
        });

        // 재연결 실패 이벤트
        this.socket.on("reconnect_failed", () => {
          console.error("Socket 재연결 실패");
          this.isConnected = false;
        });
      } catch (error) {
        console.error("Socket 초기화 에러:", error);
        reject(error);
      }
    });
  }

  /**
   * Socket.io 연결 해제
   */
  disconnect() {
    if (this.socket) {
      console.log("Socket 연결 해제 중...");
      this.socket.disconnect();
      this.socket = null;
      this.isConnected = false;
    }
  }

  /**
   * 서버로 이벤트 전송
   * @param {string} event - 이벤트 이름
   * @param {*} data - 전송할 데이터
   */
  emit(event, data) {
    if (!this.socket) {
      console.error("Socket이 연결되지 않았습니다.");
      return;
    }

    // 닉네임 포함 로그 출력
    const nicknameLabel = this.nickname || "알 수 없음";
    console.log(`[송신] [${nicknameLabel}] ${event}:`, data);
    this.socket.emit(event, data);
  }

  /**
   * 서버 이벤트 리스너 등록
   * @param {string} event - 이벤트 이름
   * @param {Function} handler - 이벤트 핸들러 함수
   */
  on(event, handler) {
    if (!this.socket) {
      console.error("Socket이 연결되지 않았습니다.");
      return;
    }

    // 닉네임 포함 로그를 위한 래퍼 핸들러
    const wrappedHandler = (data) => {
      const nicknameLabel = this.nickname || "알 수 없음";
      console.log(`[수신] [${nicknameLabel}] ${event}:`, data);
      handler(data);
    };

    this.socket.on(event, wrappedHandler);
  }

  /**
   * 서버 이벤트 리스너 제거
   * @param {string} event - 이벤트 이름
   * @param {Function} handler - 제거할 이벤트 핸들러 함수
   */
  off(event, handler) {
    if (!this.socket) {
      console.error("Socket이 연결되지 않았습니다.");
      return;
    }

    if (handler) {
      this.socket.off(event, handler);
    } else {
      // 핸들러가 없으면 해당 이벤트의 모든 리스너 제거
      this.socket.off(event);
    }
  }

  /**
   * Socket ID 반환
   * @returns {string|null}
   */
  getSocketId() {
    return this.socket?.id || null;
  }

  /**
   * 연결 상태 확인
   * @returns {boolean}
   */
  isSocketConnected() {
    return this.isConnected && this.socket?.connected;
  }
}

export default SocketService;
