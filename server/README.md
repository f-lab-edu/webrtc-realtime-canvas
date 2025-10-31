# Signaling Server

WebRTC 시그널링 및 화이트보드 이벤트 중계를 위한 Express + Socket.io 서버입니다.

## 설치

프로젝트 루트에서 의존성이 이미 설치되어 있습니다.

## 환경 변수 설정

`server/.env` 파일을 생성하고 다음 변수를 설정하세요:

```env
PORT=3001
CORS_ORIGIN=http://localhost:3000
```

## 서버 실행

### 개발 모드 (nodemon 사용)
```bash
npm run server:dev
```

### 프로덕션 모드
```bash
npm run server
```

## API 엔드포인트

### GET /health
서버 상태 확인

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2025-10-31T12:00:00.000Z"
}
```

## Socket.io 이벤트

현재 구현된 기본 이벤트:
- `connection`: 클라이언트 연결
- `disconnect`: 클라이언트 연결 해제

추가 이벤트는 다음 태스크에서 구현됩니다.
