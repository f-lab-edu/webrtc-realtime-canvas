import * as fabric from "fabric";

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
      // 이미 초기화된 경우 기존 캔버스 정리
      if (this.canvas) {
        console.log("기존 캔버스 정리 중...");
        this.canvas.dispose();
        this.canvas = null;
      }

      // 기본 옵션 설정
      const defaultOptions = {
        width: options.width || 800,
        height: options.height || 600,
        backgroundColor: "#ffffff",
      };

      // Fabric.js 캔버스 생성
      this.canvas = new fabric.Canvas(canvasElement, {
        ...defaultOptions,
        ...options,
      });

      // 그리기 브러시 생성 및 설정 (Fabric.js v6)
      const brush = new fabric.PencilBrush(this.canvas);
      brush.color = "#000000";
      brush.width = 2;

      // 브러시 설정 후 그리기 모드 활성화
      this.canvas.freeDrawingBrush = brush;
      this.canvas.isDrawingMode = true;

      console.log("화이트보드 캔버스 초기화 완료", {
        isDrawingMode: this.canvas.isDrawingMode,
        hasBrush: !!this.canvas.freeDrawingBrush,
        brushWidth: this.canvas.freeDrawingBrush?.width,
        brushColor: this.canvas.freeDrawingBrush?.color,
      });
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
      const pathData = path.toJSON();

      console.log(
        "그리기 이벤트 발생:",
        "path:created",
        "색상:",
        pathData.stroke,
        "두께:",
        pathData.strokeWidth,
        "브러시 색상:",
        this.canvas.freeDrawingBrush?.color,
        "브러시 두께:",
        this.canvas.freeDrawingBrush?.width
      );

      // path 데이터 그대로 전송 (이미 브러시 설정이 적용되어 있음)
      const eventData = {
        type: "path:created",
        data: pathData,
      };

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
        case "object:added": {
          // JSON 데이터로부터 Fabric 객체 생성
          console.log(
            "원격 객체 생성 중:",
            type,
            "데이터:",
            JSON.stringify(data).substring(0, 200)
          );

          // Fabric.js v6: enlivenObjects는 Promise를 반환할 수 있음
          const enlivenResult = fabric.util.enlivenObjects(
            [data],
            (objects) => {
              console.log("enlivenObjects 콜백 실행, 객체 수:", objects.length);
              objects.forEach((obj) => {
                console.log(
                  "원격 객체 추가:",
                  obj.type,
                  "색상:",
                  obj.stroke,
                  "두께:",
                  obj.strokeWidth
                );
                this.canvas.add(obj);
              });
              this.canvas.renderAll();
              console.log("캔버스 렌더링 완료, 총 객체 수:", this.canvas.getObjects().length);
              this.isApplyingRemoteEvent = false;
            },
            "" // namespace
          );

          // Promise인 경우 처리
          if (enlivenResult && typeof enlivenResult.then === "function") {
            enlivenResult
              .then((objects) => {
                console.log("enlivenObjects Promise 완료, 객체 수:", objects.length);
                objects.forEach((obj) => {
                  console.log(
                    "원격 객체 추가 (Promise):",
                    obj.type,
                    "색상:",
                    obj.stroke,
                    "두께:",
                    obj.strokeWidth
                  );
                  this.canvas.add(obj);
                });
                this.canvas.renderAll();
                console.log("캔버스 렌더링 완료, 총 객체 수:", this.canvas.getObjects().length);
                this.isApplyingRemoteEvent = false;
              })
              .catch((error) => {
                console.error("enlivenObjects 에러:", error);
                this.isApplyingRemoteEvent = false;
              });
          }
          break;
        }

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
          console.log("알 수 없는 이벤트 타입:", type);
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

    if (!this.canvas.freeDrawingBrush) {
      console.warn("브러시가 초기화되지 않았습니다. 새로 생성합니다.");
      this.canvas.freeDrawingBrush = new fabric.PencilBrush(this.canvas);
    }

    this.canvas.freeDrawingBrush.color = color;
    console.log(
      "브러시 색상 변경 완료:",
      color,
      "적용 확인:",
      this.canvas.freeDrawingBrush.color,
      "브러시 타입:",
      this.canvas.freeDrawingBrush.constructor.name
    );
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

    if (!this.canvas.freeDrawingBrush) {
      console.warn("브러시가 초기화되지 않았습니다. 새로 생성합니다.");
      this.canvas.freeDrawingBrush = new fabric.PencilBrush(this.canvas);
    }

    this.canvas.freeDrawingBrush.width = width;
    console.log(
      "브러시 두께 변경 완료:",
      width,
      "적용 확인:",
      this.canvas.freeDrawingBrush.width,
      "브러시 타입:",
      this.canvas.freeDrawingBrush.constructor.name
    );
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
