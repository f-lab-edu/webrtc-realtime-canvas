# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요

WebRTC 기반 1:1 실시간 화상 채팅 및 협업 화이트보드 애플리케이션

- **Frontend**: Next.js 16 (App Router), React 19
- **Backend**: Express + Socket.io (시그널링 서버)
- **WebRTC**: SimplePeer
- **Canvas**: Fabric.js v6
- **코드 품질**: Biome (포매터/린터)
- **테스트**: Jest (ES6 modules)

## 필수 개발 규칙

### 언어 및 코딩 컨벤션

- **주석, 로그, 문서는 한국어로 작성 필수**
- 변수명, 함수명, 클래스명은 영어 (camelCase/PascalCase)
- Biome 설정 준수: 들여쓰기 2칸, 쌍따옴표, LF 줄바꿈

### 데이터 검증

- **외부 입력 데이터는 반드시 Zod 스키마로 검증** (수동 타입 체크 금지)
- 함수 시작 부분에 파라미터 검증 로직 우선 작성 (edge case 처리)
- 스키마 정의 위치: `server/schemas/` 또는 모듈 상단

### 테스트 작성

- **Jest 사용 필수** (Vitest, Mocha 사용 금지)
- **Given-When-Then 패턴 필수**
- ES6 modules 환경이므로 `@jest/globals`에서 import

## 주요 명령어

### 개발 서버 실행

```bash
# 프론트엔드 개발 서버 (포트 3000)
npm run dev

# 시그널링 서버 (포트 3001)
npm run server        # 프로덕션 모드
npm run server:dev    # 개발 모드 (nodemon)
```

### 코드 품질 도구

```bash
# Biome 포매터 (실행 전 파일 백업 권장)
npm run format        # 포맷 적용
npm run format:check  # 포맷 체크만

# Biome 린터
npm run biome:check   # 체크만
npm run biome:fix     # 자동 수정

# Next.js ESLint
npm run lint
```

### 테스트 실행

```bash
npm test              # 전체 테스트
npm run test:watch    # watch 모드
npm run test:coverage # 커버리지 리포트

# 단일 테스트 파일 실행
node --experimental-vm-modules node_modules/jest/bin/jest.js path/to/test.test.js
```

### 빌드 및 배포

```bash
npm run build         # 프로덕션 빌드
npm start             # 프로덕션 서버 시작
```

## 아키텍처 구조

### 클라이언트 (Next.js App Router)

#### Context 아키텍처 (상태 관리 계층)

프로젝트는 3개의 Context Provider로 전역 상태를 관리하며, **각 Context는 자신의 Service 인스턴스를 생성하고 소유**한다:

1. **RoomContext** (`contexts/RoomContext.js`)
   - 소유 서비스: `SocketService` 인스턴스 (ref로 관리)
   - 역할: 방 ID, 참가자 목록, Socket 연결 상태 관리
   - 핵심 메서드: `createRoom()`, `joinRoom()`, `leaveRoom()`
   - Socket 이벤트 리스너 설정 및 정리

2. **MediaContext** (`contexts/MediaContext.js`)
   - 소유 서비스: `WebRTCService` 인스턴스 (ref로 관리)
   - 역할: 미디어 스트림(로컬/원격), 화면 공유, 오디오/비디오 토글
   - 핵심 메서드: `initializeMedia()`, `toggleAudio()`, `toggleVideo()`, `toggleScreenShare()`

3. **WhiteboardContext** (예정)
   - 소유 서비스: `WhiteboardService` 인스턴스 (ref로 관리)
   - 역할: Fabric.js 캔버스 상태 및 실시간 동기화

**중요**: Service 클래스는 Context에서만 인스턴스화되며, 컴포넌트나 훅에서는 Context를 통해 접근한다.

#### Custom Hooks (비즈니스 로직 계층)

Context와 Service를 연결하여 복잡한 비즈니스 로직을 처리:

1. **useWebRTC** (`hooks/useWebRTC.js`)
   - RoomContext의 `socketService`, MediaContext의 `webrtcService` 사용
   - WebRTC 연결 초기화 및 시그널링 처리
   - 중복 실행 방지를 위한 ref 플래그 패턴:

     ```javascript
     isProcessingSignalRef.current // 시그널 처리 중
     hasInitializedRef.current      // 초기화 완료 여부
     isInitializingRef.current      // 초기화 진행 중
     ```

   - Socket 이벤트: `webrtc:offer`, `webrtc:answer`, `webrtc:candidate` 처리

2. **useWhiteboard** (`hooks/useWhiteboard.js`)
   - WhiteboardService와 SocketService 연동
   - Fabric.js 캔버스 초기화 및 실시간 동기화
   - Socket 이벤트: `whiteboard:draw` 송수신

#### Service 클래스 (순수 로직 계층)

Context로부터 독립적인 재사용 가능한 비즈니스 로직:

1. **SocketService** (`services/SocketService.js`)
   - Socket.io-client 래퍼
   - 메서드: `connect()`, `disconnect()`, `emit()`, `on()`, `off()`
   - 자동 재연결 로직 내장

2. **WebRTCService** (`services/WebRTCService.js`)
   - SimplePeer 래퍼
   - 메서드: `initialize()`, `signal()`, `replaceTrack()` (화면 공유용)
   - STUN/TURN 서버 환경 변수 처리
   - 이벤트 핸들러: `onSignal()`, `onStream()`, `onError()`, `onClose()`, `onConnect()`

3. **WhiteboardService** (`services/WhiteboardService.js`)
   - Fabric.js v6 래퍼
   - 메서드: `initialize()`, `enableDrawing()`, `applyRemoteEvent()`, `clear()`
   - 무한 루프 방지: `isApplyingRemoteEvent` 플래그로 원격 이벤트 구분
   - 브러시 설정: `setBrushColor()`, `setBrushWidth()`

### 서버 (Express + Socket.io)

#### 폴더 구조 규칙

```
server/
├── index.js                    # 서버 진입점, Socket.io 설정
├── managers/                   # 상태 관리 클래스 (PascalCase)
│   └── RoomManager.js         # 방 생성/삭제, 참가자 관리
├── handlers/                   # Socket 이벤트 핸들러 (camelCase)
│   └── socketHandler.js       # 이벤트 리스너 등록
├── schemas/                    # Zod 검증 스키마
│   └── (roomSchema.js 등)
└── .env                       # 환경 변수 (PORT, CORS_ORIGIN)
```

#### Socket.io 이벤트 플로우

**방 관리**:

- `room:join` → 방 참가 요청
- `room:joined` → 참가 성공 (참가자 목록 포함)
- `room:full` → 방 정원 초과 (1:1이므로 최대 2명)
- `room:participant-joined` → 새 참가자 입장 알림
- `room:participant-left` → 참가자 퇴장 알림

**WebRTC 시그널링**:

- `webrtc:offer` → Offer SDP 전달
- `webrtc:answer` → Answer SDP 전달
- `webrtc:candidate` → ICE Candidate 전달

**화이트보드 동기화**:

- `whiteboard:draw` → 그리기 이벤트 브로드캐스트

## 개발 원칙 (KISS, DRY, YAGNI, SRP)

### 파일 크기 관리

- 400줄 초과 시 모듈 분리 고려 (400줄 미만은 허용)

### 파일 명명 규칙

- **클래스 파일**: PascalCase (예: `RoomManager.js`)
- **함수/핸들러 파일**: camelCase (예: `socketHandler.js`)
- **테스트 파일**: `*.test.js`

## 환경 변수

### 프론트엔드 (`.env.local`)

```env
NEXT_PUBLIC_SOCKET_URL=http://localhost:3001
NEXT_PUBLIC_STUN_SERVER=stun:stun.l.google.com:19302
```

### 백엔드 (`server/.env`)

```env
PORT=3001
CORS_ORIGIN=http://localhost:3000
```

## 주의사항

### Context와 Service 관계

- **Service는 Context에서만 인스턴스화**
- 컴포넌트나 훅에서 Service를 직접 `new` 하지 않음
- Context의 ref로 Service 인스턴스를 관리하여 재생성 방지

### WebRTC 연결 초기화

- `useWebRTC` 훅에서 중복 초기화 방지 로직 필수
- `hasInitializedRef`, `isInitializingRef` 플래그로 상태 관리
- Socket 이벤트 핸들러 등록 전 기존 핸들러 정리 (`off()` 호출)

### 화이트보드 동기화

- `WhiteboardService`의 `isApplyingRemoteEvent` 플래그로 무한 루프 방지
- 원격 이벤트 적용 시 로컬 이벤트 발생 억제

### 프로세스 실행

- 서버 실행 전 `listProcesses()`로 중복 실행 여부 확인
- 이미 실행 중이면 재실행하지 않고 사용자에게 확인 요청

### Git 워크플로우

- 현재 브랜치: `feature/whiteboard-sync`
- 메인 브랜치: `main`
- PR 생성 시 feature 브랜치에서 main으로 생성

## 코드 스타일 (Biome)

- 들여쓰기: 2 spaces
- 따옴표: 쌍따옴표 (")
- 줄바꿈: LF (Unix-style)
- 설정 파일: `biome.json`, `.editorconfig`

## 디버깅 가이드

- `AUDIO_DEBUG_GUIDE.md`: 오디오 트러블슈팅 문서 참조
- `AudioDebugPanel.jsx`: 오디오 디버깅 UI 컴포넌트
