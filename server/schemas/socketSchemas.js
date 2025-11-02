/**
 * Socket 이벤트 데이터 검증 스키마
 * Zod를 사용한 타입 안전한 데이터 검증
 */
import { z } from "zod";

/**
 * 방 ID 스키마
 */
export const roomIdSchema = z.string().min(1, "방 ID는 필수입니다");

/**
 * 소켓 ID 스키마
 */
export const socketIdSchema = z.string().min(1, "소켓 ID는 필수입니다");

/**
 * 방 참가 이벤트 스키마
 */
export const roomJoinSchema = z.object({
  roomId: roomIdSchema,
});

/**
 * 방 퇴장 이벤트 스키마
 */
export const roomLeaveSchema = z.object({
  roomId: roomIdSchema,
});

/**
 * WebRTC 시그널 스키마 (offer/answer)
 */
export const signalSchema = z.object({
  to: socketIdSchema,
  signal: z.object({
    type: z.enum(["offer", "answer"], {
      errorMap: () => ({ message: "시그널 타입은 offer 또는 answer여야 합니다" }),
    }),
    sdp: z.string().min(1, "SDP 데이터는 필수입니다"),
  }),
});

/**
 * ICE candidate 스키마
 */
export const iceCandidateSchema = z.object({
  to: socketIdSchema,
  candidate: z.object({
    candidate: z.string(),
    sdpMLineIndex: z.number().optional(),
    sdpMid: z.string().optional(),
  }),
});

/**
 * 화이트보드 이벤트 스키마
 */
export const whiteboardEventSchema = z.object({
  roomId: roomIdSchema,
  event: z.object({
    type: z.string().min(1, "이벤트 타입은 필수입니다"),
    data: z.any().optional(),
  }),
});

/**
 * RoomManager 파라미터 스키마
 */
export const roomManagerParamsSchema = z.object({
  roomId: roomIdSchema,
  socketId: socketIdSchema.optional(),
});
