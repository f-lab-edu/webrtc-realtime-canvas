/**
 * Jest 설정 파일
 * ES6 modules 지원을 위한 설정
 */
export default {
  // Node.js 환경에서 테스트 실행
  testEnvironment: "node",

  // ES6 modules 지원
  transform: {},

  // 전역 변수 주입
  injectGlobals: true,

  // 테스트 파일 패턴
  testMatch: ["**/*.test.js", "**/*.spec.js"],

  // 커버리지 수집 대상
  collectCoverageFrom: [
    "server/**/*.js",
    "!server/**/*.test.js",
    "!server/**/*.spec.js",
    "!server/test-*.js",
  ],

  // 테스트 타임아웃 (밀리초)
  testTimeout: 10000,

  // 상세한 출력
  verbose: true,
};
