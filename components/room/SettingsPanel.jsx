"use client";

import { ChevronDown, Mic, Video, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useMediaContext } from "@/contexts";

/**
 * 설정 패널 컴포넌트
 * 방 내부에서 비디오/오디오 디바이스를 선택하고 변경할 수 있는 모달 UI
 *
 * Props:
 * - isOpen: 모달 표시 여부
 * - onClose: 모달 닫기 콜백
 */
export default function SettingsPanel({ isOpen, onClose }) {
  // MediaContext에서 필요한 상태 및 함수 가져오기
  const {
    getAvailableDevices,
    reinitializeMedia,
    participationMode,
    isReconnecting,
    reconnectionError,
    setReconnectionError,
  } = useMediaContext();

  // 로컬 상태 관리
  const [videoDevices, setVideoDevices] = useState([]);
  const [audioDevices, setAudioDevices] = useState([]);
  const [selectedVideoId, setSelectedVideoId] = useState("");
  const [selectedAudioId, setSelectedAudioId] = useState("");
  const [isLoadingDevices, setIsLoadingDevices] = useState(false);
  const [saveError, setSaveError] = useState(null);

  // 미리보기 비디오 element ref
  const previewRef = useRef(null);
  const previewStreamRef = useRef(null);

  /**
   * 디바이스 목록 로드
   */
  const loadDevices = useCallback(async () => {
    try {
      setIsLoadingDevices(true);
      setSaveError(null);

      const devices = await getAvailableDevices();

      setVideoDevices(devices.videoDevices || []);
      setAudioDevices(devices.audioDevices || []);

      // 기본 디바이스 자동 선택 (첫 번째 디바이스)
      if (devices.videoDevices?.length > 0 && !selectedVideoId) {
        setSelectedVideoId(devices.videoDevices[0].deviceId);
      }
      if (devices.audioDevices?.length > 0 && !selectedAudioId) {
        setSelectedAudioId(devices.audioDevices[0].deviceId);
      }

      console.log("[SettingsPanel] 디바이스 목록 로드 완료:", {
        videoCount: devices.videoDevices?.length,
        audioCount: devices.audioDevices?.length,
      });
    } catch (error) {
      console.error("[SettingsPanel] 디바이스 목록 로드 실패:", error);
      setSaveError("디바이스 목록을 불러오는데 실패했습니다.");
    } finally {
      setIsLoadingDevices(false);
    }
  }, [getAvailableDevices, selectedVideoId, selectedAudioId]);

  /**
   * 미리보기 스트림 생성
   */
  const generatePreview = useCallback(async () => {
    try {
      // 이전 미리보기 스트림 정리
      if (previewStreamRef.current) {
        previewStreamRef.current.getTracks().forEach((track) => {
          track.stop();
        });
        previewStreamRef.current = null;
      }

      // 선택된 디바이스로 미리보기 스트림 생성
      if (selectedVideoId) {
        const constraints = {
          video: { deviceId: { exact: selectedVideoId } },
          audio: false, // 미리보기는 비디오만
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        previewStreamRef.current = stream;

        // video 태그에 스트림 연결
        if (previewRef.current) {
          previewRef.current.srcObject = stream;
        }

        console.log("[SettingsPanel] 미리보기 스트림 생성 완료:", selectedVideoId);
      }
    } catch (error) {
      console.error("[SettingsPanel] 미리보기 생성 실패:", error);
      setSaveError("미리보기를 생성하는데 실패했습니다.");
    }
  }, [selectedVideoId]);

  /**
   * 디바이스 변경 저장
   */
  const handleSave = async () => {
    try {
      setSaveError(null);
      setReconnectionError(null);

      // 선택된 디바이스가 없으면 에러
      if (!selectedVideoId && !selectedAudioId) {
        setSaveError("비디오 또는 오디오 디바이스를 선택해주세요.");
        return;
      }

      console.log("[SettingsPanel] 디바이스 변경 저장 시작:", {
        videoId: selectedVideoId,
        audioId: selectedAudioId,
      });

      // reinitializeMedia 호출 (MediaContext)
      await reinitializeMedia(selectedVideoId || null, selectedAudioId || null);

      console.log("[SettingsPanel] 디바이스 변경 완료");

      // 미리보기 스트림 정리
      if (previewStreamRef.current) {
        previewStreamRef.current.getTracks().forEach((track) => {
          track.stop();
        });
        previewStreamRef.current = null;
      }

      // 모달 닫기
      onClose();
    } catch (error) {
      console.error("[SettingsPanel] 디바이스 변경 실패:", error);
      setSaveError(error.message || "디바이스 변경에 실패했습니다.");
    }
  };

  /**
   * 모달이 열릴 때 디바이스 목록 로드
   */
  useEffect(() => {
    if (isOpen) {
      loadDevices();
    }
  }, [isOpen, loadDevices]);

  /**
   * selectedVideoId 변경 시 미리보기 업데이트
   */
  useEffect(() => {
    if (isOpen && selectedVideoId) {
      generatePreview();
    }

    // cleanup: 컴포넌트 언마운트 시 미리보기 스트림 정리
    return () => {
      if (previewStreamRef.current) {
        previewStreamRef.current.getTracks().forEach((track) => {
          track.stop();
        });
        previewStreamRef.current = null;
      }
    };
  }, [isOpen, selectedVideoId, generatePreview]);

  // 모달이 닫혀있으면 렌더링하지 않음
  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-gray-900 rounded-lg shadow-lg w-[528px] h-[700px] p-6 flex flex-col overflow-hidden">
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-4 flex-shrink-0">
          <h2 className="text-xl font-semibold text-white">디바이스 설정</h2>
          <Button
            onClick={onClose}
            variant="ghost"
            size="icon"
            className="text-gray-400 hover:text-white"
            title="닫기"
            type="button"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* 스크롤 가능한 콘텐츠 영역 */}
        <div className="flex-1 overflow-y-auto px-1">
          {/* 현재 참여 모드 표시 */}
          <div className="mb-4 p-3 bg-gray-800 rounded">
            <p className="text-sm text-gray-300">
              현재 참여 모드:{" "}
              <span className="font-semibold text-white">
                {participationMode === "viewer" ? "시청자" : "일반 참여자"}
              </span>
            </p>
          </div>

          {/* 에러 메시지 */}
          {(saveError || reconnectionError) && (
            <div className="mb-4 p-3 bg-red-900 bg-opacity-50 border border-red-700 rounded">
              <p className="text-sm text-red-300">{saveError || reconnectionError}</p>
            </div>
          )}

          {/* 디바이스 로딩 중 */}
          {isLoadingDevices ? (
            <div className="text-center py-8">
              <p className="text-gray-400">디바이스 목록을 불러오는 중...</p>
            </div>
          ) : (
            <>
              {/* 미리보기 비디오 */}
              <div className="mb-6">
                <div className="block text-sm font-medium text-gray-300 mb-2">미리보기</div>
                <video
                  ref={previewRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-[480px] h-[360px] bg-gray-950 rounded object-cover"
                />
              </div>

              {/* 비디오 디바이스 선택 */}
              <div className="mb-4">
                <label
                  htmlFor="video-device-select"
                  className="flex items-center text-sm font-medium text-gray-300 mb-2"
                >
                  <Video className="h-4 w-4 mr-2" />
                  비디오 디바이스
                </label>
                <div className="relative">
                  <select
                    id="video-device-select"
                    value={selectedVideoId}
                    onChange={(e) => setSelectedVideoId(e.target.value)}
                    className="w-full px-3 py-2.5 pr-10 bg-gray-800 text-white border border-gray-700 rounded-md appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    disabled={isReconnecting}
                  >
                    <option value="">선택 안 함</option>
                    {videoDevices.map((device) => (
                      <option key={device.deviceId} value={device.deviceId}>
                        {device.label || `카메라 ${device.deviceId.substring(0, 8)}`}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                </div>
              </div>

              {/* 오디오 디바이스 선택 */}
              <div className="mb-6">
                <label
                  htmlFor="audio-device-select"
                  className="flex items-center text-sm font-medium text-gray-300 mb-2"
                >
                  <Mic className="h-4 w-4 mr-2" />
                  오디오 디바이스
                </label>
                <div className="relative">
                  <select
                    id="audio-device-select"
                    value={selectedAudioId}
                    onChange={(e) => setSelectedAudioId(e.target.value)}
                    className="w-full px-3 py-2.5 pr-10 bg-gray-800 text-white border border-gray-700 rounded-md appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    disabled={isReconnecting}
                  >
                    <option value="">선택 안 함</option>
                    {audioDevices.map((device) => (
                      <option key={device.deviceId} value={device.deviceId}>
                        {device.label || `마이크 ${device.deviceId.substring(0, 8)}`}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                </div>
              </div>

              {/* 재연결 중 로딩 UI */}
              {isReconnecting && (
                <div className="mb-4 p-3 bg-blue-900 bg-opacity-50 border border-blue-700 rounded flex items-center">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-3" />
                  <p className="text-sm text-blue-300">디바이스를 변경하는 중...</p>
                </div>
              )}
            </>
          )}
        </div>

        {/* 버튼 그룹 */}
        <div className="flex justify-end gap-2 mt-4 flex-shrink-0">
          <Button onClick={onClose} variant="outline" disabled={isReconnecting}>
            취소
          </Button>
          <Button onClick={handleSave} disabled={isReconnecting}>
            {isReconnecting ? "변경 중..." : "저장"}
          </Button>
        </div>
      </div>
    </div>
  );
}
