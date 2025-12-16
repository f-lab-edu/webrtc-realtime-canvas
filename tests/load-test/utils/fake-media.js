/**
 * fake-media.js
 *
 * 가짜 미디어 스트림 생성 유틸리티
 * Puppeteer 브라우저에서 getUserMedia를 오버라이드하여
 * 실제 카메라/마이크 없이 테스트용 미디어 스트림 제공
 *
 * @see REQ-013: 가짜 미디어 스트림
 */

/**
 * getUserMedia 오버라이드 스크립트 생성
 * page.evaluateOnNewDocument()에서 실행될 코드를 반환
 *
 * @param {Object} options - 설정 옵션
 * @param {number} options.width - 비디오 너비 (기본: 640)
 * @param {number} options.height - 비디오 높이 (기본: 480)
 * @param {number} options.fps - 비디오 프레임레이트 (기본: 30)
 * @param {string} options.videoUrl - 비디오 HTTP URL (선택, 실제 트래픽 발생용)
 * @returns {string} 브라우저에서 실행할 스크립트 문자열
 */
export function getOverrideScript(options = {}) {
  const { width = 640, height = 480, fps = 30, videoUrl = null } = options;

  // 브라우저 컨텍스트에서 실행될 코드
  return `
    (function() {
      // 이미 오버라이드됨 여부 확인
      if (window.__fakeMediaInitialized) return;
      window.__fakeMediaInitialized = true;

      // 비디오 HTTP URL
      const VIDEO_URL = ${videoUrl ? `"${videoUrl}"` : "null"};

      // 비디오 로드 결과 (외부에서 확인용)
      window.__videoLoadResult = { success: false, error: null, checked: false };

      // 원본 getUserMedia 저장
      const originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);

      // 비디오 파일 기반 스트림 생성 (실제 비트레이트 트래픽 발생)
      async function createVideoFileTrack() {
        return new Promise((resolve, reject) => {
          const video = document.createElement('video');
          video.src = VIDEO_URL;
          video.loop = true;
          video.muted = true;
          video.playsInline = true;
          video.width = ${width};
          video.height = ${height};

          // oncanplay: 첫 프레임이 실제로 렌더링 가능한 시점 (onloadedmetadata보다 안정적)
          video.oncanplay = async () => {
            try {
              await video.play();
              console.log('[FakeMedia] 비디오 파일 재생 시작:', VIDEO_URL);

              // 첫 프레임이 실제로 렌더링될 때까지 대기
              await new Promise(r => requestAnimationFrame(r));

              // captureStream으로 MediaStream 생성
              const stream = video.captureStream(${fps});
              const videoTrack = stream.getVideoTracks()[0];

              if (videoTrack && videoTrack.readyState === 'live') {
                // 비디오 로드 성공 기록
                window.__videoLoadResult = { success: true, error: null, checked: false };
                console.log('[FakeMedia] 비디오 트랙 생성 완료 (readyState: live)');
                resolve(videoTrack);
              } else {
                const error = '비디오 트랙이 live 상태가 아님: ' + (videoTrack ? videoTrack.readyState : 'null');
                window.__videoLoadResult = { success: false, error, checked: false };
                reject(new Error(error));
              }
            } catch (err) {
              window.__videoLoadResult = { success: false, error: err.message, checked: false };
              reject(err);
            }
          };

          video.onerror = () => {
            const error = '비디오 파일 로드 실패: ' + VIDEO_URL;
            console.error('[FakeMedia]', error);
            window.__videoLoadResult = { success: false, error, checked: false };
            reject(new Error(error));
          };

          // DOM에 숨겨서 추가 (재생을 위해 필요)
          video.style.position = 'absolute';
          video.style.top = '-9999px';
          video.style.left = '-9999px';
          document.body.appendChild(video);
        });
      }

      // Canvas 기반 가짜 비디오 스트림 생성 (기본 패턴)
      function createCanvasVideoTrack() {
        const canvas = document.createElement('canvas');
        canvas.width = ${width};
        canvas.height = ${height};
        const ctx = canvas.getContext('2d');

        // Canvas를 DOM에 추가 (Headless Chrome에서 렌더링 보장)
        canvas.style.position = 'absolute';
        canvas.style.top = '-9999px';
        canvas.style.left = '-9999px';
        document.body.appendChild(canvas);

        let hue = 0;
        let frameCount = 0;

        // 애니메이션 프레임 그리기 (테스트 패턴)
        function draw() {
          // 배경 색상 변경 (색상 순환)
          hue = (hue + 1) % 360;
          ctx.fillStyle = 'hsl(' + hue + ', 50%, 50%)';
          ctx.fillRect(0, 0, canvas.width, canvas.height);

          // 프레임 카운터 표시
          frameCount++;
          ctx.fillStyle = 'white';
          ctx.font = '24px monospace';
          ctx.fillText('Frame: ' + frameCount, 20, 40);
          ctx.fillText('Virtual Client', 20, 70);
          ctx.fillText(new Date().toLocaleTimeString(), 20, 100);

          // 움직이는 원 (동적 콘텐츠 표시)
          const x = canvas.width / 2 + Math.cos(frameCount * 0.05) * 100;
          const y = canvas.height / 2 + Math.sin(frameCount * 0.05) * 100;
          ctx.beginPath();
          ctx.arc(x, y, 30, 0, Math.PI * 2);
          ctx.fillStyle = 'white';
          ctx.fill();
        }

        // 첫 프레임을 먼저 그린 후 captureStream 호출 (순서 중요!)
        draw();

        // MediaStream 생성 (첫 프레임 렌더링 후)
        const stream = canvas.captureStream(${fps});

        // 이후 지속적인 프레임 생성
        setInterval(draw, 1000 / ${fps});

        console.log('[FakeMedia] Canvas 스트림 생성 완료 (DOM 추가됨)');
        return stream.getVideoTracks()[0];
      }

      // 비디오 트랙 생성 (파일 지정 시 실패하면 오류 발생, 폴백 없음)
      async function createFakeVideoTrack() {
        if (VIDEO_URL) {
          // 비디오 파일이 지정된 경우 반드시 성공해야 함 (폴백 없음)
          return await createVideoFileTrack();
        }
        return createCanvasVideoTrack();
      }

      // AudioContext 기반 가짜 오디오 스트림 생성
      function createFakeAudioTrack() {
        const audioCtx = new AudioContext();

        // 무음에 가까운 저주파 사인파 생성 (10Hz, 매우 낮은 볼륨)
        const oscillator = audioCtx.createOscillator();
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(10, audioCtx.currentTime);

        // 볼륨을 거의 들리지 않게 설정
        const gainNode = audioCtx.createGain();
        gainNode.gain.setValueAtTime(0.001, audioCtx.currentTime);

        // MediaStream 목적지 생성
        const dest = audioCtx.createMediaStreamDestination();

        oscillator.connect(gainNode);
        gainNode.connect(dest);
        oscillator.start();

        return dest.stream.getAudioTracks()[0];
      }

      // getUserMedia 오버라이드
      navigator.mediaDevices.getUserMedia = async function(constraints) {
        console.log('[FakeMedia] getUserMedia 호출됨:', JSON.stringify(constraints));

        const tracks = [];

        // 비디오 요청 시 (async로 비디오 파일 로드 대기)
        if (constraints.video) {
          const videoTrack = await createFakeVideoTrack();
          tracks.push(videoTrack);
          console.log('[FakeMedia] 가짜 비디오 트랙 생성됨', VIDEO_URL ? '(파일 소스)' : '(Canvas 패턴)');
        }

        // 오디오 요청 시
        if (constraints.audio) {
          const audioTrack = createFakeAudioTrack();
          tracks.push(audioTrack);
          console.log('[FakeMedia] 가짜 오디오 트랙 생성됨');
        }

        // 둘 다 없으면 원본 호출
        if (tracks.length === 0) {
          console.log('[FakeMedia] 미디어 요청 없음, 원본 호출');
          return originalGetUserMedia(constraints);
        }

        return new MediaStream(tracks);
      };

      // enumerateDevices 오버라이드 (가짜 디바이스 목록 반환)
      const originalEnumerateDevices = navigator.mediaDevices.enumerateDevices.bind(navigator.mediaDevices);
      navigator.mediaDevices.enumerateDevices = async function() {
        return [
          {
            deviceId: 'fake-video-device',
            groupId: 'fake-group',
            kind: 'videoinput',
            label: 'Fake Camera (Virtual Client)'
          },
          {
            deviceId: 'fake-audio-device',
            groupId: 'fake-group',
            kind: 'audioinput',
            label: 'Fake Microphone (Virtual Client)'
          },
          {
            deviceId: 'fake-audio-output',
            groupId: 'fake-group',
            kind: 'audiooutput',
            label: 'Fake Speaker (Virtual Client)'
          }
        ];
      };

      console.log('[FakeMedia] 가짜 미디어 스트림 초기화 완료');
    })();
  `;
}

/**
 * WebRTC 권한 자동 부여 스크립트
 * 브라우저의 권한 요청 다이얼로그 우회
 *
 * @returns {string} 브라우저에서 실행할 스크립트 문자열
 */
export function getPermissionOverrideScript() {
  return `
    (function() {
      // Permissions API 오버라이드
      const originalQuery = navigator.permissions.query.bind(navigator.permissions);
      navigator.permissions.query = async function(desc) {
        if (desc.name === 'camera' || desc.name === 'microphone') {
          return { state: 'granted', onchange: null };
        }
        return originalQuery(desc);
      };

      console.log('[FakeMedia] 권한 자동 부여 설정 완료');
    })();
  `;
}

export default {
  getOverrideScript,
  getPermissionOverrideScript,
};
