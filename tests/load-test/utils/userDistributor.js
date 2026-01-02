/**
 * userDistributor.js
 *
 * 다중 방 부하 테스트를 위한 사용자 분배 유틸리티
 * - 완전 랜덤 분배: 각 사용자가 랜덤하게 방 선택
 * - 방별 인원수 불균등 가능 (실제 서비스 환경 시뮬레이션)
 */

/**
 * @typedef {Object} ClientAssignment
 * @property {string} userId - 사용자 ID
 * @property {string} roomId - 할당된 방 ID
 * @property {number} order - 원래 순서 (셔플 전)
 */

/**
 * 사용자를 방에 완전 랜덤 분배
 * - 각 사용자가 랜덤하게 방 선택 (방별 인원수 불균등 가능)
 *
 * @param {number} totalUsers - 전체 사용자 수
 * @param {number} roomCount - 방 개수
 * @param {string} roomPrefix - 방 ID 접두사 (기본: "room")
 * @returns {{ roomIds: string[], queue: ClientAssignment[] }}
 */
export function createAssignmentQueue(totalUsers, roomCount, roomPrefix = "room") {
  // 파라미터 검증
  if (!Number.isInteger(totalUsers) || totalUsers < 1) {
    throw new Error("[userDistributor] totalUsers는 1 이상의 정수여야 합니다");
  }
  if (!Number.isInteger(roomCount) || roomCount < 1) {
    throw new Error("[userDistributor] roomCount는 1 이상의 정수여야 합니다");
  }
  if (totalUsers < roomCount) {
    throw new Error("[userDistributor] totalUsers는 roomCount 이상이어야 합니다");
  }

  // 방 ID 생성
  const timestamp = Date.now();
  const roomIds = Array.from(
    { length: roomCount },
    (_, i) => `${roomPrefix}_${timestamp}_${i + 1}`
  );

  // 완전 랜덤 분배: 각 사용자가 랜덤하게 방 선택
  const queue = [];

  for (let i = 0; i < totalUsers; i++) {
    const randomRoomIndex = Math.floor(Math.random() * roomCount);
    const roomId = roomIds[randomRoomIndex];

    queue.push({
      userId: `user_${i + 1}`,
      roomId,
      order: i + 1,
    });
  }

  // 투입 순서도 셔플 (Fisher-Yates 알고리즘)
  const shuffledQueue = shuffleArray([...queue]);

  return { roomIds, queue: shuffledQueue };
}

/**
 * 방별 할당 현황 집계
 * @param {ClientAssignment[]} queue - 할당 큐
 * @returns {Map<string, number>} roomId -> 할당된 사용자 수
 */
export function getRoomDistribution(queue) {
  const distribution = new Map();

  for (const assignment of queue) {
    const count = distribution.get(assignment.roomId) || 0;
    distribution.set(assignment.roomId, count + 1);
  }

  return distribution;
}

/**
 * 방별 할당 현황을 문자열로 포맷팅
 * @param {Map<string, number>} distribution - 방별 분배 맵
 * @returns {string} 포맷된 문자열
 */
export function formatDistribution(distribution) {
  const lines = [];

  for (const [roomId, count] of distribution) {
    // roomId에서 짧은 이름 추출 (예: room_1734930000000_1 -> room_1)
    const shortName = roomId.split("_").pop();
    lines.push(`  room_${shortName}: ${count}명`);
  }

  return lines.join("\n");
}

/**
 * Fisher-Yates 셔플 알고리즘
 * @param {Array} array - 셔플할 배열
 * @returns {Array} 셔플된 배열
 */
function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}
