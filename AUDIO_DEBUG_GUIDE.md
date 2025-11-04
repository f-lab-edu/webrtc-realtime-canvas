# 오디오 문제 디버깅 가이드

## 수정 사항

### 1. VideoPlayer.jsx

- 원격 비디오의 `volume` 속성을 명시적으로 1.0으로 설정
- 스트림 연결 시 오디오/비디오 트랙 정보를 콘솔에 출력
- 원격 스트림의 오디오 트랙 활성화 상태 확인

### 2. MediaContext.js

- 로컬 스트림 초기화 시 오디오 트랙 정보 로깅
- `autoGainControl: true` 옵션 추가

### 3. WebRTCService.js

- WebRTC 초기화 시 로컬 스트림의 트랙 정보 로깅
- 원격 스트림 수신 시 트랙 정보 로깅

## 디버깅 체크리스트

브라우저 콘솔(F12)에서 다음 로그를 확인하세요:

### 1단계: 로컬 스트림 확인

```
미디어 스트림 획득 성공
로컬 스트림 트랙 정보:
- 비디오 트랙: 1개 ["카메라 이름 (enabled: true)"]
- 오디오 트랙: 1개 ["마이크 이름 (enabled: true)"]
```

**문제 발견 시:**

- 오디오 트랙이 0개: 마이크 권한 또는 장치 문제
- enabled: false: toggleAudio()가 호출되었거나 초기화 문제

### 2단계: WebRTC 초기화 확인

```
WebRTC 초기화 - 로컬 스트림 트랙:
- 비디오: 1개 ["카메라 이름 (enabled: true)"]
- 오디오: 1개 ["마이크 이름 (enabled: true)"]
```

**문제 발견 시:**

- 오디오 트랙이 없다면 로컬 스트림이 WebRTC에 제대로 전달되지 않음

### 3단계: 원격 스트림 수신 확인

```
원격 스트림 수신
원격 스트림 트랙 정보:
- 비디오: 1개 ["카메라 이름 (enabled: true)"]
- 오디오: 1개 ["마이크 이름 (enabled: true)"]
```

**문제 발견 시:**

- 오디오 트랙이 0개: 상대방의 로컬 스트림에 오디오가 없거나 WebRTC 연결 문제
- enabled: false: 상대방이 오디오를 끈 상태

### 4단계: Video 엘리먼트 확인

```
비디오 스트림 연결: 상대방
- 비디오 트랙: 1개 ["카메라 이름 (enabled: true)"]
- 오디오 트랙: 1개 ["마이크 이름 (enabled: true)"]
비디오 엘리먼트 volume: 1, muted: false
```

**문제 발견 시:**

- muted: true인 경우 VideoPlayer 컴포넌트의 isLocal 값 확인
- volume: 0인 경우 브라우저 설정 확인

## 추가 확인 사항

### 브라우저 콘솔에서 직접 확인

```javascript
// 원격 비디오 엘리먼트 찾기
const videos = document.querySelectorAll('video');
videos.forEach((v, i) => {
  console.log(`Video ${i}:`, {
    muted: v.muted,
    volume: v.volume,
    srcObject: v.srcObject,
    audioTracks: v.srcObject?.getAudioTracks().map(t => ({
      label: t.label,
      enabled: t.enabled,
      muted: t.muted,
      readyState: t.readyState
    }))
  });
});
```

### 일반적인 문제 해결

1. **마이크 권한 문제**
   - 브라우저 주소창의 자물쇠 아이콘 클릭
   - 마이크 권한이 "허용"으로 설정되어 있는지 확인

2. **브라우저 음소거 상태**
   - 브라우저 탭이 음소거되어 있지 않은지 확인
   - 시스템 볼륨이 0이 아닌지 확인

3. **HTTPS 필요**
   - localhost가 아닌 경우 HTTPS 필수
   - getUserMedia는 보안 컨텍스트에서만 작동

4. **브라우저 호환성**
   - Chrome, Edge, Firefox 최신 버전 사용 권장
   - Safari는 일부 제한 사항 있음

5. **방화벽/네트워크**
   - STUN/TURN 서버 연결 확인
   - ICE candidate 교환이 정상적으로 이루어지는지 확인

## 테스트 방법

1. 두 개의 브라우저 탭 또는 다른 기기에서 접속
2. 각 탭의 콘솔을 열어 로그 확인
3. 위의 체크리스트 순서대로 확인
4. 문제가 발견된 단계를 기록하고 해당 부분 집중 디버깅
