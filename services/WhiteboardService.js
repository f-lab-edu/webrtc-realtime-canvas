import { fabric } from "fabric";

/**
 * WhiteboardService 클래스
 * Fabric.js 기반 화이트보드 캔버스 관리 및 실시간 동기화
 *
 */
class WhiteboardService {
  constructor() {
    this.canvas = null;
    this.isDrawingMode = true;
    this.drawEventHandler = null;
    this.isApplyingRemoteEvent = false; // 원격 이벤트 적용 중 플래그
  }

  /**
   * Fabric.js 캔버스 초기화
   * @param {HTMLCanvasElement} canvasElement - HTML canvas 엘리먼트
   * @param {Object} options - 캔버스 옵션
   */
  initialize(canvasElement, options = {}) {
    try {
      // 기본 옵션 설정
      const defaultOptions = {
        isDrawingMode: true,
        width: options.width || 800,
        height: options.height || 600,
        backgroundColor: "#ffffff",
      };

      // Fabric.js 캔버스 생성
      this.canvas = new fabric.Canvas(canvasElement, {
        ...defaultOptions,
        ...options,
      });

      // 그리기 브러시 설정
      this.canvas.freeDrawingBrush.width = 2;
      this.canvas.freeDrawingBrush.color = "#000000";

      console.log("화이트보드 캔버스 초기화 완료");
    } catch (error) {
      console.error("캔버스 초기화 에러:", error);
      throw error;
    }
  }

  /**
   * 그리기 이벤트 리스너 등록
   * 로컬 그리기 이벤트를 감지하여 서버로 전송
   * @param {Function} handler - 이벤트 데이터를 받을 콜백 함수
   */
  enableDrawing(handler) {
    if (!this.canvas) {
      console.error("캔버스가 초기화되지 않았습니다.");
      return;
    }

    this.drawEventHandler = handler;

    // path:created 이벤트 (자유 그리기 완료 시)
    this.canvas.on("path:created", (event) => {
      // 원격 이벤트 적용 중에는 로컬 이벤트 무시
      if (this.isApplyingRemoteEvent) return;

      const path = event.path;
      const eventData = {
        type: "path:created",
        data: path.toJSON(),
      };

      console.log("그리기 이벤트 발생:", eventData.type);

      if (this.drawEventHandler) {
        this.drawEventHandler(eventData);
      }
    });

    // object:added 이벤트 (도형 추가 시)
    this.canvas.on("object:added", (event) => {
      if (this.isApplyingRemoteEvent) return;

      const obj = event.target;

      // path:created에서 이미 처리된 경우 제외
      if (obj.type === "path") return;

      const eventData = {
        type: "object:added",
        data: obj.toJSON(),
      };

      console.log("객체 추가 이벤트 발생:", eventData.type);

      if (this.drawEventHandler) {
        this.drawEventHandler(eventData);
      }
    });

    // object:modified 이벤트 (객체 수정 시)
    this.canvas.on("object:modified", (event) => {
      if (this.isApplyingRemoteEvent) return;

      const obj = event.target;
      const eventData = {
        type: "object:modified",
        data: {
          id: obj.id,
          ...obj.toJSON(),
        },
      };

      console.log("객체 수정 이벤트 발생:", eventData.type);

      if (this.drawEventHandler) {
        this.drawEventHandler(eventData);
      }
    });

    // object:removed 이벤트 (객체 삭제 시)
    this.canvas.on("object:removed", (event) => {
      if (this.isApplyingRemoteEvent) return;

      const obj = event.target;
      const eventData = {
        type: "object:removed",
        data: {
          id: obj.id,
        },
      };

      console.log("객체 삭제 이벤트 발생:", eventData.type);

      if (this.drawEventHandler) {
        this.drawEventHandler(eventData);
      }
    });

    this.isDrawingMode = true;
    console.log("그리기 이벤트 리스너 등록 완료");
  }

  /**
   * 그리기 모드 비활성화
   */
  disableDrawing() {
    if (!this.canvas) {
      console.error("캔버스가 초기화되지 않았습니다.");
      return;
    }

    this.canvas.isDrawingMode = false;
    this.isDrawingMode = false;
    console.log("그리기 모드 비활성화");
  }

  /**
   * 원격 그리기 이벤트 적용
   * 서버로부터 받은 이벤트를 캔버스에 렌더링
   * @param {Object} event - 그리기 이벤트 데이터
   */
  applyRemoteEvent(event) {
    if (!this.canvas) {
      console.error("캔버스가 초기화되지 않았습니다.");
      return;
    }

    try {
      // 원격 이벤트 적용 중 플래그 설정 (무한 루프 방지)
      this.isApplyingRemoteEvent = true;

      const { type, data } = event;

      switch (type) {
        case "path:created":
        case "object:added":
          // JSON 데이터로부터 Fabric 객체 생성
          fabric.util.enlivenObjects([data], (objects) => {
            objects.forEach((obj) => {
              this.canvas.add(obj);
            });
            this.canvas.renderAll();
            this.isApplyingRemoteEvent = false;
          });
          break;

        case "object:modified": {
          // 기존 객체 찾아서 수정
          const objToModify = this.canvas.getObjects().find((o) => o.id === data.id);
          if (objToModify) {
            objToModify.set(data);
            this.canvas.renderAll();
          }
          this.isApplyingRemoteEvent = false;
          break;
        }

        case "object:removed": {
          // 객체 삭제
          const objToRemove = this.canvas.getObjects().find((o) => o.id === data.id);
          if (objToRemove) {
            this.canvas.remove(objToRemove);
            this.canvas.renderAll();
          }
          this.isApplyingRemoteEvent = false;
          break;
        }

        case "canvas:cleared":
          // 캔버스 전체 초기화
          this.canvas.clear();
          this.canvas.backgroundColor = "#ffffff";
          this.canvas.renderAll();
          this.isApplyingRemoteEvent = false;
          break;

        default:
          console.warn("알 수 없는 이벤트 타입:", type);
          this.isApplyingRemoteEvent = false;
      }

      console.log("원격 이벤트 적용 완료:", type);
    } catch (error) {
      console.error("원격 이벤트 적용 에러:", error);
      this.isApplyingRemoteEvent = false;
    }
  }

  /**
   * 캔버스 초기화 (모든 객체 삭제)
   */
  clear() {
    if (!this.canvas) {
      console.error("캔버스가 초기화되지 않았습니다.");
      return;
    }

    try {
      this.canvas.clear();
      this.canvas.backgroundColor = "#ffffff";
      this.canvas.renderAll();

      // 초기화 이벤트 전송
      if (this.drawEventHandler && !this.isApplyingRemoteEvent) {
        const eventData = {
          type: "canvas:cleared",
          data: {},
        };
        this.drawEventHandler(eventData);
      }

      console.log("캔버스 초기화 완료");
    } catch (error) {
      console.error("캔버스 초기화 에러:", error);
    }
  }

  /**
   * 브러시 색상 변경
   * @param {string} color - 색상 값 (예: '#ff0000')
   */
  setBrushColor(color) {
    if (!this.canvas) {
      console.error("캔버스가 초기화되지 않았습니다.");
      return;
    }

    this.canvas.freeDrawingBrush.color = color;
    console.log("브러시 색상 변경:", color);
  }

  /**
   * 브러시 두께 변경
   * @param {number} width - 브러시 두께
   */
  setBrushWidth(width) {
    if (!this.canvas) {
      console.error("캔버스가 초기화되지 않았습니다.");
      return;
    }

    this.canvas.freeDrawingBrush.width = width;
    console.log("브러시 두께 변경:", width);
  }

  /**
   * 캔버스 크기 조정
   * @param {number} width - 너비
   * @param {number} height - 높이
   */
  setCanvasSize(width, height) {
    if (!this.canvas) {
      console.error("캔버스가 초기화되지 않았습니다.");
      return;
    }

    this.canvas.setWidth(width);
    this.canvas.setHeight(height);
    this.canvas.renderAll();
    console.log(`캔버스 크기 변경: ${width}x${height}`);
  }

  /**
   * 캔버스 인스턴스 반환
   * @returns {fabric.Canvas|null}
   */
  getCanvas() {
    return this.canvas;
  }

  /**
   * 리소스 정리
   */
  destroy() {
    if (this.canvas) {
      this.canvas.dispose();
      this.canvas = null;
      this.drawEventHandler = null;
      this.isApplyingRemoteEvent = false;
      console.log("화이트보드 리소스 정리 완료");
    }
  }
}

export default WhiteboardService;
