"use client";

/**
 * useWebRTC 커스텀 훅 (비활성화)
 *
 * SFU 전용 모드로 전환됨 - P2P 코드는 비활성화됨
 * P2P 코드는 feature/p2p-mesh 브랜치에 보존됨
 *
 * SFU 모드에서는 useSFU 훅을 사용합니다.
 * @see hooks/useSFU.js
 */
function useWebRTC() {
  // SFU 전용 모드에서는 동작하지 않음
  console.warn("[useWebRTC] P2P 모드 비활성화됨. SFU 모드 사용 중. useSFU 훅을 사용하세요.");

  return {
    remoteStreams: new Map(), // 빈 Map 반환 (호환성 유지)
  };
}

export default useWebRTC;
