# tests 폴더

WebRTC SFU 서버의 부하 테스트 도구 모음입니다.

## 개요

이 폴더는 Puppeteer 기반의 가상 WebRTC 클라이언트를 사용하여 SFU 서버의 성능과 안정성을 검증하는 부하 테스트 도구를 제공합니다.

```
tests/
└── load-test/
    ├── cli.js                 # CLI 진입점
    ├── LoadTestRunner.js      # 단일 방 부하 테스트 실행기
    ├── MultiRoomRunner.js     # 다중 방 부하 테스트 실행기
    ├── VirtualClient.js       # Puppeteer 기반 가상 클라이언트
    ├── utils/
    │   ├── fake-media.js      # 가짜 미디어 스트림 생성
    │   ├── logger.js          # 로깅 유틸리티
    │   └── userDistributor.js # 사용자 방 배정 유틸리티
    └── scenarios/
        └── gradual-load.js    # 점진적 부하 시나리오
```

## 핵심 컴포넌트

### VirtualClient

Puppeteer로 Headless Chrome을 제어하여 실제 WebRTC 연결을 수립하는 가상 클라이언트입니다.

- 실제 브라우저에서 WebRTC 연결 수립
- 가짜 미디어 스트림(Canvas 패턴 또는 비디오 파일) 전송
- 방 자동 참가 및 연결 상태 모니터링

### LoadTestRunner

단일 방에 여러 사용자를 점진적으로 투입하는 테스트 실행기입니다.

- 점진적 부하 증가 (Gradual Load)
- 스트레스 테스트 (동시 접속)
- 실시간 메트릭 수집

### MultiRoomRunner

다중 방에 사용자를 랜덤 분배하여 테스트하는 실행기입니다.

- 완전 랜덤 방 분배 (실제 서비스 환경 시뮬레이션)
- 방별 연결 현황 모니터링
- 비디오 파일 소스 지원

## 사용법

### 사전 요구사항

```bash
# 서버 실행 (별도 터미널)
npm run server:dev

# 프론트엔드 실행 (별도 터미널)
npm run dev
```

### 기본 부하 테스트

```bash
# 기본 실행 (5명, 3분)
npm run load-test

# 옵션 지정
npm run load-test -- --users 10 --duration 5

# 사용 가능한 옵션
# -r, --room <roomId>      방 ID (기본: load-test-{timestamp})
# -u, --users <count>      목표 사용자 수 (기본: 5)
# -i, --interval <seconds> 사용자 추가 간격 (기본: 10초)
# -d, --duration <minutes> 테스트 지속 시간 (기본: 3분)
# -s, --server <url>       서버 URL (기본: http://localhost:3000)
# --no-headless            브라우저 창 표시 (디버깅용)
# --stress                 스트레스 모드 (동시 접속)
# -o, --output <path>      결과 저장 경로 (기본: ./metrics)
```

### 단일 클라이언트 테스트

연결 확인용 단일 클라이언트 테스트입니다.

```bash
npm run load-test:single

# 옵션 지정
npm run load-test -- single --room test-room --timeout 60
```

### 다중 방 테스트

```bash
npm run load-test -- multi --rooms 3 --users 30

# 비디오 파일 사용 (실제 비트레이트 트래픽 발생)
npm run load-test -- multi --rooms 3 --users 30 --video sample.mp4

# 사용 가능한 옵션
# -n, --rooms <count>      방 개수 (기본: 3)
# -u, --users <count>      전체 사용자 수 (기본: 30)
# -v, --video <filename>   비디오 파일 (public/video/ 폴더 내)
```

## 테스트 결과

테스트 완료 후 `./metrics` 폴더에 결과가 저장됩니다.

```
metrics/
├── load-test-2025-12-26T10-30-00-000Z.json  # 전체 리포트
└── load-test-2025-12-26T10-30-00-000Z.csv   # 시계열 메트릭
```

### JSON 리포트 구조

```json
{
  "summary": "테스트 결과 요약 텍스트",
  "config": {
    "serverUrl": "http://localhost:3000",
    "roomId": "load-test-xxx",
    "targetUsers": 10
  },
  "results": {
    "totalDuration": 180000,
    "totalClients": 10,
    "connectedCount": 10,
    "successRate": 1.0
  },
  "metrics": [
    { "timestamp": "...", "connectedClients": 5, "failedClients": 0 }
  ]
}
```

### CSV 메트릭 형식

```csv
timestamp,elapsed_ms,total_clients,connected_clients,failed_clients
2025-12-26T10:30:05.000Z,5000,3,3,0
2025-12-26T10:30:10.000Z,10000,5,5,0
```

## 미디어 소스 옵션

### Canvas 패턴 (기본)

비디오 파일 없이 Canvas에서 테스트 패턴을 생성합니다.

- 색상 순환 배경
- 프레임 카운터 표시
- 움직이는 원 애니메이션

### 비디오 파일

실제 비트레이트 트래픽을 발생시키려면 비디오 파일을 사용합니다.

```bash
# 1. 비디오 파일 배치
cp your-video.mp4 public/video/

# 2. 테스트 실행
npm run load-test -- multi --video your-video.mp4
```

## 로그

테스트 로그는 `./logs/VirtualClient.log`에 저장됩니다.

```bash
# 로그 실시간 확인 (Unix)
tail -f logs/VirtualClient.log

# Windows PowerShell
Get-Content logs/VirtualClient.log -Wait
```

## 디버깅

### 브라우저 창 표시

```bash
npm run load-test -- --no-headless
```

### 스크린샷 자동 저장

방 UI 로드 실패 시 자동으로 스크린샷이 저장됩니다.

```
logs/screenshot-{userId}-{timestamp}.png
```

## 주의사항

- 부하 테스트는 시스템 리소스를 많이 사용합니다
- 각 가상 클라이언트는 Chrome 프로세스를 생성합니다
- 권장: 클라이언트 수를 서버 CPU 코어 수의 2배 이내로 제한
- Ctrl+C로 테스트를 중지하면 결과가 저장된 후 종료됩니다
