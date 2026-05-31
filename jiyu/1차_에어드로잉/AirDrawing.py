"""
AI Photo Booth - 에어드로잉 & 그림 이동 프로토타입
===============================================
[설치 명령어]
  pip install opencv-python mediapipe numpy

[실행 방법]
  python ai_photo_booth.py

[조작법]
  - 검지만 펴기           : 그리기 모드 (검지 끝으로 공중에 그림)
  - 엄지 + 검지 끝 모으기 : 조작 모드 (그린 그림을 집어서 이동)
  - C 키                  : 전체 캔버스 초기화
  - Z 키                  : 마지막 스트로크 하나 취소 (Undo)
  - Q 또는 ESC            : 프로그램 종료
"""

import cv2
import mediapipe as mp
import numpy as np
import math
import random

# ===== MediaPipe 초기화 =====
mp_hands = mp.solutions.hands
mp_drawing = mp.solutions.drawing_utils
mp_drawing_styles = mp.solutions.drawing_styles

# ===== 설정 상수 =====
PINCH_THRESHOLD = 45   # 핀치(집기) 제스처로 인식할 엄지-검지 픽셀 거리 임계값
SELECT_RADIUS   = 55   # 핀치 위치에서 스트로크를 선택하는 검색 반경 (픽셀)
LINE_THICKNESS  = 4    # 그리기 선 굵기
MAX_PARTICLES   = 300  # 동시 활성 파티클 최대 개수

# 스무딩 설정
SMOOTH_ALPHA       = 0.35  # 그리기 EMA 계수: 낮을수록 부드럽지만 반응이 느려짐 (0.0~1.0)
PINCH_SMOOTH_ALPHA = 0.35  # 핀치 이동 EMA 계수
MIN_DRAW_DIST      = 5     # 이 픽셀 이상 이동했을 때만 점 추가 (떨림 필터)

# 모드 전환 지연 (hysteresis): 이 프레임 수 동안 비-그리기 모드가 유지되어야 선을 끊음
# 짧은 오인식(손가락 흔들림)으로 선이 잘리는 현상 방지
NON_DRAW_DELAY = 8

# 그리기에 사용할 색상 팔레트 (BGR 형식, 스트로크마다 순환)
COLOR_PALETTE = [
    (100, 200, 255),   # 하늘색
    (200,  80, 255),   # 보라
    (100, 255, 150),   # 연두
    ( 50, 160, 255),   # 파랑
    (255, 140, 100),   # 코랄
    (255, 220,  50),   # 노랑
]
SELECT_COLOR = (0, 255, 200)   # 선택된 스트로크 경계 박스 색상 (민트)


# ===== 파티클 클래스 =====
class Particle:
    """손끝에서 발생하는 빛나는 파티클 하나를 표현하는 클래스"""

    def __init__(self, x, y, color):
        self.x = float(x)
        self.y = float(y)
        # 무작위 속도 (위쪽으로 퍼져나가는 방향)
        self.vx = random.uniform(-3.0, 3.0)
        self.vy = random.uniform(-5.0, -0.5)
        self.life  = 1.0                          # 수명 (1.0 = 새것, 0.0 = 소멸)
        self.decay = random.uniform(0.03, 0.07)  # 매 프레임 감소량
        self.size  = random.randint(2, 5)         # 원의 반지름
        self.color = color                        # (B, G, R) 색상 튜플

    def update(self):
        """위치와 수명을 한 프레임만큼 업데이트"""
        self.x  += self.vx
        self.y  += self.vy
        self.vy += 0.12   # 중력: 위로 올라가다 서서히 아래로
        self.life -= self.decay

    def is_alive(self):
        return self.life > 0.0

    def draw(self, canvas):
        """수명에 비례한 투명도로 파티클을 캔버스에 그리기"""
        alpha = max(0.0, self.life)
        color = (
            int(self.color[0] * alpha),
            int(self.color[1] * alpha),
            int(self.color[2] * alpha),
        )
        cv2.circle(canvas, (int(self.x), int(self.y)), self.size, color, -1)


# ===== 스트로크(그림 오브젝트) 클래스 =====
class Stroke:
    """하나의 연속 드로잉 스트로크(그림 오브젝트)를 나타내는 클래스"""

    def __init__(self, color):
        self.points   = []     # (x, y) 정수 좌표 목록
        self.color    = color  # (B, G, R) 색상
        self.selected = False  # 핀치로 선택된 상태 여부

    def add_point(self, x, y):
        self.points.append((int(x), int(y)))

    def is_empty(self):
        return len(self.points) == 0

    def get_bbox(self):
        """스트로크를 감싸는 경계 박스 (x1, y1, x2, y2) 반환. 비어있으면 None."""
        if not self.points:
            return None
        xs = [p[0] for p in self.points]
        ys = [p[1] for p in self.points]
        return (min(xs), min(ys), max(xs), max(ys))

    def is_near(self, x, y, radius=SELECT_RADIUS):
        """좌표 (x, y)가 이 스트로크의 임의의 점으로부터 radius 픽셀 이내에 있는지 확인"""
        for px, py in self.points:
            if math.hypot(x - px, y - py) < radius:
                return True
        return False

    def translate(self, dx, dy):
        """스트로크 전체를 (dx, dy)만큼 평행 이동"""
        self.points = [(px + int(dx), py + int(dy)) for px, py in self.points]

    def render(self, canvas):
        """캔버스에 스트로크를 선으로 그리기"""
        n = len(self.points)
        if n == 0:
            return
        if n == 1:
            # 점이 1개면 원으로 표시
            cv2.circle(canvas, self.points[0], LINE_THICKNESS // 2 + 1, self.color, -1)
            return
        # 연속된 점을 선분으로 연결
        for i in range(1, n):
            cv2.line(canvas, self.points[i - 1], self.points[i], self.color, LINE_THICKNESS)


# ===== 유틸리티 함수 =====

def lm_to_px(landmark, w, h):
    """MediaPipe 정규화 랜드마크(0~1 범위)를 픽셀 좌표 (x, y)로 변환"""
    return (int(landmark.x * w), int(landmark.y * h))


def finger_extended(lm_list, tip_id):
    """
    손가락이 펼쳐져 있는지 판단 (엄지 제외).

    원리: 손가락 끝(tip)의 y좌표가 PIP 관절(tip-2)보다 위에 있으면(=y 값이 작으면) 펼친 것.
    MediaPipe 좌표계: y축이 아래 방향으로 증가.

    tip_id : 손가락 끝 랜드마크 인덱스 (검지=8, 중지=12, 약지=16, 새끼=20)
    """
    pip_id = tip_id - 2  # PIP 관절 (두 번째 마디)
    return lm_list[tip_id][1] < lm_list[pip_id][1]


def detect_gesture(lm_list):
    """
    현재 손 모양(제스처)을 감지하여 모드와 관련 좌표를 반환.

    반환 형식:
      ('drawing', (index_x, index_y))  - 그리기 모드: 검지만 펼쳐진 경우
      ('pinch',   (center_x, center_y)) - 조작 모드: 엄지+검지가 가까운 경우
      ('none',    None)                 - 인식 불가 자세
    """
    # 각 손가락(검지~새끼) 펼침 여부 확인
    idx_ext  = finger_extended(lm_list, 8)   # 검지
    mid_ext  = finger_extended(lm_list, 12)  # 중지
    ring_ext = finger_extended(lm_list, 16)  # 약지
    pink_ext = finger_extended(lm_list, 20)  # 새끼

    thumb_tip = lm_list[4]   # 엄지 끝 좌표 (Landmark 4)
    index_tip = lm_list[8]   # 검지 끝 좌표 (Landmark 8)

    # 엄지-검지 거리 계산
    pinch_dist = math.hypot(
        index_tip[0] - thumb_tip[0],
        index_tip[1] - thumb_tip[1],
    )
    # 핀치 중심점 (엄지-검지 사이 중간점)
    pinch_center = (
        (index_tip[0] + thumb_tip[0]) // 2,
        (index_tip[1] + thumb_tip[1]) // 2,
    )

    # --- 우선순위 1: 핀치(집기) 모드 ---
    # 조건 1: 엄지-검지 거리가 임계값 이하
    # 조건 2: 검지 끝(8)이 검지 MCP 관절(5)보다 위에 있어야 함
    #   → 주먹을 쥐면 검지 끝이 MCP 아래로 내려가므로 주먹을 핀치로 오인식하지 않음
    index_mcp = lm_list[5]
    index_tip_above_mcp = index_tip[1] < index_mcp[1]
    if pinch_dist < PINCH_THRESHOLD and index_tip_above_mcp:
        return 'pinch', pinch_center

    # --- 우선순위 2: 그리기 모드 ---
    # 검지만 펼쳐지고 나머지(중지~새끼)가 모두 굽혀져 있어야 함
    if idx_ext and not mid_ext and not ring_ext and not pink_ext:
        return 'drawing', index_tip

    # --- 기타: 인식 불가 ---
    return 'none', None


def apply_glow_effect(base_canvas):
    """
    선이 그려진 캔버스에 글로우(빛남) 효과를 적용하여 반환.
    서로 다른 반경의 Gaussian Blur를 여러 겹 겹쳐 빛나는 느낌을 연출.
    """
    # 아무것도 그려지지 않은 빈 캔버스이면 바로 반환
    if not np.any(base_canvas):
        return base_canvas

    b_tight = cv2.GaussianBlur(base_canvas, (11, 11), 0)  # 선 주변 강한 빛
    b_mid   = cv2.GaussianBlur(base_canvas, (25, 25), 0)  # 중간 퍼짐
    b_wide  = cv2.GaussianBlur(base_canvas, (51, 51), 0)  # 넓고 은은한 빛

    result = cv2.addWeighted(base_canvas, 1.0, b_tight, 0.8, 0)
    result = cv2.addWeighted(result,      1.0, b_mid,   0.5, 0)
    result = cv2.addWeighted(result,      1.0, b_wide,  0.3, 0)
    return result


# ===== 메인 함수 =====

def main():
    # --- 웹캠 초기화 ---
    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        print("[오류] 웹캠을 열 수 없습니다. 연결 상태를 확인하세요.")
        return

    # 고해상도 요청 (지원되지 않으면 기본값 사용)
    cap.set(cv2.CAP_PROP_FRAME_WIDTH,  1280)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)

    # --- 상태 변수 초기화 ---
    strokes   = []    # 완성/진행 중인 모든 Stroke 객체 목록
    cur_stroke = None # 현재 그리는 중인 Stroke
    particles  = []   # 활성 Particle 목록

    selected   = None # 핀치로 선택된 Stroke
    prev_pinch = None # 이전 프레임의 핀치 중심점 좌표
    prev_mode  = 'none'  # 이전 프레임의 제스처 모드
    color_idx  = 0    # 다음 스트로크에 사용할 COLOR_PALETTE 인덱스

    # EMA 스무딩용 누적 좌표 (None이면 아직 초기화 전)
    smooth_x: float = None
    smooth_y: float = None
    smooth_pinch_x: float = None  # 핀치 중심점 스무딩
    smooth_pinch_y: float = None

    # 모드 전환 지연 카운터: 연속 비-그리기 프레임 수
    non_draw_count = 0

    with mp_hands.Hands(
        max_num_hands=2,  # 양손이 화면에 있어도 오른손을 놓치지 않도록 2로 설정
        model_complexity=1,
        min_detection_confidence=0.70,
        min_tracking_confidence=0.60,
    ) as hands:

        print("AI Photo Booth를 시작합니다. 카메라 창을 클릭 후 사용하세요.")
        print("  - 검지만 펴기: 그리기 모드")
        print("  - 엄지+검지 모으기: 조작 모드")
        print("  - C: 초기화 / Z: 실행 취소 / Q or ESC: 종료")

        while True:
            ok, frame = cap.read()
            if not ok:
                print("[오류] 프레임을 읽지 못했습니다.")
                break

            # 좌우 반전(미러링) — 사용자가 거울처럼 자연스럽게 보이도록
            frame = cv2.flip(frame, 1)
            h, w  = frame.shape[:2]

            # ---- MediaPipe로 손 인식 ----
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            rgb.flags.writeable = False
            results = hands.process(rgb)
            rgb.flags.writeable = True

            # 이번 프레임의 모드 및 UI 표시 초기화
            cur_mode       = 'none'
            mode_label     = "대기 중 (오른손을 보여주세요)"
            mode_ui_color  = (160, 160, 160)

            # 오른손 랜드마크만 추출
            # MediaPipe는 미러링된 이미지 기준으로 handedness를 판단하므로
            # cv2.flip 후 처리하면 "Right" = 사용자의 오른손
            right_hand_lm = None
            if results.multi_hand_landmarks and results.multi_handedness:
                for hand_lm, handedness in zip(
                    results.multi_hand_landmarks, results.multi_handedness
                ):
                    if handedness.classification[0].label == 'Right':
                        right_hand_lm = hand_lm
                        break  # 오른손 하나만 사용

            if right_hand_lm is not None:
                hand_lm = right_hand_lm

                # 21개 랜드마크를 픽셀 좌표 리스트로 변환
                lm_px = [lm_to_px(lm, w, h) for lm in hand_lm.landmark]

                # 손 골격 시각화 (프레임 위에 겹쳐 그림)
                mp_drawing.draw_landmarks(
                    frame, hand_lm, mp_hands.HAND_CONNECTIONS,
                    mp_drawing_styles.get_default_hand_landmarks_style(),
                    mp_drawing_styles.get_default_hand_connections_style(),
                )

                # 제스처 감지
                cur_mode, cur_pos = detect_gesture(lm_px)

                # ========== 그리기 모드 ==========
                if cur_mode == 'drawing':
                    mode_label    = "그리기 모드"
                    mode_ui_color = (50, 200, 255)
                    non_draw_count = 0  # 그리기 중이므로 카운터 초기화

                    # --- EMA 스무딩: 손 떨림 완화 ---
                    raw_x, raw_y = cur_pos
                    if smooth_x is None:
                        smooth_x, smooth_y = float(raw_x), float(raw_y)
                    else:
                        smooth_x = SMOOTH_ALPHA * raw_x + (1 - SMOOTH_ALPHA) * smooth_x
                        smooth_y = SMOOTH_ALPHA * raw_y + (1 - SMOOTH_ALPHA) * smooth_y
                    draw_pos = (int(smooth_x), int(smooth_y))

                    # cur_stroke가 없을 때만 새 스트로크 시작
                    # (prev_mode 기반 → cur_stroke 기반으로 변경: 지연 중 끊기지 않도록)
                    if cur_stroke is None:
                        cur_stroke = Stroke(color=COLOR_PALETTE[color_idx % len(COLOR_PALETTE)])
                        strokes.append(cur_stroke)
                        color_idx += 1  # 다음 스트로크는 다른 색상

                    # 최소 이동거리 이상일 때만 점 추가 (미세 떨림 제거)
                    if cur_stroke is not None:
                        if cur_stroke.points:
                            last = cur_stroke.points[-1]
                            if math.hypot(draw_pos[0] - last[0], draw_pos[1] - last[1]) >= MIN_DRAW_DIST:
                                cur_stroke.add_point(draw_pos[0], draw_pos[1])
                        else:
                            cur_stroke.add_point(draw_pos[0], draw_pos[1])

                    # 파티클 생성 (최대치 미만일 때만)
                    if len(particles) < MAX_PARTICLES:
                        col = COLOR_PALETTE[(color_idx - 1) % len(COLOR_PALETTE)]
                        for _ in range(4):
                            particles.append(Particle(draw_pos[0], draw_pos[1], col))

                    # 핀치 관련 상태 초기화 (모드 전환)
                    prev_pinch = None
                    selected   = None
                    for s in strokes:
                        s.selected = False

                # ========== 핀치(조작) 모드 ==========
                elif cur_mode == 'pinch':
                    mode_label    = "조작 모드 (집기)"
                    mode_ui_color = (0, 240, 180)
                    non_draw_count = 0  # 의도적 전환이므로 카운터 초기화

                    # 진행 중이던 스트로크가 있으면 즉시 종료 (의도적 모드 전환)
                    cur_stroke = None
                    smooth_x   = None
                    smooth_y   = None

                    # --- 핀치 중심점 EMA 스무딩: 손 떨림으로 인한 튀는 이동 방지 ---
                    raw_px, raw_py = cur_pos
                    if smooth_pinch_x is None:
                        smooth_pinch_x, smooth_pinch_y = float(raw_px), float(raw_py)
                    else:
                        smooth_pinch_x = PINCH_SMOOTH_ALPHA * raw_px + (1 - PINCH_SMOOTH_ALPHA) * smooth_pinch_x
                        smooth_pinch_y = PINCH_SMOOTH_ALPHA * raw_py + (1 - PINCH_SMOOTH_ALPHA) * smooth_pinch_y
                    pinch_pos = (int(smooth_pinch_x), int(smooth_pinch_y))

                    # 핀치가 새로 시작될 때(이전 프레임이 pinch가 아닐 때): 오브젝트 선택
                    if prev_mode != 'pinch':
                        for s in strokes:
                            s.selected = False
                        selected = None
                        # 나중에 그린 스트로크(앞에 렌더링된 것)를 우선 선택
                        for s in reversed(strokes):
                            if not s.is_empty() and s.is_near(pinch_pos[0], pinch_pos[1]):
                                s.selected = True
                                selected   = s
                                break

                    # 핀치 유지 중: 선택된 스트로크를 이동
                    if selected is not None and prev_pinch is not None:
                        dx = pinch_pos[0] - prev_pinch[0]
                        dy = pinch_pos[1] - prev_pinch[1]
                        selected.translate(dx, dy)

                    prev_pinch = pinch_pos  # 스무딩된 좌표를 기준점으로 저장

                    # 핀치 중심점 시각화
                    cv2.circle(frame, pinch_pos, 22, (0, 240, 180), 2)
                    cv2.circle(frame, pinch_pos,  6, (0, 240, 180), -1)

                else:
                    # 그리기/핀치 외 자세 → NON_DRAW_DELAY 프레임 후에만 선 끊음
                    # 짧은 오인식(검지가 잠깐 분류 실패)에 의한 선 끊김 방지
                    non_draw_count += 1
                    if non_draw_count >= NON_DRAW_DELAY:
                        cur_stroke     = None
                        smooth_x       = None
                        smooth_y       = None
                        smooth_pinch_x = None
                        smooth_pinch_y = None

                prev_mode = cur_mode

            else:
                # 오른손이 감지되지 않음 → 마찬가지로 지연 후 선 끊음
                non_draw_count += 1
                if non_draw_count >= NON_DRAW_DELAY:
                    cur_stroke     = None
                    smooth_x       = None
                    smooth_y       = None
                    smooth_pinch_x = None
                    smooth_pinch_y = None
                prev_mode = 'none'

            # ===== 그림 캔버스 렌더링 =====

            # 매 프레임 빈 캔버스부터 시작 — 스트로크 이동 시 깔끔하게 다시 그려짐
            draw_canvas = np.zeros((h, w, 3), dtype=np.uint8)
            for s in strokes:
                if not s.is_empty():
                    s.render(draw_canvas)

            # 글로우 효과 적용 (Gaussian Blur 다층 합성)
            glow_canvas = apply_glow_effect(draw_canvas)

            # 선택된 스트로크 주변에 경계 박스 표시
            for s in strokes:
                if s.selected:
                    bbox = s.get_bbox()
                    if bbox:
                        x1, y1, x2, y2 = bbox
                        pad = 15
                        cv2.rectangle(glow_canvas,
                                      (x1 - pad,     y1 - pad),
                                      (x2 + pad,     y2 + pad),
                                      SELECT_COLOR, 2)
                        cv2.rectangle(glow_canvas,
                                      (x1 - pad - 3, y1 - pad - 3),
                                      (x2 + pad + 3, y2 + pad + 3),
                                      (0, 180, 130), 1)  # 두 번째 선 (입체감)

            # 파티클 업데이트 + 렌더링
            p_canvas = np.zeros((h, w, 3), dtype=np.uint8)
            live_particles = []
            for p in particles:
                p.update()
                if p.is_alive():
                    p.draw(p_canvas)
                    live_particles.append(p)
            particles = live_particles

            # 최종 합성: 웹캠 영상(60%) + 글로우 선(100%) + 파티클(85%)
            output = cv2.addWeighted(frame,      0.6, glow_canvas, 1.0, 0)
            output = cv2.addWeighted(output,     1.0, p_canvas,    0.85, 0)

            # ===== UI 오버레이 =====

            # 상단 반투명 정보 바
            top_bar = output.copy()
            cv2.rectangle(top_bar, (0, 0), (w, 55), (0, 0, 0), -1)
            cv2.addWeighted(top_bar, 0.5, output, 0.5, 0, output)

            cv2.putText(output, f"Mode: {mode_label}",
                        (15, 36), cv2.FONT_HERSHEY_SIMPLEX, 0.85, mode_ui_color, 2)
            cv2.putText(output, f"Strokes: {len(strokes)}",
                        (w - 195, 36), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (200, 200, 200), 2)

            # 하단 반투명 안내 바
            bot_bar = output.copy()
            cv2.rectangle(bot_bar, (0, h - 35), (w, h), (0, 0, 0), -1)
            cv2.addWeighted(bot_bar, 0.5, output, 0.5, 0, output)
            cv2.putText(output,
                        "[C] Clear All  [Z] Undo  [Q/ESC] Quit",
                        (15, h - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (180, 180, 180), 1)

            # 화면에 최종 출력
            cv2.imshow("AI Photo Booth - Air Drawing", output)

            # ===== 키 입력 처리 =====
            key = cv2.waitKey(1) & 0xFF

            if key in (ord('q'), 27):       # Q 또는 ESC: 프로그램 종료
                break

            elif key == ord('c'):           # C: 전체 초기화
                strokes.clear()
                particles.clear()
                cur_stroke  = None
                selected    = None
                color_idx   = 0

            elif key == ord('z'):           # Z: 마지막 스트로크 취소 (Undo)
                if strokes:
                    removed = strokes.pop()
                    if selected is removed:
                        selected = None
                    if cur_stroke is removed:
                        cur_stroke = None

    cap.release()
    cv2.destroyAllWindows()
    print("AI Photo Booth가 종료되었습니다.")


if __name__ == "__main__":
    main()
