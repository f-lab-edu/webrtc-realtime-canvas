/**
 * Socket 핸들러 수동 테스트 스크립트
 * 서버를 시작하고 Socket.io 클라이언트로 연결하여 이벤트를 테스트
 */
import { io as ioClient } from 'socket.io-client';

const SERVER_URL = 'http://localhost:3001';

// 테스트 실행
const runTests = async () => {
  console.log('=== Socket 핸들러 테스트 시작 ===\n');

  // 클라이언트 1 생성
  const client1 = ioClient(SERVER_URL);
  
  // 클라이언트 2 생성
  const client2 = ioClient(SERVER_URL);

  // 클라이언트 1 연결 대기
  await new Promise((resolve) => {
    client1.on('connect', () => {
      console.log(`✅ 클라이언트 1 연결됨: ${client1.id}`);
      resolve();
    });
  });

  // 클라이언트 2 연결 대기
  await new Promise((resolve) => {
    client2.on('connect', () => {
      console.log(`✅ 클라이언트 2 연결됨: ${client2.id}`);
      resolve();
    });
  });

  console.log('\n--- 테스트 1: 방 참가 ---');
  
  // 클라이언트 1이 방에 참가
  client1.emit('room:join', 'test-room-1');
  
  await new Promise((resolve) => {
    client1.on('room:joined', (data) => {
      console.log(`✅ 클라이언트 1이 방에 참가함:`, data);
      resolve();
    });
  });

  console.log('\n--- 테스트 2: 두 번째 참가자 알림 ---');
  
  // 클라이언트 2가 같은 방에 참가
  client1.on('room:participant-joined', (socketId) => {
    console.log(`✅ 클라이언트 1이 새 참가자 알림 받음: ${socketId}`);
  });

  client2.emit('room:join', 'test-room-1');
  
  await new Promise((resolve) => {
    client2.on('room:joined', (data) => {
      console.log(`✅ 클라이언트 2가 방에 참가함:`, data);
      resolve();
    });
  });

  // 잠시 대기
  await new Promise(resolve => setTimeout(resolve, 500));

  console.log('\n--- 테스트 3: 시그널링 (offer) ---');
  
  // 클라이언트 2가 offer 수신 대기
  client2.on('signal:offer', (data) => {
    console.log(`✅ 클라이언트 2가 offer 받음:`, { from: data.from, signalType: data.signal.type });
  });

  // 클라이언트 1이 offer 전송
  client1.emit('signal:offer', {
    to: client2.id,
    signal: { type: 'offer', sdp: 'mock-sdp-data' }
  });

  await new Promise(resolve => setTimeout(resolve, 500));

  console.log('\n--- 테스트 4: 시그널링 (answer) ---');
  
  // 클라이언트 1이 answer 수신 대기
  client1.on('signal:answer', (data) => {
    console.log(`✅ 클라이언트 1이 answer 받음:`, { from: data.from, signalType: data.signal.type });
  });

  // 클라이언트 2가 answer 전송
  client2.emit('signal:answer', {
    to: client1.id,
    signal: { type: 'answer', sdp: 'mock-sdp-data' }
  });

  await new Promise(resolve => setTimeout(resolve, 500));

  console.log('\n--- 테스트 5: ICE Candidate ---');
  
  // 클라이언트 2가 ICE candidate 수신 대기
  client2.on('signal:ice-candidate', (data) => {
    console.log(`✅ 클라이언트 2가 ICE candidate 받음:`, { from: data.from });
  });

  // 클라이언트 1이 ICE candidate 전송
  client1.emit('signal:ice-candidate', {
    to: client2.id,
    candidate: { candidate: 'mock-ice-candidate' }
  });

  await new Promise(resolve => setTimeout(resolve, 500));

  console.log('\n--- 테스트 6: 화이트보드 이벤트 ---');
  
  // 클라이언트 2가 화이트보드 이벤트 수신 대기
  client2.on('whiteboard:event', (data) => {
    console.log(`✅ 클라이언트 2가 화이트보드 이벤트 받음:`, { from: data.from, eventType: data.event.type });
  });

  // 클라이언트 1이 화이트보드 이벤트 전송
  client1.emit('whiteboard:event', {
    roomId: 'test-room-1',
    event: {
      type: 'path:created',
      data: { x: 100, y: 200 }
    }
  });

  await new Promise(resolve => setTimeout(resolve, 500));

  console.log('\n--- 테스트 7: 방 정원 초과 ---');
  
  // 클라이언트 3 생성 (3번째 참가자)
  const client3 = ioClient(SERVER_URL);
  
  await new Promise((resolve) => {
    client3.on('connect', () => {
      console.log(`✅ 클라이언트 3 연결됨: ${client3.id}`);
      resolve();
    });
  });

  // 클라이언트 3이 같은 방에 참가 시도
  client3.on('room:full', () => {
    console.log(`✅ 클라이언트 3이 방 정원 초과 알림 받음`);
  });

  client3.emit('room:join', 'test-room-1');

  await new Promise(resolve => setTimeout(resolve, 500));

  console.log('\n--- 테스트 8: 참가자 퇴장 ---');
  
  // 클라이언트 2가 퇴장 알림 수신 대기
  client2.on('room:participant-left', (socketId) => {
    console.log(`✅ 클라이언트 2가 퇴장 알림 받음: ${socketId}`);
  });

  // 클라이언트 1이 방을 나감
  client1.emit('room:leave', 'test-room-1');

  await new Promise(resolve => setTimeout(resolve, 500));

  console.log('\n=== 모든 테스트 완료 ===');
  
  // 연결 종료
  client1.disconnect();
  client2.disconnect();
  client3.disconnect();
  
  process.exit(0);
};

// 에러 핸들링
process.on('uncaughtException', (error) => {
  console.error('❌ 에러 발생:', error);
  process.exit(1);
});

// 테스트 실행
console.log('서버가 http://localhost:3001 에서 실행 중인지 확인하세요.\n');
setTimeout(runTests, 1000);
