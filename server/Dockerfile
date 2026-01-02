# ============================================
# WebRTC SFU Server Dockerfile
# 목적: mediasoup 기반 SFU 서버 컨테이너 이미지 생성
# ============================================

# ============================================
# Stage 1: 빌드 스테이지
# mediasoup은 네이티브 바이너리를 빌드하므로 빌드 도구 필요
# ============================================
FROM node:20-bookworm AS builder

WORKDIR /app

# 빌드 도구 설치 (mediasoup 네이티브 빌드용)
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# package.json만 먼저 복사 (캐싱 최적화)
COPY package*.json ./

# production 의존성만 설치 (devDependencies 제외)
RUN npm ci --only=production

# ============================================
# Stage 2: 런타임 스테이지
# ============================================
FROM node:20-bookworm-slim

WORKDIR /app

# 런타임에 필요한 최소 라이브러리 및 curl (헬스체크용)
# tzdata: 시간대 설정용
RUN apt-get update && apt-get install -y \
    libstdc++6 \
    curl \
    tzdata \
    && rm -rf /var/lib/apt/lists/* \
    && ln -snf /usr/share/zoneinfo/Asia/Seoul /etc/localtime \
    && echo "Asia/Seoul" > /etc/timezone

# 빌드된 node_modules 복사
COPY --from=builder /app/node_modules ./node_modules

# 서버 코드만 복사 (Frontend 제외)
COPY server/ ./server/
COPY package.json ./

# 로그 및 메트릭 디렉토리 생성
RUN mkdir -p /app/logs /app/metrics

# 비루트 사용자 생성 (보안)
RUN groupadd -r sfu && useradd -r -g sfu sfu
RUN chown -R sfu:sfu /app
USER sfu

# 환경변수 기본값
ENV NODE_ENV=production
ENV PORT=3100
ENV TZ=Asia/Seoul
ENV MEDIASOUP_LISTEN_IP=0.0.0.0
ENV MEDIASOUP_ANNOUNCED_IP=127.0.0.1

# 포트 노출
# 3100: 시그널링 (TCP) - Windows Hyper-V 예약 포트 회피
# 10000-10100: RTP 미디어 (UDP/TCP)
EXPOSE 3100/tcp
EXPOSE 10000-10100/udp
EXPOSE 10000-10100/tcp

# 헬스체크
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:3100/health || exit 1

# 서버 실행
CMD ["node", "server/index.js"]
