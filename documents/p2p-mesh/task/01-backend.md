# Task 1: 백엔드 구현 (Phase 1 + 1.5)

## 참조 문서

- [003-backend-implementation.md](../design/003-backend-implementation.md)
- [001-architecture-design.md](../design/001-architecture-design.md)

---

## 체크리스트

### Sub-task 1-1: RoomManager.js 수정

- [x] rooms 구조 변경 (Map → 상세 구조)

  ```javascript
  // 기존: Map<roomId, Set<socketId>>
  // 변경: Map<roomId, { participants, hostSocketId, maxParticipants, ... }>
  ```

- [x] `createRoom()` 수정 (maxParticipants 기본값 6, 호스트 설정)
- [x] `joinRoom()` 수정 (기존 참가자 목록 반환)
- [x] `leaveRoom()` 원자화 (Critical)
  - [x] 참가자 제거, 호스트 승계, 방 삭제를 단일 트랜잭션으로
  - [x] 반환값: `{ wasHost, newHostId, remainingParticipants, roomDeleted }`
- [x] 호스트/권한 관리 메서드 추가
  - [x] `getHost(roomId)`
  - [x] `transferHost(roomId, newHostSocketId)`
  - [x] `grantScreenSharePermission(roomId, socketId)`
  - [x] `revokeScreenSharePermission(roomId, socketId)`

> Commit: `feat(server): RoomManager P2P Mesh 다중 참가자 지원`

---

### Sub-task 1-2: socketHandler.js 수정

- [ ] Zod 스키마 정의

  ```javascript
  const joinRoomSchema = z.object({
    roomId: z.string().min(1),
    nickname: z.string().min(1).max(20)
  });
  ```

- [ ] `room:join` 핸들러 수정
  - [ ] 기존 참가자 목록 반환
  - [ ] 새 참가자 입장 브로드캐스트
- [ ] WebRTC 시그널 이벤트 수정 (`to` 필드 추가)
  - [ ] `webrtc:offer` → `{ to, signal }`
  - [ ] `webrtc:answer` → `{ to, signal }`
  - [ ] `webrtc:candidate` → `{ to, signal }`
- [ ] 화면 공유 이벤트 핸들러 추가
  - [ ] `screen:start`
  - [ ] `screen:stop`
- [ ] 화이트보드 권한 체크 로직 추가 (호스트 전용)
  - [ ] `whiteboard:draw` 핸들러에 호스트 검증 추가
  - [ ] 비호스트 그리기 시도 시 `whiteboard:denied` 이벤트 반환
- [ ] `disconnect` 핸들러 수정 (원자적 leaveRoom 호출)

> Commit: `feat(server): socketHandler P2P Mesh 시그널링 지원`

---

### Sub-task 1-3: Handler 분리 (Phase 1.5)

- [ ] `server/handlers/roomHandler.js` 분리
  - [ ] `room:join`, `room:leave` 핸들러
- [ ] `server/handlers/signalingHandler.js` 분리
  - [ ] `webrtc:offer`, `webrtc:answer`, `webrtc:candidate` 핸들러
- [ ] `server/handlers/screenShareHandler.js` 분리
  - [ ] `screen:start`, `screen:stop` 핸들러
- [ ] `server/handlers/whiteboardHandler.js` 분리
  - [ ] `whiteboard:draw` 핸들러 (호스트 권한 체크 포함)
- [ ] `socketHandler.js` → 라우터 역할로 리팩토링
  - [ ] 각 핸들러 모듈 import 및 등록만 수행

> Commit: `refactor(server): socketHandler 모듈 분리`

---

### Sub-task 1-4: 백엔드 테스트

- [ ] RoomManager 단위 테스트 작성
  - [ ] 방 생성/참가/퇴장 기본 시나리오
  - [ ] 다중 참가자 시나리오 (6명)
  - [ ] 호스트 승계 시나리오
  - [ ] 권한 관리 시나리오
  - [ ] 엣지 케이스 (존재하지 않는 방, 중복 참가 등)
- [ ] Jest 실행 및 통과 확인: `npm test`

> Commit: `test(server): RoomManager 단위 테스트 추가`
