"use client";

import { useEffect, useRef, useState } from "react";

/**
 * DeviceSelector 컴포넌트
 * 카메라/마이크 선택 UI
 *
 * @param {Object} props
 * @param {Function} props.onDeviceSelected - 디바이스 선택 완료 콜백
 * @param {Function} props.getAvailableDevices - 디바이스 목록 조회 함수
 * @param {Function} props.initializeMediaWithDevice - 디바이스로 미디어 초기화 함수
 */
export default function DeviceSelector({
  onDeviceSelected,
  getAvailableDevices,
  initializeMediaWithDevice,
}) {
  const [videoDevices, setVideoDevices] = useState([]);
  const [audioDevices, setAudioDevices] = useState([]);
  const [selectedVideoId, setSelectedVideoId] = useState("");
  const [selectedAudioId, setSelectedAudioId] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [previewStream, setPreviewStream] = useState(null);

  const videoPreviewRef = useRef(null);

  /**
   * 컴포넌트 마운트 시 디바이스 목록 조회
   */
  useEffect(() => {
    const loadDevices = async () => {
      try {
        console.log("[DeviceSelector] 디바이스 목록 로딩 시작");
        setIsLoading(true);
        setError(null);

        // 먼저 권한 요청을 위한 임시 스트림 획득
        const tempStream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });

        // 디바이스 목록 조회
        const { videoDevices: videos, audioDevices: audios } =
          await getAvailableDevices();

        setVideoDevices(videos);
        setAudioDevices(audios);

        // 기본 디바이스 선택 (첫 번째)
        if (videos.length > 0) {
          setSelectedVideoId(videos[0].deviceId);
        }
        if (audios.length > 0) {
          setSelectedAudioId(audios[0].deviceId);
        }

        // 임시 스트림 정리
        tempStream.getTracks().forEach((track) => track.stop());

        console.log("[DeviceSelector] 디바이스 목록 로딩 완료");
        setIsLoading(false);
      } catch (err) {
        console.error("[DeviceSelector] 디바이스 목록 로딩 실패:", err);
        setError(
          "디바이스 목록을 불러올 수 없습니다. 카메라와 마이크 권한을 허용해주세요."
        );
        setIsLoading(false);
      }
    };

    loadDevices();
  }, [getAvailableDevices]);

  /**
   * 선택된 디바이스로 미리보기 스트림 생성
   */
  useEffect(() => {
    if (!selectedVideoId || !selectedAudioId) {
      return;
    }

    const startPreview = async () => {
      try {
        console.log("[DeviceSelector] 미리보기 스트림 시작");

        // 이전 스트림 정리
        if (previewStream) {
          previewStream.getTracks().forEach((track) => track.stop());
        }

        // 새 스트림 생성
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: { exact: selectedVideoId } },
          audio: { deviceId: { exact: selectedAudioId } },
        });

        setPreviewStream(stream);

        // 비디오 프리뷰 연결
        if (videoPreviewRef.current) {
          videoPreviewRef.current.srcObject = stream;
        }

        console.log("[DeviceSelector] 미리보기 스트림 연결 완료");
      } catch (err) {
        console.error("[DeviceSelector] 미리보기 스트림 실패:", err);
        setError("선택한 디바이스로 미리보기를 시작할 수 없습니다.");
      }
    };

    startPreview();

    // 클린업
    return () => {
      if (previewStream) {
        previewStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [selectedVideoId, selectedAudioId]);

  /**
   * 디바이스 선택 완료 처리
   */
  const handleConfirm = async () => {
    try {
      console.log("[DeviceSelector] 디바이스 선택 완료");
      console.log(`  - 비디오: ${selectedVideoId}`);
      console.log(`  - 오디오: ${selectedAudioId}`);

      // 미리보기 스트림 정리
      if (previewStream) {
        previewStream.getTracks().forEach((track) => track.stop());
        setPreviewStream(null);
      }

      // 선택된 디바이스로 미디어 초기화
      await initializeMediaWithDevice(selectedVideoId, selectedAudioId);

      // 부모 컴포넌트에 알림
      onDeviceSelected();
    } catch (err) {
      console.error("[DeviceSelector] 디바이스 선택 처리 실패:", err);
      setError("디바이스 초기화에 실패했습니다. 다시 시도해주세요.");
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">디바이스 목록을 불러오는 중...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100">
        <div className="bg-white p-8 rounded-lg shadow-lg max-w-md">
          <div className="text-red-600 text-5xl mb-4 text-center">⚠️</div>
          <h2 className="text-xl font-bold text-gray-800 mb-4 text-center">
            디바이스 접근 오류
          </h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors"
          >
            새로고침
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <div className="bg-white p-8 rounded-lg shadow-lg max-w-2xl w-full">
        <h2 className="text-2xl font-bold text-gray-800 mb-6 text-center">
          카메라와 마이크 선택
        </h2>

        {/* 비디오 미리보기 */}
        <div className="mb-6">
          <video
            ref={videoPreviewRef}
            autoPlay
            playsInline
            muted
            className="w-full h-64 bg-gray-900 rounded-lg object-cover"
          />
        </div>

        {/* 카메라 선택 */}
        <div className="mb-4">
          <label
            htmlFor="video-select"
            className="block text-sm font-medium text-gray-700 mb-2"
          >
            📹 카메라
          </label>
          <select
            id="video-select"
            value={selectedVideoId}
            onChange={(e) => setSelectedVideoId(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {videoDevices.map((device) => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label}
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-500 mt-1">
            {videoDevices.length}개의 카메라 사용 가능
          </p>
        </div>

        {/* 마이크 선택 */}
        <div className="mb-6">
          <label
            htmlFor="audio-select"
            className="block text-sm font-medium text-gray-700 mb-2"
          >
            🎤 마이크
          </label>
          <select
            id="audio-select"
            value={selectedAudioId}
            onChange={(e) => setSelectedAudioId(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {audioDevices.map((device) => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label}
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-500 mt-1">
            {audioDevices.length}개의 마이크 사용 가능
          </p>
        </div>

        {/* 확인 버튼 */}
        <button
          onClick={handleConfirm}
          disabled={!selectedVideoId || !selectedAudioId}
          className="w-full bg-blue-600 text-white py-3 px-4 rounded-md hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed font-medium"
        >
          선택 완료 및 입장하기
        </button>

        {/* 도움말 */}
        <p className="text-xs text-gray-500 mt-4 text-center">
          💡 OBS Virtual Camera를 사용하려면 OBS Studio를 실행하고 "가상 카메라
          시작"을 클릭하세요.
        </p>
      </div>
    </div>
  );
}
