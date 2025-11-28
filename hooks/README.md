# WebRTC Hooks 아키텍처

WebRTC 연결 관리를 위한 모듈화된 훅 구조 문서

## 📁 파일 구조

```
hooks/
├── useWebRTC.js              # 598 lines - WebRTC 연결 오케스트레이션
├── useWebRTCSignaling.js     # 169 lines - 시그널링 처리 (Offer/Answer/ICE)
├── useWebRTCReconnection.js  # 284 lines - 재연결 로직
├── useChat.js                # 244 lines - 채팅 메시지 처리
├── useWhiteboard.js          # ~200 lines - 화이트보드 동기화
└── README.md                 # 이 문서
```

## 🏗️ 아키텍처 개요

### 역할 분리 원칙

각 훅은 **단일 책임 원칙(Single Responsibility Principle)** 을 따라 설계되었습니다:

#### 1. useWebRTC (오케스트레이션 레이어)
**책임**: WebRTC 연결의 전체 생명주기 관리 및 하위 훅 조정

**주요 기능**:
- SimplePeer 초기화 및 생명주기 관리
- 참가자 입장 이벤트 처리
- 연결 상태 관리 (`connecting` | `connected` | `disconnected`)
- 하위 훅(Signaling, Reconnection) 통합

**의존성**:
- `useWebRTCSignaling` - 시그널링 처리 위임
- `useWebRTCReconnection` - 재연결 처리 위임
- `MediaContext` - 미디어 스트림 및 상태 관리
- `RoomContext` - 소켓 연결 및 참가자 정보

#### 2. useWebRTCSignaling (시그널링 레이어)
**책임**: WebRTC 시그널링 프로토콜 처리

**주요 기능**:
- `handleOffer` - Offer SDP 수신 및 처리
- `handleAnswer` - Answer SDP 수신 및 처리
- `handleIceCandidate` - ICE Candidate 수신 및 처리

**특징**:
- Offer/Answer 재협상 로직
- 시그널링 상태(signalingState) 기반 처리
- Peer 준비 대기 메커니즘

#### 3. useWebRTCReconnection (재연결 레이어)
**책임**: 디바이스 변경 및 재연결 처리

**주요 기능**:
- `reconnectMedia` - 미디어 디바이스 변경 시 재연결
- `handleMediaReconnecting` - 상대방 재연결 시작 감지
- `handleMediaReconnected` - 상대방 재연결 완료 처리
- `handleParticipantLeft` - 참가자 퇴장 시 정리

**특징**:
- **동시 재연결 충돌 해결**: 타임스탬프 기반 우선순위 결정
- **Race condition 방지**: localStreamRef 즉시 업데이트
- **재연결 상태 머신**: MediaContext의 webrtcReconnectionState 활용

## 🔄 상태 관리

### MediaContext 상태 머신

#### webrtcInitState (초기화 상태)
```javascript
{
  status: 'idle' | 'initializing' | 'ready' | 'error',
  isProcessingSignal: boolean,
  pendingOffer: Object | null,
  pendingConnection: Object | null
}
```

**상태 전이**:
- `idle` → `initializing`: `startWebRTCInitialization()` 호출
- `initializing` → `ready`: SimplePeer 초기화 완료
- `initializing` → `error`: 초기화 에러 발생
- `ready` → `idle`: 재연결 시 리셋

#### webrtcReconnectionState (재연결 상태)
```javascript
{
  isReconnecting: boolean,
  isRemoteReconnecting: boolean,
  reconnectTimeout: number | null,
  targetSocketId: string | null
}
```

**상태 전이**:
- 재연결 시작: `startWebRTCReconnection(targetSocketId, timestamp)`
- 원격 재연결 대기: `startRemoteWebRTCReconnection()`
- 재연결 완료: `completeWebRTCReconnection()`
- 상태 리셋: `resetWebRTCReconnectionState()`

## 📡 시그널링 플로우

### 1. 연결 시작 (Offer 발신)
```
[Caller]                                [Callee]
   │                                       │
   ├─ initializeWebRTC(true, targetId)   │
   │  └─ SimplePeer 생성 (initiator: true)
   │                                       │
   ├─ 'signal' event (Offer)              │
   │  └─ emit('signal:offer')   ─────────>│
   │                                       │
   │                              handleOffer()
   │                                       │
   │                      initializeWebRTC(false, fromId)
   │                     SimplePeer 생성 (initiator: false)
   │                                       │
   │<─────────── emit('signal:answer') ───┤
   │                                       │
handleAnswer()                             │
   │                                       │
   ├─ ICE Candidate exchange              │
   │<─────────────────────────────────────>│
   │                                       │
   └─ P2P 연결 완료 (connected)            └─ P2P 연결 완료 (connected)
```

### 2. 재연결 플로우 (디바이스 변경)
```
[User A]                                [User B]
   │                                       │
   ├─ 디바이스 변경 (카메라/마이크)        │
   │  └─ reconnectMedia(newStream)        │
   │     ├─ emit('media:reconnecting')  ──>│ handleMediaReconnecting()
   │     │  with timestamp                 │  └─ Peer destroy
   │     ├─ Peer destroy                   │  └─ 대기 모드 진입
   │     └─ initializeWebRTC()             │
   │                                       │
   │<──── WebRTC Handshake (Offer/Answer) │
   │                                       │
   └─ emit('media:reconnected')  ────────>│ handleMediaReconnected()
                                           │  └─ 재연결 완료 상태 전이
```

### 3. 동시 재연결 충돌 해결
```
[User A]                                [User B]
   │                                       │
   ├─ reconnectMedia() (TS: 1000)         │
   │  └─ emit('media:reconnecting')  ────>│
   │                                       │
   │                              reconnectMedia() (TS: 1005)
   │<────── emit('media:reconnecting') ───┤
   │                                       │
   │ handleMediaReconnecting()             │ handleMediaReconnecting()
   │  ├─ 타임스탬프 비교: 1000 < 1005     │  ├─ 타임스탬프 비교: 1005 > 1000
   │  ├─ ✅ 우선권 (먼저 시작)            │  ├─ ❌ 취소 및 대기
   │  └─ 계속 진행                         │  └─ Peer destroy, 대기 모드
   │                                       │
   └──────── 재연결 진행 ────────────────>│ Answer 생성 및 응답
```

**타임스탬프 비교 로직**:
- 낮은 타임스탬프 = 먼저 시작 = 우선권 획득
- 높은 타임스탬프 = 늦게 시작 = 취소하고 대기
- 이를 통해 동시 재연결 시 충돌 방지

## 🧪 테스트 전략

### 단위 테스트
- `lib/webrtcUtils.test.js` - 유틸리티 함수 테스트
- Jest + Given-When-Then 패턴 사용

### 통합 테스트 (권장)
각 훅은 독립적으로 테스트 가능하도록 설계됨:

```javascript
// useWebRTCSignaling 테스트 예시
describe('useWebRTCSignaling', () => {
  it('should handle offer and initialize WebRTC', () => {
    // Given: Mock dependencies
    const mockInit = jest.fn();
    const mockHandleSignal = jest.fn();

    // When: handleOffer 호출
    const { handleOffer } = useWebRTCSignaling({
      initializeWebRTC: mockInit,
      handleSignal: mockHandleSignal,
      // ... other deps
    });

    handleOffer({ from: 'socket123', signal: mockSignal });

    // Then: initializeWebRTC 호출 확인
    expect(mockInit).toHaveBeenCalledWith(false, 'socket123');
  });
});
```

## 🔧 유틸리티 함수

### lib/webrtcUtils.js
공통 로직을 추출한 순수 함수 모음:

- `cleanupPeer(peerConnection, webrtcServiceRef?)` - Peer 안전 정리
- `logWebRTCEvent(eventType, details)` - WebRTC 이벤트 로깅
- `isReconnecting(reconnectionState)` - 재연결 상태 체크
- `isProcessingSignal(signalState)` - 시그널 처리 중 체크
- `checkInitializationState(initState)` - 초기화 가능 여부 검증
- `getSignalingState(peer)` - SimplePeer 시그널링 상태 조회

**특징**:
- Context/Hook으로부터 독립적
- 100% 단위 테스트 커버리지 (24 tests)
- 재사용 가능

## 🔑 주요 개선사항

### Before (Phase 0)
```
useWebRTC.js: ~880 lines
- 9개 useRef 플래그로 복잡한 상태 관리
- initializeWebRTC: 170 lines (대형 함수)
- 시그널링, 재연결, 초기화 로직 혼재
- 테스트 어려움
```

### After (Phase 5)
```
useWebRTC.js: 598 lines (32% 감소)
  ├─ useWebRTCSignaling.js: 169 lines (시그널링 분리)
  ├─ useWebRTCReconnection.js: 284 lines (재연결 분리)
  └─ lib/webrtcUtils.js: 152 lines (유틸리티 분리)

총 1203 lines (분산), 복잡도 감소, 테스트 가능성 향상
```

### 개선 효과
1. **단일 책임 원칙 적용**: 각 훅이 명확한 책임 보유
2. **상태 관리 중앙화**: MediaContext로 상태 머신 통합
3. **테스트 가능성 향상**: 의존성 주입 패턴으로 Mock 가능
4. **코드 재사용성**: 유틸리티 함수 추출
5. **유지보수 용이**: 모듈별 독립적 수정 가능

## 📚 참조 문서

### Context 아키텍처
- `contexts/MediaContext.js` - 미디어 스트림 및 WebRTC 상태 관리
- `contexts/RoomContext.js` - Socket.io 연결 및 방 관리

### Service 레이어
- `services/WebRTCService.js` - SimplePeer 래퍼
- `services/SocketService.js` - Socket.io 클라이언트 래퍼

### 프로젝트 문서
- `CLAUDE.md` - 프로젝트 개요 및 개발 가이드
- `documents/` - 추가 기술 문서

## 🐛 디버깅 가이드

### 재연결 문제 디버깅
1. **재연결 무한 루프**: `webrtcReconnectionState.isReconnecting` 플래그 확인
2. **동시 재연결 충돌**: 콘솔에서 타임스탬프 비교 로그 확인
3. **Race condition**: `localStreamRef` 업데이트 시점 확인

### 시그널링 문제 디버깅
1. **Offer 무시**: `webrtcInitState.status` 확인 (stable 상태 필요)
2. **Answer 무시**: `signalingState`가 `have-local-offer`인지 확인
3. **시그널 처리 중복**: `isProcessingSignal` 플래그 확인

### 로깅
모든 WebRTC 이벤트는 `logWebRTCEvent()` 유틸리티를 통해 구조화된 로그를 출력합니다:
```javascript
logWebRTCEvent('offer', {
  direction: '송신',
  myNickname: 'User1',
  targetNickname: 'User2'
});
```

## 🚀 향후 개선 방향

### 1. 에러 핸들링 강화
- 각 훅에서 발생하는 에러를 MediaContext로 전파
- 사용자 친화적 에러 메시지 표시

### 2. 성능 최적화
- SimplePeer 재사용 전략 검토
- 불필요한 재렌더링 방지

### 3. 테스트 커버리지 확대
- 각 훅의 단위 테스트 작성
- E2E 테스트로 전체 플로우 검증

### 4. TypeScript 마이그레이션
- 타입 안정성 확보
- IDE 자동완성 지원

## 📝 변경 이력

### Phase 1-5 (2025-11-27)
- 유틸리티 함수 추출 (`lib/webrtcUtils.js`)
- 재연결 상태를 MediaContext로 이동
- 초기화 플래그를 상태 머신으로 통합
- 시그널링 로직 분리 (`useWebRTCSignaling.js`)
- 재연결 로직 분리 (`useWebRTCReconnection.js`)
- useWebRTC.js 크기 32% 감소 (880 → 598 lines)
