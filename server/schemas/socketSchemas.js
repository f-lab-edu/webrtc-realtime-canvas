/**
 * Socket 이벤트 데이터 검증 스키마
 * Zod를 사용한 타입 안전한 데이터 검증
 */
import { z } from "zod";

/**
 * 방 ID 스키마
 * - 영문 소문자, 숫자, 하이픈만 허용
 * - 연속 하이픈, 앞뒤 하이픈 불가
 * - 최소 3자, 최대 50자
 */
export const roomIdSchema = z
  .string()
  .min(3, "방 이름은 최소 3자 이상이어야 합니다")
  .max(50, "방 이름은 50자를 초과할 수 없습니다")
  .regex(
    /^[a-z0-9]+(-[a-z0-9]+)*$/,
    "방 이름은 영문 소문자, 숫자, 하이픈만 사용 가능합니다 (연속 하이픈 불가)"
  );

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

/**
 * 채팅 메시지 스키마
 */
export const chatMessageSchema = z.object({
  roomId: roomIdSchema,
  message: z.object({
    id: z.string().min(1, "메시지 ID는 필수입니다"),
    senderId: socketIdSchema,
    senderName: z.string().min(1, "발신자 이름은 필수입니다"),
    content: z.string().min(1, "메시지 내용은 필수입니다").max(1000, "메시지는 1000자를 초과할 수 없습니다"),
    timestamp: z.coerce.date(),
  }),
});

/**
 * 타이핑 상태 스키마 (선택적)
 */
export const chatTypingSchema = z.object({
  roomId: roomIdSchema,
  isTyping: z.boolean(),
});
