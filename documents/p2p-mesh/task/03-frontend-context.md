# Task 3: Context/Hook 리팩토링 (Phase 3)

## 참조 문서

- [004-frontend-implementation.md](../design/004-frontend-implementation.md) (RoomContext, MediaContext, useWebRTC 섹션)

---

## 체크리스트

### Sub-task 3-1: RoomContext.js 수정

- [x] 호스트 상태 추가

  ```javascript
  const [isHost, setIsHost] = useState(false);
  const [hostSocketId, setHostSocketId] = useState(null);
  ```

- [x] 권한 상태 추가

  ```javascript
  const [hasScreenSharePermission, setHasScreenSharePermission] = useState(false);
  ```

- [x] 권한 관리 메서드 추가
  - [x] `requestScreenSharePermission()`
  - [x] `grantScreenSharePermission(targetSocketId)` (호스트 전용)
  - [x] `revokeScreenSharePermission(targetSocketId)` (호스트 전용)
- [x] Socket 이벤트 리스너 추가
  - [x] `room:host-changed` → 호스트 변경 처리
  - [x] `screen-share:permission-granted` → 권한 부여 처리
  - [x] `screen-share:permission-revoked` → 권한 회수 처리

> Commit: `feat(frontend): RoomContext 호스트/권한 관리`

---

### Sub-task 3-2: MediaContext.js 수정

- [ ] `remoteStreams` Map으로 변경

  ```javascript
  // 기존: remoteStream (단일)
  // 변경: remoteStreams = new Map<socketId, MediaStream>()
  const [remoteStreams, setRemoteStreams] = useState(new Map());
  ```

- [ ] `addRemoteStream(socketId, stream)` 추가

  ```javascript
  setRemoteStreams(prev => new Map(prev).set(socketId, stream));
  ```

- [ ] `removeRemoteStream(socketId)` 추가

  ```javascript
  setRemoteStreams(prev => {
    const next = new Map(prev);
    next.delete(socketId);
    return next;
  });
  ```

- [ ] `toggleScreenShare()` 권한 체크 추가
  - [ ] `hasScreenSharePermission` 또는 `isHost` 확인
  - [ ] 권한 없을 시 에러 처리
- [ ] `cleanupMedia()` 수정
  - [ ] 모든 remoteStreams 정리
  - [ ] WebRTCService.destroyAll() 호출

> Commit: `feat(frontend): MediaContext 다중 스트림 지원`

---

### Sub-task 3-3: useWebRTC.js 리팩토링

- [ ] `room:joined` 핸들러 (기존 참가자와 연결)

  ```javascript
  // 나(신규 참가자)가 기존 참가자들에게 offer 전송
  existingParticipants.forEach(participant => {
    webrtcService.initializePeer(participant.socketId, true, localStream);
  });
  ```

- [ ] `room:participant-joined` 핸들러 (새 참가자 연결)

  ```javascript
  // 기존 참가자인 나는 새 참가자의 offer를 기다림 (initiator: false)
  webrtcService.initializePeer(newParticipant.socketId, false, localStream);
  ```

- [ ] WebRTC 시그널 핸들러들
  - [ ] `webrtc:offer` → `webrtcService.signal(from, signal)`
  - [ ] `webrtc:answer` → `webrtcService.signal(from, signal)`
  - [ ] `webrtc:candidate` → `webrtcService.signal(from, signal)`
- [ ] `room:participant-left` 핸들러
  - [ ] `webrtcService.removePeer(leftSocketId)`
  - [ ] `removeRemoteStream(leftSocketId)`
- [ ] 중복 실행 방지 플래그

  ```javascript
  const hasInitializedRef = useRef(false);
  const isInitializingRef = useRef(false);
  // ❌ isProcessingSignalRef 삭제 - Signal Queue가 WebRTCService에서 처리
  ```

- [ ] 시그널 핸들러에서 플래그 체크 로직 제거 (signal() 직접 호출)

> Commit: `feat(frontend): useWebRTC 다중 Peer 초기화`

---

### Sub-task 3-4: WhiteboardContext.js 수정 (호스트 전용 제어)

- [ ] 화이트보드 초기화 시 `isHost` 권한 체크
  ```javascript
  // 호스트만 그리기 모드 활성화
  if (isHost) {
    service.enableDrawing();
  } else {
    service.disableDrawing();
  }
  ```
- [ ] `sendDrawEvent()` 호스트 권한 검증 추가
  - [ ] 비호스트 그리기 시도 시 경고 로그
- [ ] `whiteboard:denied` 이벤트 리스너 추가
- [ ] WhiteboardService에 `enableDrawing()`, `disableDrawing()` 메서드 추가

> Commit: `feat(frontend): WhiteboardContext 호스트 전용 제어`
