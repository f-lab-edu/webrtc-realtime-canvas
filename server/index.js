import { createServer } from "node:http";
import cors from "cors";
import dotenv from "dotenv";
import express, { json } from "express";
import { Server } from "socket.io";
import registerChatHandlers from "./handlers/chatHandler.js";
import registerSocketHandlers from "./handlers/socketHandler.js";
import RoomManager from "./managers/RoomManager.js";

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

// 헬스 체크 엔드포인트
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
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
});

// 서버 시작
const PORT = process.env.PORT || 3005;

httpServer.listen(PORT, () => {
  console.log(`Signaling server running on port ${PORT}`);
  console.log(`CORS origin: ${corsOptions.origin}`);
});

// 에러 핸들링
process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
  roomManager.cleanup();
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
  roomManager.cleanup();
  process.exit(1);
});

// 정상 종료 시 리소스 정리
process.on("SIGTERM", () => {
  console.log("SIGTERM 신호 수신, 서버 종료 중...");
  roomManager.cleanup();
  httpServer.close(() => {
    console.log("서버 종료 완료");
    process.exit(0);
  });
});

process.on("SIGINT", () => {
  console.log("SIGINT 신호 수신, 서버 종료 중...");
  roomManager.cleanup();
  httpServer.close(() => {
    console.log("서버 종료 완료");
    process.exit(0);
  });
});

export default { app, io, httpServer, roomManager };
