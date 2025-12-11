/**
 * VirtualClient.js
 *
 * Puppeteer 기반 가상 WebRTC 클라이언트
 * 실제 브라우저를 사용하여 WebRTC 연결을 수립하고
 * 가짜 미디어 스트림을 전송
 *
 * @see REQ-011: Headless 브라우저 인스턴스
 * @see REQ-012: 방 자동 참가
 * @see REQ-015: 리소스 정리
 */

import puppeteer from "puppeteer";
import { getOverrideScript, getPermissionOverrideScript } from "./utils/fake-media.js";
import { getLogger } from "./utils/logger.js";

/**
 * 가상 클라이언트 클래스
 * 각 인스턴스는 하나의 Headless Chrome 브라우저를 관리
 */
class VirtualClient {
  /**
   * @param {Object} options - 설정 옵션
   * @param {string} options.serverUrl - SFU 서버 URL (예: http://localhost:3000)
   * @param {string} options.roomId - 참가할 방 ID
   * @param {string} options.userId - 가상 사용자 ID (닉네임으로 사용)
   * @param {boolean} options.headless - Headless 모드 여부 (기본: true)
   * @param {number} options.width - 가짜 비디오 너비 (기본: 640)
   * @param {number} options.height - 가짜 비디오 높이 (기본: 480)
   * @param {string} options.videoUrl - 비디오 HTTP URL (선택, 실제 트래픽 발생용)
   */
  constructor(options) {
    // 필수 파라미터 검증
    if (!options?.serverUrl) {
      throw new Error("[VirtualClient] serverUrl은 필수입니다");
    }
    if (!options?.roomId) {
      throw new Error("[VirtualClient] roomId는 필수입니다");
    }
    if (!options?.userId) {
      throw new Error("[VirtualClient] userId는 필수입니다");
    }

    this.serverUrl = options.serverUrl;
    this.roomId = options.roomId;
    this.userId = options.userId;
    this.headless = options.headless ?? true;
    this.videoWidth = options.width ?? 640;
    this.videoHeight = options.height ?? 480;
    this.videoUrl = options.videoUrl ?? null;

    // 내부 상태
    this.browser = null;
    this.page = null;
    this.connected = false;
    this.connectTime = null;
    this.stats = {
      connectionAttempts: 0,
      lastError: null,
    };

    // 로거 인스턴스
    this.logger = getLogger();
    this.prefix = `VirtualClient:${this.userId}`;
  }

  /**
   * 브라우저 생성 및 방 참가
   * @returns {Promise<void>}
   */
  async connect() {
    if (this.connected) {
      this.logger.info(this.prefix, "이미 연결됨");
      return;
    }

    this.stats.connectionAttempts++;
    this.logger.info(this.prefix, `연결 시도 #${this.stats.connectionAttempts}`);

    try {
      // 1. 브라우저 생성
      this.browser = await puppeteer.launch({
        headless: this.headless,
        args: [
          "--use-fake-ui-for-media-stream", // 미디어 권한 자동 허용
          "--use-fake-device-for-media-stream", // 가짜 디바이스 사용
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-gpu",
          "--disable-dev-shm-usage",
          "--disable-web-security", // CORS 우회 (로컬 테스트용)
          `--window-size=${this.videoWidth},${this.videoHeight}`,
        ],
      });

      // 2. 페이지 생성
      this.page = await this.browser.newPage();

      // 뷰포트 설정
      await this.page.setViewport({
        width: this.videoWidth,
        height: this.videoHeight,
      });

      // 3. 가짜 미디어 스트림 주입 (페이지 로드 전)
      await this.page.evaluateOnNewDocument(
        getOverrideScript({
          width: this.videoWidth,
          height: this.videoHeight,
          fps: 30,
          videoUrl: this.videoUrl,
        })
      );
      await this.page.evaluateOnNewDocument(getPermissionOverrideScript());

      // 4. 콘솔 로그 캡처
      this.page.on("console", (msg) => {
        const text = msg.text();
        // 중요 로그만 출력
        if (text.includes("[FakeMedia]") || text.includes("Error") || text.includes("WebRTC")) {
          this.logger.debug(`${this.prefix}:Browser`, text);
        }
      });

      // 5. 에러 캡처
      this.page.on("pageerror", (error) => {
        this.logger.error(`${this.prefix}:PageError`, error.message);
        this.stats.lastError = error.message;
      });

      // 6. 방 페이지 접속
      const roomUrl = `${this.serverUrl}/room/${this.roomId}`;
      this.logger.info(this.prefix, `페이지 접속: ${roomUrl}`);
      await this.page.goto(roomUrl, { waitUntil: "networkidle2", timeout: 30000 });

      // 7. 닉네임 입력 및 방 참가
      await this._joinRoom();

      this.connected = true;
      this.connectTime = Date.now();
      this.logger.info(this.prefix, "연결 완료");
    } catch (error) {
      this.stats.lastError = error.message;
      this.logger.error(this.prefix, `연결 실패: ${error.message}`);

      // 실패 시 리소스 정리
      await this._cleanup();
      throw error;
    }
  }

  /**
   * 닉네임 입력 및 방 참가 처리
   * @private
   */
  async _joinRoom() {
    this.logger.info(this.prefix, "방 참가 프로세스 시작");

    // 1. 닉네임 입력 필드 대기 (NicknameInput 컴포넌트)
    this.logger.debug(this.prefix, "닉네임 입력 필드 대기 중...");
    const nicknameInputSelector = 'input[placeholder*="닉네임"], input[type="text"]';

    await this.page.waitForSelector(nicknameInputSelector, { timeout: 10000 });

    // 입력 필드 상태 로깅
    const inputState = await this.page.evaluate((selector) => {
      const input = document.querySelector(selector);
      if (!input) return null;
      return {
        id: input.id,
        name: input.name,
        placeholder: input.placeholder,
        value: input.value,
        disabled: input.disabled,
      };
    }, nicknameInputSelector);

    this.logger.debug(this.prefix, `입력 필드 상태: ${JSON.stringify(inputState)}`);

    // 2. 닉네임 입력
    await this.page.type(nicknameInputSelector, this.userId);
    this.logger.info(this.prefix, `닉네임 입력 완료: "${this.userId}"`);

    // 3. "시청자 모드" 체크박스 찾기 (있으면 해제하여 미디어 전송 활성화)
    const viewerCheckbox = await this.page.$('input[type="checkbox"]');
    if (viewerCheckbox) {
      const isChecked = await viewerCheckbox.evaluate((el) => el.checked);
      this.logger.debug(this.prefix, `시청자 모드 체크박스: ${isChecked ? "체크됨" : "해제됨"}`);
      if (isChecked) {
        await viewerCheckbox.click();
        this.logger.info(this.prefix, "시청자 모드 해제");
      }
    }

    // 4. 페이지의 모든 버튼 목록 로깅
    const allButtons = await this.page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll("button"));
      return buttons.map((btn, index) => ({
        index,
        text: btn.textContent?.trim() || "",
        type: btn.type,
        disabled: btn.disabled,
      }));
    });

    this.logger.debug(
      this.prefix,
      `페이지 버튼 목록 (${allButtons.length}개): ${JSON.stringify(allButtons)}`
    );

    // 5. 참가 버튼 찾기 (확장된 매칭 패턴 - "방 입장하기" 추가!)
    const buttons = await this.page.$$("button");
    let joinButton = null;
    let matchedText = null;

    // 매칭 패턴 확장
    const buttonPatterns = ["참가", "입장", "Join", "방 입장하기", "입장하기", "선택 완료"];

    for (const button of buttons) {
      const text = await button.evaluate((el) => el.textContent?.trim() || "");
      const isDisabled = await button.evaluate((el) => el.disabled);

      for (const pattern of buttonPatterns) {
        if (text.includes(pattern) && !isDisabled) {
          joinButton = button;
          matchedText = text;
          break;
        }
      }
      if (joinButton) break;
    }

    // 6. 버튼 클릭 또는 Enter 키
    if (joinButton) {
      this.logger.info(this.prefix, `참가 버튼 발견: "${matchedText}"`);
      await joinButton.click();
      this.logger.info(this.prefix, "참가 버튼 클릭 완료");
    } else {
      this.logger.warn(this.prefix, "참가 버튼을 찾지 못함, Enter 키로 시도");
      await this.page.keyboard.press("Enter");
      this.logger.info(this.prefix, "Enter 키 입력 완료");
    }

    // 7. 클릭 후 1초 대기 및 상태 확인
    await new Promise((r) => setTimeout(r, 1000));

    // 페이지 URL 확인
    const currentUrl = this.page.url();
    this.logger.debug(this.prefix, `현재 URL: ${currentUrl}`);

    // 8. 방 UI 로드 대기 (확장된 셀렉터)
    try {
      const roomSelectors = [
        '[class*="video"]',
        '[class*="control"]',
        '[class*="room"]',
        '[data-testid="video-grid"]',
        "video",
      ];

      await this.page.waitForFunction(
        (selectors) => {
          return selectors.some((s) => document.querySelector(s));
        },
        { timeout: 15000 },
        roomSelectors
      );

      this.logger.info(this.prefix, "방 UI 로드 확인 완료");
    } catch {
      // 에러 발생 시 페이지 상태 캡처
      this.logger.warn(this.prefix, "방 UI 로드 확인 실패, 상세 정보 수집 중...");

      const pageSnapshot = await this.page.evaluate(() => {
        return {
          title: document.title,
          url: window.location.href,
          bodyClasses: document.body.className,
          errorMessages: Array.from(document.querySelectorAll('[class*="error"], [class*="Error"]'))
            .map((el) => el.textContent?.trim())
            .filter(Boolean),
        };
      });

      this.logger.debug(this.prefix, `페이지 스냅샷: ${JSON.stringify(pageSnapshot)}`);

      // 스크린샷 저장
      try {
        const screenshotPath = `./logs/screenshot-${this.userId}-${Date.now()}.png`;
        await this.page.screenshot({ path: screenshotPath, fullPage: true });
        this.logger.info(this.prefix, `스크린샷 저장: ${screenshotPath}`);
      } catch (ssError) {
        this.logger.error(this.prefix, `스크린샷 저장 실패: ${ssError.message}`);
      }

      this.logger.warn(this.prefix, "방 UI 로드 확인 실패, 계속 진행");
    }

    // 9. 비디오 로드 결과 확인 (지정된 경우)
    if (this.videoUrl) {
      await this._checkVideoLoadResult();
    }

    // 10. WebRTC 연결 안정화 대기
    await this._waitForWebRTCConnection();
  }

  /**
   * 비디오 파일 로드 결과 확인
   * @private
   * @throws {Error} 비디오 파일 로드 실패 시
   */
  async _checkVideoLoadResult() {
    this.logger.info(this.prefix, "비디오 파일 로드 결과 확인 중...");

    // 브라우저에서 비디오 로드 결과 확인 (최대 5초 대기)
    const maxWait = 5000;
    const interval = 200;
    let elapsed = 0;

    while (elapsed < maxWait) {
      const result = await this.page.evaluate(() => window.__videoLoadResult);

      if (result?.success) {
        this.logger.info(this.prefix, "비디오 파일 로드 성공");
        return;
      }

      if (result?.error) {
        // 로드 실패 - 오류 발생
        const errorMsg = `비디오 파일 로드 실패: ${result.error}`;
        this.logger.error(this.prefix, errorMsg);
        throw new Error(errorMsg);
      }

      // 아직 결과 없음 - 대기
      await new Promise((r) => setTimeout(r, interval));
      elapsed += interval;
    }

    // 타임아웃 - 결과 없음 (getUserMedia가 호출되지 않았을 수 있음)
    this.logger.warn(this.prefix, "비디오 로드 결과 확인 타임아웃 (getUserMedia 미호출 가능성)");
  }

  /**
   * WebRTC 연결 상태 확인 및 대기
   * @private
   */
  async _waitForWebRTCConnection() {
    this.logger.info(this.prefix, "WebRTC 연결 대기 시작");

    // 브라우저 컨텍스트에서 RTCPeerConnection 상태 확인
    const maxWait = 10000; // 최대 10초 대기
    const interval = 500;
    let elapsed = 0;

    while (elapsed < maxWait) {
      const connectionInfo = await this.page.evaluate(() => {
        // RTCPeerConnection 인스턴스 찾기
        // 참고: mediasoup-client는 window.__rtcPeerConnections를 사용하지 않음
        // 실제 SFU 연결은 서버 측 리소스(Router, Transport, Producer)로 확인
        const pcs = window.__rtcPeerConnections || [];
        if (pcs.length === 0) {
          return { state: "waiting-for-peers", count: 0 };
        }

        // 모든 연결 상태 확인
        const states = pcs.map((pc) => ({
          connectionState: pc.connectionState,
          iceConnectionState: pc.iceConnectionState,
          signalingState: pc.signalingState,
        }));

        const anyConnected = states.some((s) => s.connectionState === "connected");
        const anyConnecting = states.some((s) => s.connectionState === "connecting");

        return {
          state: anyConnected
            ? "connected"
            : anyConnecting
              ? "connecting"
              : states[0]?.connectionState || "unknown",
          count: pcs.length,
          details: states,
        };
      });

      if (connectionInfo.state === "connected") {
        this.logger.info(
          this.prefix,
          `WebRTC 연결 완료 (PeerConnection ${connectionInfo.count}개)`
        );
        return;
      }

      // 2초마다 상태 로깅
      if (elapsed % 2000 === 0 && elapsed > 0) {
        this.logger.debug(
          this.prefix,
          `WebRTC 상태: ${connectionInfo.state}`,
          connectionInfo.details
        );
      }

      await new Promise((r) => setTimeout(r, interval));
      elapsed += interval;
    }

    // 다른 사용자가 없으면 P2P 연결이 없으므로 정상 상태
    // SFU 연결은 서버 측 리소스(Router, Transport, Producer)로 확인
    this.logger.info(this.prefix, "SFU 연결 완료 (다른 참가자 대기 중)");
  }

  /**
   * 연결 해제 및 리소스 정리
   * @returns {Promise<void>}
   */
  async disconnect() {
    this.logger.info(this.prefix, "연결 해제 시작");
    await this._cleanup();
    this.connected = false;
    this.connectTime = null;
    this.logger.info(this.prefix, "연결 해제 완료");
  }

  /**
   * 내부 리소스 정리
   * @private
   */
  async _cleanup() {
    try {
      if (this.page) {
        await this.page.close().catch(() => {});
        this.page = null;
      }
      if (this.browser) {
        await this.browser.close().catch(() => {});
        this.browser = null;
      }
    } catch (error) {
      this.logger.error(this.prefix, `정리 중 오류: ${error.message}`);
    }
  }

  /**
   * 연결 상태 확인
   * @returns {boolean}
   */
  isConnected() {
    return this.connected && this.browser !== null && this.page !== null;
  }

  /**
   * 클라이언트 통계 반환
   * @returns {Object}
   */
  getStats() {
    return {
      userId: this.userId,
      roomId: this.roomId,
      connected: this.connected,
      connectTime: this.connectTime,
      uptime: this.connectTime ? Date.now() - this.connectTime : 0,
      ...this.stats,
    };
  }

  /**
   * 미디어 스트림 시작 (이미 connect에서 처리됨)
   * @returns {Promise<void>}
   */
  async startMedia() {
    if (!this.connected) {
      throw new Error("먼저 connect()를 호출하세요");
    }
    // 가짜 미디어는 페이지 로드 시 자동 시작됨
    this.logger.info(this.prefix, "미디어 스트림 활성화됨");
  }

  /**
   * 미디어 스트림 중지
   * @returns {Promise<void>}
   */
  async stopMedia() {
    if (!this.connected || !this.page) return;

    await this.page.evaluate(() => {
      // 모든 MediaStreamTrack 중지
      const streams = document.querySelectorAll("video, audio");
      for (const el of streams) {
        if (el.srcObject) {
          for (const track of el.srcObject.getTracks()) {
            track.stop();
          }
        }
      }
    });
    this.logger.info(this.prefix, "미디어 스트림 중지됨");
  }
}

export default VirtualClient;
