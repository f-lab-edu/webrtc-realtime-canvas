/**
 * gradual-load.js
 *
 * 점진적 부하 증가 테스트 시나리오
 * 일정 간격으로 가상 사용자를 추가하며 SFU 서버 성능 측정
 *
 * @see REQ-014: 점진적 부하 증가
 */

/**
 * 점진적 부하 테스트 시나리오 설정
 */
export const scenario = {
  name: "gradual-load",
  description: "점진적 부하 증가 테스트 - 10초마다 1명씩 추가",

  // 기본 설정
  config: {
    targetUsers: 10, // 목표 사용자 수
    intervalSeconds: 10, // 사용자 추가 간격 (초)
    durationMinutes: 5, // 테스트 지속 시간 (분)
    metricsIntervalMs: 5000, // 메트릭 수집 간격 (밀리초)
  },

  // 성공 기준
  successCriteria: {
    minSuccessRate: 0.8, // 최소 연결 성공률 80%
    maxCpuPercent: 90, // 최대 CPU 사용률 90%
  },
};

/**
 * 시나리오 실행 함수
 *
 * @param {LoadTestRunner} runner - 부하 테스트 러너 인스턴스
 * @param {Object} options - 추가 옵션 (오버라이드)
 * @returns {Promise<Object>} 테스트 리포트
 */
export async function run(runner, options = {}) {
  // 설정 오버라이드
  const config = { ...scenario.config, ...options };

  console.log(`\n[시나리오: ${scenario.name}]`);
  console.log(`설명: ${scenario.description}`);
  console.log(`목표 사용자: ${config.targetUsers}명`);
  console.log(`추가 간격: ${config.intervalSeconds}초`);
  console.log(`테스트 시간: ${config.durationMinutes}분`);

  // 러너 설정 업데이트
  runner.targetUsers = config.targetUsers;
  runner.rampUpSeconds = config.intervalSeconds;
  runner.durationMinutes = config.durationMinutes;

  // 테스트 실행
  const report = await runner.runGradualLoad();

  // 결과 평가
  const evaluation = evaluateResults(report, scenario.successCriteria);
  report.evaluation = evaluation;

  console.log("\n[시나리오 평가]");
  console.log(`성공 여부: ${evaluation.passed ? "PASS" : "FAIL"}`);
  for (const criterion of evaluation.criteria) {
    const status = criterion.passed ? "✓" : "✗";
    console.log(`  ${status} ${criterion.name}: ${criterion.actual} (기준: ${criterion.expected})`);
  }

  return report;
}

/**
 * 테스트 결과 평가
 *
 * @param {Object} report - 테스트 리포트
 * @param {Object} criteria - 성공 기준
 * @returns {Object} 평가 결과
 */
function evaluateResults(report, criteria) {
  const evaluation = {
    passed: true,
    criteria: [],
  };

  // 연결 성공률 평가
  const successRate = report.results.successRate;
  const successRatePassed = successRate >= criteria.minSuccessRate;
  evaluation.criteria.push({
    name: "연결 성공률",
    expected: `>= ${criteria.minSuccessRate * 100}%`,
    actual: `${(successRate * 100).toFixed(1)}%`,
    passed: successRatePassed,
  });
  if (!successRatePassed) evaluation.passed = false;

  // CPU 사용률은 SFU 서버 메트릭에서 가져와야 함 (추후 구현)
  // 현재는 클라이언트 측 메트릭만 수집

  return evaluation;
}

export default { scenario, run };
