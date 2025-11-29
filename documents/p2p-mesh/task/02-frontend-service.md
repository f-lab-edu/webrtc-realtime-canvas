# Task 2: WebRTCService 리팩토링 (Phase 2)

## 참조 문서

- [004-frontend-implementation.md](../design/004-frontend-implementation.md) (WebRTCService 섹션)

---

## 체크리스트

### Sub-task 2-1: WebRTCService.js 리팩토링

- [x] `peers` Map 추가 (`Map<socketId, SimplePeer>`)
- [x] `pendingSignals` Map 추가 (Critical)

  ```javascript
  // Early Candidates 문제 해결을 위한 시그널 큐
  pendingSignals = new Map(); // Map<socketId, Signal[]>
  ```

- [x] ICE 상태 콜백 추가 (High)
  - [x] `onIceStateChange(socketId, state)` 콜백
  - [x] 상태: `new`, `checking`, `connected`, `completed`, `failed`, `disconnected`, `closed`
- [x] `initializePeer(socketId, initiator, stream)` 작성
  - [x] SimplePeer 인스턴스 생성
  - [x] 이벤트 핸들러 등록 (signal, stream, connect, close, error)
  - [x] 대기 중인 시그널 flush
- [x] `signal(socketId, signalData)` 수정
  - [x] peer 존재 시: 즉시 signal 전달
  - [x] peer 미존재 시: pendingSignals에 큐잉
- [x] `flushPendingSignals(socketId)` 작성
  - [x] 큐에 쌓인 시그널 순차 전달
  - [x] 처리 후 큐 초기화
- [x] `removePeer(socketId)` 수정
  - [x] try-finally 패턴으로 리소스 정리 보장
  - [x] peers Map에서 제거
  - [x] pendingSignals 정리
- [x] `destroyAll()` 작성 (모든 peer 정리)
- [x] `replaceTrack(newTrack)` 작성 (화면 공유용)

> Commit: `feat(frontend): WebRTCService 다중 Peer 지원`

---

### Sub-task 2-2: WebRTCService 테스트

- [x] SimplePeer 모킹 설정

  ```javascript
  jest.unstable_mockModule("simple-peer", () => ({
    default: mockSimplePeer,
  }));
  ```

- [x] 시그널 큐 테스트
  - [x] peer 생성 전 시그널 → 큐에 저장
  - [x] peer 생성 후 → 큐 flush
  - [x] 큐 순서 보장 확인
  - [x] 빈 큐 처리
- [x] ICE 상태 테스트
  - [x] 상태 변화 콜백 호출 확인
  - [x] failed 상태 시 재연결 로직 (있다면)
  - [x] disconnected 상태 처리
- [x] 메모리 누수 방지 테스트
  - [x] removePeer 후 Map 정리 확인
  - [x] destroyAll 후 전체 정리 확인

> Commit: `test(frontend): WebRTCService 단위 테스트 추가`
