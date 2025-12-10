import { createServer } from "node:http";
import cors from "cors";
import dotenv from "dotenv";
import express, { json } from "express";
import { Server } from "socket.io";
import registerChatHandlers from "./handlers/chatHandler.js";
import { registerSfuHandlers } from "./handlers/sfuHandler.js";
import registerSocketHandlers from "./handlers/socketHandler.js";
import MediasoupManager from "./managers/MediasoupManager.js";
import RoomManager from "./managers/RoomManager.js";
import SFUMonitor from "./utils/SFUMonitor.js";

dotenv.config();

const app = express();
const httpServer = createServer(app);

// CORS 설정
const corsOptions = {
  origin: process.env.CORS_ORIGIN || "http://localhost:3000",
  methods: ["GET", "POST"],
  credentials: true,
};

app.use(cors(corsOptions));
app.use(json());

// Socket.io 서버 설정
const io = new Server(httpServer, {
  cors: corsOptions,
  pingTimeout: 60000,
  pingInterval: 25000,
});

// RoomManager 인스턴스 생성
const roomManager = new RoomManager();

// MediasoupManager 싱글톤 인스턴스
const mediasoupManager = MediasoupManager.getInstance();

// SFUMonitor 인스턴스 (환경변수로 활성화)
let sfuMonitor = null;

// 헬스 체크 엔드포인트
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// SFU 상태 엔드포인트 (디버깅용)
app.get("/sfu/stats", (_req, res) => {
  res.json({
    status: "ok",
    stats: mediasoupManager.getStats(),
    timestamp: new Date().toISOString(),
  });
});

// SFU 메트릭 엔드포인트 (부하 테스트용)
app.get("/sfu/metrics", async (_req, res) => {
  try {
    // 일회성 스냅샷 수집용 모니터 인스턴스
    const tempMonitor = new SFUMonitor(mediasoupManager, { consoleOutput: false });
    const snapshot = await tempMonitor.getSnapshot();

    res.json({
      status: "ok",
      metrics: snapshot,
      monitoring: sfuMonitor?.isMonitoring() || false,
      csvFilepath: sfuMonitor?.getCsvFilepath() || null,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[/sfu/metrics] 에러:", error);
    res.status(500).json({ error: error.message });
  }
});

// Socket.io 연결 처리
io.on("connection", (socket) => {
  console.log(`클라이언트 연결됨: ${socket.id}`);

  // Socket 에러 핸들링
  socket.on("error", (error) => {
    console.error(`[Socket ${socket.id}] 에러 발생:`, error);
  });

  // Socket 이벤트 핸들러 등록
  registerSocketHandlers(io, socket, roomManager);

  // 채팅 이벤트 핸들러 등록
  registerChatHandlers(io, socket, roomManager);

  // SFU 이벤트 핸들러 등록
  registerSfuHandlers(io, socket, roomManager, mediasoupManager);
});

// 서버 시작
const PORT = process.env.PORT || 3005;

// MediasoupManager 초기화 후 서버 시작
const startServer = async () => {
  try {
    // mediasoup Worker 풀 초기화
    await mediasoupManager.initialize();

    // 모니터링 활성화 (환경변수로 제어)
    if (process.env.ENABLE_MONITORING === "true") {
      sfuMonitor = new SFUMonitor(mediasoupManager, {
        intervalMs: Number(process.env.METRICS_INTERVAL_MS) || 1000,
        outputDir: process.env.METRICS_OUTPUT_DIR || "./metrics",
        consoleOutput: process.env.METRICS_CONSOLE_OUTPUT !== "false",
      });
      await sfuMonitor.start();
      console.log(`SFU 모니터링 활성화: 간격 ${process.env.METRICS_INTERVAL_MS || 1000}ms`);
    }

    httpServer.listen(PORT, () => {
      console.log(`Signaling server running on port ${PORT}`);
      console.log(`CORS origin: ${corsOptions.origin}`);
      console.log(`SFU 상태 확인: http://localhost:${PORT}/sfu/stats`);
      console.log(`SFU 메트릭: http://localhost:${PORT}/sfu/metrics`);
    });
  } catch (error) {
    console.error("서버 시작 실패:", error);
    process.exit(1);
  }
};

startServer();

// 에러 핸들링
process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
  mediasoupManager.cleanup();
  roomManager.cleanup();
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
  mediasoupManager.cleanup();
  roomManager.cleanup();
  process.exit(1);
});

// 정상 종료 시 리소스 정리
process.on("SIGTERM", () => {
  console.log("SIGTERM 신호 수신, 서버 종료 중...");
  if (sfuMonitor) sfuMonitor.stop();
  mediasoupManager.cleanup();
  roomManager.cleanup();
  httpServer.close(() => {
    console.log("서버 종료 완료");
    process.exit(0);
  });
});

process.on("SIGINT", () => {
  console.log("SIGINT 신호 수신, 서버 종료 중...");
  if (sfuMonitor) sfuMonitor.stop();
  mediasoupManager.cleanup();
  roomManager.cleanup();
  httpServer.close(() => {
    console.log("서버 종료 완료");
    process.exit(0);
  });
});

export default { app, io, httpServer, roomManager, mediasoupManager };
