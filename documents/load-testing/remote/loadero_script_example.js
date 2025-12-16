client => {
  // 테스트 파라미터 (Loadero는 globals 미지원, 상수로 정의)
  const BASE_URL = "https://gctnw-112-216-93-50.a.free.pinggy.link";
  const ROOM_NAME = "loadero-test";
  const STAY_DURATION_MS = 60000;
  // 닉네임 최대 20자 제한 → 짧은 ID 사용
  const SHORT_ID = Date.now().toString().slice(-6);  // 마지막 6자리만
  const NICKNAME = `LU_${SHORT_ID}`;  // 예: LU_108811 (9자)

  // 모든 참가자가 같은 방에 입장 (WebRTC 트래픽 발생 필수)
  const roomUrl = `${BASE_URL}/room/${ROOM_NAME}`;

  client
    // 방 페이지 접속
    .url(roomUrl)
    .waitForElementVisible('body', 15000)

    // 1) Pinggy 경고 페이지 우회 (DOM 버튼 클릭)
    .execute(function() {
      const btns = document.querySelectorAll('button, a');
      for (const el of btns) {
        const text = (el.textContent || '').trim().toLowerCase();
        if (text.includes('enter') || text.includes('continue') || text.includes('proceed')) {
          el.click();
          return { handled: true, buttonText: text };
        }
      }
      return { handled: false };
    }, [], function(result) {
      if (result.value && result.value.handled) {
        console.log('[Loadero] Pinggy 경고 페이지 우회 완료:', result.value.buttonText);
      }
    })
    .pause(2000)

    // 2) 닉네임 입력 필드 대기 (Nightwatch API)
    .waitForElementVisible('input[type="text"]', 10000)

    // 3) 닉네임 입력 (React controlled input 대응)
    .execute(function(nickname) {
      const input = document.querySelector('input[type="text"]');
      if (!input) return { success: false, reason: 'input not found' };

      // 포커스 먼저 설정 (React 이벤트 시스템 활성화)
      input.focus();

      // 1) 현재 값 저장
      const lastValue = input.value;

      // 2) Native value setter로 값 설정
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, 'value'
      ).set;
      nativeInputValueSetter.call(input, nickname);

      // 3) _valueTracker에 이전 값 설정
      const tracker = input._valueTracker;
      if (tracker) {
        tracker.setValue(lastValue);
      }

      // 4) 여러 이벤트 발생 (React 버전 호환성)
      // React 16+는 input 이벤트, 일부는 change 이벤트 필요
      const inputEvent = new Event('input', { bubbles: true, cancelable: true });
      const changeEvent = new Event('change', { bubbles: true, cancelable: true });

      input.dispatchEvent(inputEvent);
      input.dispatchEvent(changeEvent);

      return {
        success: true,
        previousValue: lastValue,
        newValue: input.value,
        trackerReset: !!tracker
      };
    }, [NICKNAME], function(result) {
      console.log('[Loadero] 닉네임 입력 결과:', result.value);
    })
    .pause(500)

    // 4) 시청자 모드 체크박스 확인 및 해제 (기본값: 해제, 체크되어 있으면 클릭)
    .execute(function() {
      const checkbox = document.querySelector('input[type="checkbox"]');
      if (checkbox && checkbox.checked) {
        checkbox.click();
        return { unchecked: true };
      }
      return { unchecked: false, wasAlreadyUnchecked: true };
    }, [], function(result) {
      console.log('[Loadero] 체크박스 상태:', result.value);
    })
    .pause(300)

    // 4.5) 디버깅: 버튼 상태 확인
    .execute(function() {
      const btn = document.querySelector('button[type="submit"]');
      const input = document.querySelector('input[type="text"]');
      const errorMsg = document.querySelector('.text-red-400, .text-red-500');

      return {
        buttonExists: !!btn,
        buttonDisabled: btn ? btn.disabled : null,
        buttonText: btn ? btn.textContent.trim() : null,
        inputValue: input ? input.value : null,
        inputValueLength: input ? input.value.trim().length : null,
        errorMessage: errorMsg ? errorMsg.textContent : null,
        allButtons: Array.from(document.querySelectorAll('button')).map(b => ({
          type: b.type,
          disabled: b.disabled,
          text: b.textContent.trim().substring(0, 30)
        }))
      };
    }, [], function(result) {
      console.log('[Loadero] 버튼 디버깅:', JSON.stringify(result.value, null, 2));
    })
    .pause(200)

    // 5) 참가 버튼 활성화 대기 후 클릭
    .waitForElementPresent('button[type="submit"]:not([disabled])', 5000)
    .click('button[type="submit"]')
    .pause(1000)

    // 6) 방 UI 로드 대기 (video 요소가 나타날 때까지)
    .waitForElementVisible('video', 20000)

    // 7) 스크린샷 저장
    .saveScreenshot('room-joined.png')

    // 8) 부하 유지 (WebRTC 미디어 전송 상태 유지)
    .pause(STAY_DURATION_MS)

    // 9) 최종 상태 스냅샷 수집
    .execute(function() {
      const videos = Array.from(document.querySelectorAll('video')).map((v, i) => ({
        index: i,
        id: v.id,
        hasSrcObject: !!v.srcObject,
        readyState: v.readyState,
      }));

      return {
        timestamp: new Date().toISOString(),
        url: window.location.href,
        title: document.title,
        videoCount: videos.length,
        videos,
      };
    }, [], function(result) {
      console.log('[Loadero] 최종 스냅샷:', JSON.stringify(result.value, null, 2));
    })

    // 10) 최종 스크린샷
    .saveScreenshot('test-complete.png')

    .end();
}
