"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  loadNicknameFromSession,
  saveNicknameToSession,
  validateNickname,
} from "@/lib/nicknameUtils";

/**
 * 닉네임 입력 컴포넌트
 *
 * 하이브리드 방식:
 * - 첫 방 입장: 빈 입력 필드 표시
 * - 두 번째 방 입장: 세션 스토리지에서 기본 닉네임 자동 로드 및 입력 필드에 채우기
 * - 사용자가 수정 가능 (방별로 다른 닉네임 사용 가능)
 * - 제출 시 세션 스토리지 업데이트 (다음 방 입장 시 기본값으로 사용)
 *
 * @param {Object} props
 * @param {Function} props.onNicknameSet - 닉네임 설정 완료 콜백
 * @param {string} [props.roomId] - 방 ID (선택적)
 */
export default function NicknameInput({ onNicknameSet, roomId }) {
  const [nickname, setNickname] = useState("");
  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasLoadedDefault, setHasLoadedDefault] = useState(false);
  const [skipMediaInit, setSkipMediaInit] = useState(false); // 카메라/마이크 없이 입장 여부

  /**
   * 컴포넌트 마운트 시 세션 스토리지에서 기본 닉네임 로드
   */
  useEffect(() => {
    const loadDefaultNickname = () => {
      const storedNickname = loadNicknameFromSession();

      if (storedNickname) {
        console.log("[NicknameInput] 세션 스토리지에서 기본 닉네임 로드:", storedNickname);
        setNickname(storedNickname);
        setHasLoadedDefault(true);
      } else {
        console.log("[NicknameInput] 저장된 닉네임 없음, 빈 입력 필드 표시");
        setHasLoadedDefault(false);
      }
    };

    loadDefaultNickname();
  }, []);

  /**
   * 닉네임 입력 변경 핸들러
   * 실시간 입력 검증
   */
  const handleNicknameChange = (e) => {
    const value = e.target.value;
    setNickname(value);

    // 실시간 검증
    if (value.trim().length > 0) {
      const { isValid, error: validationError } = validateNickname(value);
      if (!isValid) {
        setError(validationError);
      } else {
        setError(null);
      }
    } else {
      setError(null);
    }
  };

  /**
   * 닉네임 제출 핸들러
   */
  const handleSubmit = async (e) => {
    e.preventDefault();

    // 검증
    const { isValid, error: validationError } = validateNickname(nickname);
    if (!isValid) {
      setError(validationError);
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      // 세션 스토리지에 닉네임 저장 (하이브리드 방식)
      const saved = saveNicknameToSession(nickname);
      if (!saved) {
        console.log("[NicknameInput] 세션 스토리지 저장 실패, 계속 진행");
      }

      console.log(`[NicknameInput] 닉네임 설정 완료: ${nickname}, 미디어 스킵: ${skipMediaInit}`);

      // 부모 컴포넌트에 닉네임 및 미디어 스킵 여부 전달
      onNicknameSet(nickname, skipMediaInit);
    } catch (err) {
      console.error("[NicknameInput] 닉네임 설정 실패:", err);
      setError("닉네임 설정에 실패했습니다. 다시 시도해주세요.");
      setIsSubmitting(false);
    }
  };

  /**
   * Enter 키 입력 핸들러
   */
  const handleKeyPress = (e) => {
    if (e.key === "Enter" && !isSubmitting) {
      handleSubmit(e);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-950">
      <div className="w-full max-w-md p-8 bg-gray-900 rounded-lg shadow-xl border border-gray-800">
        {/* 헤더 */}
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-white mb-2">닉네임 설정</h1>
          <p className="text-sm text-gray-400">
            {hasLoadedDefault
              ? "저장된 닉네임을 사용하거나 수정할 수 있습니다"
              : "방에 입장하기 전에 닉네임을 설정해주세요"}
          </p>
          {roomId && <p className="text-xs text-gray-500 mt-2">방: {roomId}</p>}
        </div>

        {/* 닉네임 입력 폼 */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="nickname" className="block text-sm font-medium text-gray-300 mb-2">
              닉네임
            </label>
            <input
              id="nickname"
              type="text"
              value={nickname}
              onChange={handleNicknameChange}
              onKeyPress={handleKeyPress}
              placeholder="닉네임을 입력하세요 (1-20자)"
              disabled={isSubmitting}
              className={`
                w-full px-4 py-3
                bg-gray-800 text-white
                border rounded-lg
                focus:outline-none focus:ring-2
                disabled:opacity-50 disabled:cursor-not-allowed
                ${
                  error
                    ? "border-red-500 focus:ring-red-500"
                    : "border-gray-700 focus:ring-blue-500"
                }
              `}
              maxLength={20}
            />

            {/* 에러 메시지 */}
            {error && <p className="mt-2 text-sm text-red-400">{error}</p>}

            {/* 도움말 */}
            <p className="mt-2 text-xs text-gray-500">
              한글, 영문, 숫자, 언더스코어, 공백 사용 가능
            </p>
          </div>

          {/* 카메라/마이크 없이 입장 체크박스 */}
          <div className="flex items-center space-x-2 px-1">
            <input
              id="skip-media-init"
              type="checkbox"
              checked={skipMediaInit}
              onChange={(e) => setSkipMediaInit(e.target.checked)}
              disabled={isSubmitting}
              className="w-4 h-4 text-blue-600 bg-gray-800 border-gray-600 rounded focus:ring-blue-500 focus:ring-2 disabled:opacity-50"
            />
            <label
              htmlFor="skip-media-init"
              className={`text-sm ${isSubmitting ? "text-gray-500" : "text-gray-300"} cursor-pointer`}
            >
              카메라/마이크 없이 입장 (시청자 모드)
            </label>
          </div>

          {/* 제출 버튼 */}
          <Button
            type="submit"
            disabled={isSubmitting || !nickname.trim() || !!error}
            className="w-full py-3 text-base font-medium bg-blue-600 hover:bg-blue-700 text-white disabled:bg-gray-600 disabled:hover:bg-gray-600"
          >
            {isSubmitting ? "설정 중..." : "방 입장하기"}
          </Button>
        </form>

        {/* 추가 정보 */}
        {hasLoadedDefault && (
          <div className="mt-4 p-3 bg-blue-900/20 border border-blue-800/30 rounded-lg">
            <p className="text-xs text-blue-300">
              💡 이전에 사용한 닉네임이 자동으로 입력되었습니다. 수정하거나 그대로 사용할 수
              있습니다.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
