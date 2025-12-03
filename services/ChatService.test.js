/**
 * ChatService 테스트
 * 채팅 메시지 닉네임 표시 테스트
 */
import ChatService from "./ChatService.js";

// Jest globals는 injectGlobals: true로 자동 주입됨

describe("ChatService", () => {
  let chatService;
  const socketId = "socket-123";
  const nickname = "홍길동";

  beforeEach(() => {
    chatService = new ChatService(socketId, nickname);
  });

  describe("초기화", () => {
    it("닉네임과 함께 ChatService를 초기화할 수 있다", () => {
      // Given & When: ChatService 생성
      const service = new ChatService(socketId, nickname);

      // Then: 현재 사용자 정보가 설정됨
      const currentUser = service.getCurrentUser();
      expect(currentUser.id).toBe(socketId);
      expect(currentUser.name).toBe(nickname);
    });

    it("닉네임 없이 ChatService를 초기화하면 기본 닉네임이 생성된다", () => {
      // Given & When: 닉네임 없이 ChatService 생성
      const service = new ChatService(socketId);

      // Then: 기본 닉네임이 생성됨 (user + socketId 앞 4자리)
      const currentUser = service.getCurrentUser();
      expect(currentUser.id).toBe(socketId);
      expect(currentUser.name).toBe("usersock"); // socketId "socket-123"의 앞 4자리 "sock"
    });
  });

  describe("메시지 전송 (본인 메시지)", () => {
    it("메시지를 전송하면 닉네임이 포함된다", () => {
      // Given: 메시지 내용
      const content = "안녕하세요";

      // When: 메시지 전송
      const message = chatService.sendMessage(content);

      // Then: 닉네임이 포함됨
      expect(message).toBeDefined();
      expect(message.senderName).toBe(nickname);
      expect(message.senderId).toBe(socketId);
      expect(message.content).toBe(content);
      expect(message.isLocal).toBe(true);
    });

    it("본인 메시지는 isLocal이 true이다", () => {
      // Given: 메시지 내용
      const content = "테스트 메시지";

      // When: 메시지 전송
      const message = chatService.sendMessage(content);

      // Then: isLocal이 true
      expect(message.isLocal).toBe(true);
    });

    it("전송된 메시지는 메시지 배열에 추가된다", () => {
      // Given: 메시지 내용
      const content = "테스트 메시지";

      // When: 메시지 전송
      chatService.sendMessage(content);

      // Then: 메시지 배열에 추가됨
      const messages = chatService.getMessages();
      expect(messages).toHaveLength(1);
      expect(messages[0].content).toBe(content);
      expect(messages[0].senderName).toBe(nickname);
    });

    it("빈 메시지는 전송할 수 없다", () => {
      // Given: 빈 메시지
      const content = "";

      // When: 메시지 전송 시도
      const message = chatService.sendMessage(content);

      // Then: null 반환
      expect(message).toBeNull();
      expect(chatService.getMessages()).toHaveLength(0);
    });
  });

  describe("메시지 수신 (상대방 메시지)", () => {
    it("상대방 메시지를 추가하면 닉네임이 표시된다", () => {
      // Given: 상대방 메시지
      const remoteMessage = {
        id: "msg-1",
        senderId: "socket-456",
        senderName: "김철수",
        content: "안녕하세요",
        timestamp: new Date(),
        isLocal: false,
      };

      // When: 메시지 추가
      chatService.addMessage(remoteMessage);

      // Then: 메시지가 추가되고 닉네임이 포함됨
      const messages = chatService.getMessages();
      expect(messages).toHaveLength(1);
      expect(messages[0].senderName).toBe("김철수");
      expect(messages[0].isLocal).toBe(false);
    });

    it("상대방 메시지는 읽지 않은 메시지 카운트를 증가시킨다", () => {
      // Given: 상대방 메시지
      const remoteMessage = {
        id: "msg-1",
        senderId: "socket-456",
        senderName: "김철수",
        content: "안녕하세요",
        timestamp: new Date(),
        isLocal: false,
      };

      // When: 메시지 추가
      chatService.addMessage(remoteMessage);

      // Then: 읽지 않은 메시지 카운트 증가
      expect(chatService.getUnreadCount()).toBe(1);
    });

    it("본인 메시지는 읽지 않은 메시지 카운트를 증가시키지 않는다", () => {
      // Given: 본인 메시지
      const localMessage = {
        id: "msg-1",
        senderId: socketId,
        senderName: nickname,
        content: "안녕하세요",
        timestamp: new Date(),
        isLocal: true,
      };

      // When: 메시지 추가
      chatService.addMessage(localMessage);

      // Then: 읽지 않은 메시지 카운트 증가하지 않음
      expect(chatService.getUnreadCount()).toBe(0);
    });
  });

  describe("여러 사용자 간 닉네임 구분", () => {
    it("여러 사용자의 메시지를 닉네임으로 구분할 수 있다", () => {
      // Given: 여러 사용자의 메시지
      const message1 = {
        id: "msg-1",
        senderId: socketId,
        senderName: "홍길동",
        content: "안녕하세요",
        timestamp: new Date(),
        isLocal: true,
      };

      const message2 = {
        id: "msg-2",
        senderId: "socket-456",
        senderName: "김철수",
        content: "반갑습니다",
        timestamp: new Date(),
        isLocal: false,
      };

      const message3 = {
        id: "msg-3",
        senderId: "socket-789",
        senderName: "이영희",
        content: "안녕하세요",
        timestamp: new Date(),
        isLocal: false,
      };

      // When: 메시지 추가
      chatService.addMessage(message1);
      chatService.addMessage(message2);
      chatService.addMessage(message3);

      // Then: 모든 메시지가 닉네임으로 구분됨
      const messages = chatService.getMessages();
      expect(messages).toHaveLength(3);
      expect(messages[0].senderName).toBe("홍길동");
      expect(messages[1].senderName).toBe("김철수");
      expect(messages[2].senderName).toBe("이영희");
    });

    it("본인 메시지와 상대방 메시지를 isLocal로 구분할 수 있다", () => {
      // Given: 본인 메시지와 상대방 메시지
      const localMessage = chatService.sendMessage("내 메시지");

      const remoteMessage = {
        id: "msg-2",
        senderId: "socket-456",
        senderName: "김철수",
        content: "상대방 메시지",
        timestamp: new Date(),
        isLocal: false,
      };

      chatService.addMessage(remoteMessage);

      // When: 메시지 조회
      const messages = chatService.getMessages();

      // Then: isLocal로 구분 가능
      expect(messages).toHaveLength(2);
      expect(messages[0].isLocal).toBe(true);
      expect(messages[0].senderName).toBe("홍길동");
      expect(messages[1].isLocal).toBe(false);
      expect(messages[1].senderName).toBe("김철수");
    });
  });

  describe("닉네임 업데이트", () => {
    it("현재 사용자 닉네임을 업데이트할 수 있다", () => {
      // Given: 초기 닉네임
      expect(chatService.getCurrentUser().name).toBe("홍길동");

      // When: 닉네임 업데이트
      const newNickname = "김철수";
      chatService.updateCurrentUser(socketId, newNickname);

      // Then: 닉네임이 업데이트됨
      expect(chatService.getCurrentUser().name).toBe(newNickname);
    });

    it("닉네임 업데이트 후 전송하는 메시지에 새 닉네임이 적용된다", () => {
      // Given: 닉네임 업데이트
      const newNickname = "김철수";
      chatService.updateCurrentUser(socketId, newNickname);

      // When: 메시지 전송
      const message = chatService.sendMessage("테스트 메시지");

      // Then: 새 닉네임이 적용됨
      expect(message.senderName).toBe(newNickname);
    });
  });

  describe("리소스 정리", () => {
    it("destroy 메서드가 모든 리소스를 정리한다", () => {
      // Given: 메시지가 있는 상태
      chatService.sendMessage("테스트 메시지");
      expect(chatService.getMessages()).toHaveLength(1);

      // When: 리소스 정리
      chatService.destroy();

      // Then: 모든 리소스가 정리됨
      expect(chatService.getMessages()).toHaveLength(0);
      expect(chatService.getUnreadCount()).toBe(0);
    });
  });
});
