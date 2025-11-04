/**
 * ChatService 클래스
 * 채팅 메시지 관리 및 하이브리드 메시지 구분 방식 구현
 *
 * 하이브리드 메시지 구분 방식:
 * - isLocal 플래그: 즉각적인 UI 반응 (내 메시지 즉시 표시)
 * - senderId: 명확한 메시지 소유권 구분
 * - senderName: 향후 다자간 통화 확장 시 발신자 표시
 */
class ChatService {
  constructor(socketId, userName) {
    this.messages = [];
    this.unreadCount = 0;
    this.currentUser = {
      id: socketId,
      name: userName || `User_${Math.random().toString(36).substr(2, 4)}`,
    };
    this.messageReceivedHandler = null;
  }

  /**
   * 현재 사용자 정보 업데이트
   * @param {string} socketId - Socket ID
   * @param {string} userName - 사용자 이름 (선택적)
   */
  updateCurrentUser(socketId, userName) {
    this.currentUser = {
      id: socketId,
      name: userName || this.currentUser.name,
    };
    console.log("현재 사용자 정보 업데이트:", this.currentUser);
  }

  /**
   * 메시지 전송 (로컬 메시지 생성)
   * @param {string} content - 메시지 내용
   * @returns {Object} - 생성된 메시지 객체 (isLocal: true)
   */
  sendMessage(content) {
    if (!content || content.trim() === "") {
      console.warn("빈 메시지는 전송할 수 없습니다.");
      return null;
    }

    // 로컬 메시지 생성 (하이브리드 방식)
    const message = {
      id: this._generateMessageId(),
      senderId: this.currentUser.id,
      senderName: this.currentUser.name,
      content: content.trim(),
      timestamp: new Date(),
      isLocal: true, // 내 메시지
    };

    // 메시지 배열에 추가
    this.messages.push(message);

    console.log("로컬 메시지 생성:", message);

    return message;
  }

  /**
   * 메시지 추가 (원격 메시지 또는 로컬 메시지)
   * @param {Object} message - 메시지 객체
   */
  addMessage(message) {
    if (!message) {
      console.warn("유효하지 않은 메시지입니다.");
      return;
    }

    // 메시지 배열에 추가
    this.messages.push(message);

    // 원격 메시지인 경우 읽지 않은 메시지 카운트 증가
    if (!message.isLocal) {
      this.incrementUnreadCount();

      // 메시지 수신 이벤트 핸들러 호출
      if (this.messageReceivedHandler) {
        this.messageReceivedHandler(message);
      }
    }

    console.log("메시지 추가:", message);
  }

  /**
   * 모든 메시지 반환
   * @returns {Array} - 메시지 배열
   */
  getMessages() {
    return this.messages;
  }

  /**
   * 읽지 않은 메시지 카운트 초기화
   */
  clearUnreadCount() {
    this.unreadCount = 0;
    console.log("읽지 않은 메시지 카운트 초기화");
  }

  /**
   * 읽지 않은 메시지 카운트 증가
   */
  incrementUnreadCount() {
    this.unreadCount += 1;
    console.log("읽지 않은 메시지 카운트 증가:", this.unreadCount);
  }

  /**
   * 읽지 않은 메시지 카운트 반환
   * @returns {number}
   */
  getUnreadCount() {
    return this.unreadCount;
  }

  /**
   * 메시지 수신 이벤트 핸들러 등록
   * @param {Function} handler - 메시지 수신 시 호출될 콜백 함수
   */
  onMessageReceived(handler) {
    this.messageReceivedHandler = handler;
  }

  /**
   * 현재 사용자 정보 반환
   * @returns {Object} - { id, name }
   */
  getCurrentUser() {
    return this.currentUser;
  }

  /**
   * 메시지 배열 초기화
   */
  clearMessages() {
    this.messages = [];
    this.unreadCount = 0;
    console.log("메시지 배열 초기화");
  }

  /**
   * 고유 메시지 ID 생성
   * @private
   * @returns {string}
   */
  _generateMessageId() {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 리소스 정리
   */
  destroy() {
    this.messages = [];
    this.unreadCount = 0;
    this.messageReceivedHandler = null;
    console.log("ChatService 리소스 정리 완료");
  }
}

export default ChatService;
