# pip install opencv-python mediapipe numpy Pillow

import cv2
import mediapipe as mp
import numpy as np
import random
import time
import math
from PIL import ImageFont, ImageDraw, Image

mp_holistic = mp.solutions.holistic
mp_hands    = mp.solutions.hands
mp_draw     = mp.solutions.drawing_utils

FRAME_W, FRAME_H = 1280, 720
COUNTDOWN  = 10
MALE_SCALE = 1.22   # 성인 남성: 사용자보다 22% 크게

# ── 페이즈 타임스탬프 (전체 속도 제어) ──
T_RET = 0.6   # 0 → T_RET  : 중립 복귀 (이전 포즈에서 팔 내리기)
T_ACT = 2.0   # T_RET → T_ACT : 인트로 (팔 올리기)
              # T_ACT → 10s   : 포즈 유지 + 애니메이션

POSES = ["half_heart", "pat_head", "v_sign", "arm_around"]
POSE_NAMES_KR = {
    "half_heart": "반쪽 하트",
    "pat_head":   "머리 쓰다듬기",
    "v_sign":     "V 사인",
    "arm_around": "어깨동무",
}

_FONT = "C:/Windows/Fonts/malgun.ttf"
try:
    FONT_LG = ImageFont.truetype(_FONT, 38)
    FONT_SM = ImageFont.truetype(_FONT, 22)
except Exception:
    FONT_LG = FONT_SM = ImageFont.load_default()


# ── 유틸 ──────────────────────────────────────────────────────

def put_kr(frame, text, pos, font=None, color=(255, 255, 255)):
    if font is None:
        font = FONT_LG
    pil  = Image.fromarray(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
    draw = ImageDraw.Draw(pil)
    draw.text(pos, text, font=font, fill=(color[2], color[1], color[0]))
    return cv2.cvtColor(np.array(pil), cv2.COLOR_RGB2BGR)

def lm_px(lm_list, idx, w, h):
    p = lm_list[idx]
    return int(p.x * w), int(p.y * h)

def lerp_pt(a, b, t):
    t = max(0.0, min(1.0, t))
    return (int(a[0] + (b[0]-a[0])*t), int(a[1] + (b[1]-a[1])*t))

def c01(v):
    return max(0.0, min(1.0, v))


# ── 팔 EMA 상태 ───────────────────────────────────────────────

class ArmState:
    """팔꿈치·손목 위치를 EMA 스무딩. 포즈 전환 시 이전 위치에서 자연스럽게 이어짐."""
    def __init__(self):
        self.el = None
        self.wr = None

    def step(self, t_el, t_wr, alpha=0.18):
        if self.el is None:
            self.el, self.wr = t_el, t_wr
        else:
            def lp(a, b): return int(a + alpha*(b-a))
            self.el = (lp(self.el[0], t_el[0]), lp(self.el[1], t_el[1]))
            self.wr = (lp(self.wr[0], t_wr[0]), lp(self.wr[1], t_wr[1]))


# ── 시선 + 깜빡임 상태 ────────────────────────────────────────

class ArtistAnim:
    def __init__(self, w, h):
        self.gx = float(w // 2)
        self.gy = float(h // 3)
        self.blinking  = False
        self.blink_end = 0.0
        self._sched()

    def _sched(self):
        self.blink_next = time.time() + random.uniform(2.0, 5.0)

    def gaze(self, tx, ty, alpha=0.12):
        self.gx += alpha * (tx - self.gx)
        self.gy += alpha * (ty - self.gy)

    def blink(self):
        now = time.time()
        if not self.blinking and now >= self.blink_next:
            self.blinking  = True
            self.blink_end = now + random.uniform(0.12, 0.22)
        if self.blinking and now >= self.blink_end:
            self.blinking = False
            self._sched()
        return not self.blinking


# ── 드로잉 헬퍼 ───────────────────────────────────────────────

def body_offsets(now):
    return (int(2 * math.sin(2*math.pi*now / 5.3)),
            int(5 * math.sin(2*math.pi*now / 3.8)))

def draw_eyes(frame, hd, hr, gx, gy, open_):
    er = max(hr // 4, 6)
    pr = max(hr // 8, 3)
    mo = max(er - pr - 1, 2)
    for s in [-1, 1]:
        ex, ey = hd[0] + s*hr//3, hd[1] - hr//6
        if not open_:
            cv2.line(frame, (ex-er, ey), (ex+er, ey), (160, 160, 160), 2)
        else:
            cv2.circle(frame, (ex, ey), er, (255, 255, 255), -1)
            cv2.circle(frame, (ex, ey), er, (120, 120, 120),  1)
            dx, dy = gx - ex, gy - ey
            d = max(1.0, math.hypot(dx, dy))
            cv2.circle(frame, (int(ex+mo*dx/d), int(ey+mo*dy/d)), pr, (20,20,20), -1)

def limb(frame, sh, el, wr, clr, tk=3):
    cv2.line(frame, sh, el, clr, tk)
    cv2.line(frame, el, wr, clr, tk)


# ── 손 모양 드로잉 ────────────────────────────────────────────

def draw_bezier_arm(frame, p0, ctrl, p1, clr, tk=3):
    """2차 베지어 곡선으로 팔 그리기 (반쪽하트·어깨동무의 자연스러운 아치)"""
    pts = []
    for i in range(25):
        s = i / 24.0
        x = int((1-s)**2 * p0[0] + 2*(1-s)*s * ctrl[0] + s**2 * p1[0])
        y = int((1-s)**2 * p0[1] + 2*(1-s)*s * ctrl[1] + s**2 * p1[1])
        pts.append((x, y))
    for j in range(len(pts)-1):
        cv2.line(frame, pts[j], pts[j+1], clr, tk+1)


def draw_finger_half_heart(frame, wrist, size, clr, tk=3):
    """
    손가락으로 만드는 반쪽 하트 제스처.
    검지(위)와 엄지(왼쪽 대각선)로 하트 오른쪽 절반 표현.
    사용자가 왼쪽에서 같은 동작을 하면 완성 하트가 됨.
    """
    fl = max(size, 16)
    # 손바닥 작은 원
    cv2.circle(frame, wrist, fl // 3, clr, tk - 1)
    # 검지: 위로 뻗기
    idx = (wrist[0], wrist[1] - fl)
    cv2.line(frame, wrist, idx, clr, tk + 1)
    # 엄지: 왼쪽 대각선 위 (사용자 방향 = 하트 곡선 쪽)
    thb = (wrist[0] - fl * 3 // 5, wrist[1] - fl * 3 // 4)
    cv2.line(frame, wrist, thb, clr, tk + 1)
    # 검지 끝↔엄지 끝 베지어 곡선으로 연결 (하트 상단 곡선)
    ctrl = (wrist[0] - fl // 4, wrist[1] - fl - fl // 3)
    pts = []
    for i in range(12):
        s = i / 11.0
        x = int((1-s)**2 * idx[0] + 2*(1-s)*s * ctrl[0] + s**2 * thb[0])
        y = int((1-s)**2 * idx[1] + 2*(1-s)*s * ctrl[1] + s**2 * thb[1])
        pts.append((x, y))
    for i in range(len(pts) - 1):
        cv2.line(frame, pts[i], pts[i+1], clr, tk)


def draw_open_hand(frame, wrist, size, clr, tk=2):
    """
    열린 손바닥 + 손가락 4개 그리기 (머리 쓰다듬기용).
    손목 위치를 손바닥 중심으로, 손가락은 위쪽으로.
    """
    pw = max(size, 10)
    ph = max(size // 2, 5)
    # 손바닥 타원
    cv2.ellipse(frame, wrist, (pw, ph), 0, 0, 360, clr, tk)
    # 손가락 4개 (등간격)
    for i in range(4):
        fx = wrist[0] - pw + i * (pw * 2 // 3) + pw // 4
        fy = wrist[1] - ph
        cv2.line(frame, (fx, fy), (fx, fy - int(pw * 0.9)), clr, tk)
    # 엄지 (왼쪽 대각선)
    cv2.line(frame, (wrist[0] - pw, wrist[1]),
             (wrist[0] - pw - pw//2, wrist[1] + ph), clr, tk)


def draw_shoulder_hand(frame, contact, size, clr, tk=2):
    """
    어깨에 얹힌 손 모양 (어깨동무용).
    손가락이 어깨를 감싸는 형태.
    """
    pw = max(size, 8)
    # 손바닥
    cv2.ellipse(frame, contact, (pw, pw//2), 0, 0, 360, clr, -1)
    # 손가락 (아래쪽 감싸기)
    for i in range(3):
        fx = contact[0] - pw//2 + i * pw//2
        fy = contact[1] + pw//2
        cv2.line(frame, (fx, fy), (fx + i*2-2, fy + pw//2), clr, tk)


# ── 아티스트 메인 드로어 ──────────────────────────────────────

def draw_artist(frame, pose_lm, pose_type, fw, fh,
                inner: ArmState, outer: ArmState,
                anim: ArtistAnim, t, now):
    """
    성인 남성 스틱피겨를 사용자 오른쪽에 그린다.

    [비율 설계]
    - MALE_SCALE: 사용자 기준 스케일의 1.22배
    - 어깨 높이: 사용자보다 0.28H 위 → 눈높이가 더 높아 보임

    [페이즈]
    0 ~ T_RET : 팔 중립 복귀
    T_RET ~ T_ACT : 인트로(팔 올리기)
    T_ACT ~ 10s  : 포즈 유지 + 애니메이션

    [AI 모델 통합 방법 - 실사 캐릭터 적용 시]
    이 함수에서 계산하는 관절 좌표(ai, ao, ahd, inner.el, inner.wr 등)가
    캐릭터 스켈레톤의 IK(역기구학) 목표점으로 활용된다.
    1. Unity/Unreal/three.js: 이 좌표를 화면 → 3D 월드 좌표로 변환 후 본(Bone)에 매핑
    2. 2D 캐릭터: 각 관절 각도를 계산하여 사전 제작된 스프라이트 시트를 합성
    3. ControlNet/ControlVideo: stick-figure를 그린 마스크 이미지를 조건으로
       실시간 이미지 생성 모델에 입력 → 매 프레임 생성 (GPU 필요)
    4. MediaPipe Mesh 결합: 이 스켈레톤을 GAN 기반 Human Pose Transfer에 연결
    """
    PL = mp_holistic.PoseLandmark

    # 사용자 관절
    ul_sh = lm_px(pose_lm, PL.LEFT_SHOULDER,  fw, fh)
    nose  = lm_px(pose_lm, PL.NOSE,           fw, fh)
    ul_wr = lm_px(pose_lm, PL.LEFT_WRIST,     fw, fh)

    # 스케일 계산 (코→어깨 거리 기반)
    ref  = max(ul_sh[1] - nose[1], 35)
    hr   = max(int(ref / 3 * MALE_SCALE), 22)
    H    = 2 * hr
    sh_w = int(2.8 * H)
    tor  = int(3.0 * H)
    th   = int(2.2 * H)
    shn  = int(2.0 * H)
    al   = int(2.7 * H)
    nk   = int(0.5 * H)

    # 호흡 오프셋
    adx, ady = body_offsets(now)
    def J(x, y): return (x + adx, y + ady)

    # 아티스트 위치
    # - ax: 사용자 왼쪽 어깨 오른편 (충분한 간격)
    # - ay: 사용자 어깨보다 0.28H 위 → 성인 남성 눈높이 차이 표현
    gap = max(int(sh_w * 0.38), 28)
    ax  = min(ul_sh[0] + sh_w//2 + gap, fw - sh_w//2 - 8)
    ay  = max(ul_sh[1] - int(H * 0.28), int(H * 1.5))  # 아티스트 어깨가 더 높음

    # 호흡 포함 관절
    ai  = J(ax - sh_w//2, ay)
    ao  = J(ax + sh_w//2, ay)
    ahd = J(ax, ay - nk - H)
    ihi = J(ax - sh_w//4, ay + tor)
    ohi = J(ax + sh_w//4, ay + tor)
    spb = J(ax, ay + tor)
    ink = J(ax - sh_w//4 - hr//2, ay + tor + th)
    onk = J(ax + sh_w//4 + hr//2, ay + tor + th)
    iak = (ink[0], ink[1] + shn)
    oak = (onk[0], onk[1] + shn)
    ank = J(ax, ay)

    clr, tk = (0, 200, 255), 3

    # 몸통
    cv2.line(frame, ai,  ao,  clr, tk)
    cv2.line(frame, ank, spb, clr, tk)
    cv2.line(frame, ai,  ihi, clr, tk)
    cv2.line(frame, ao,  ohi, clr, tk)
    cv2.line(frame, ihi, ohi, clr, tk)
    cv2.line(frame, ihi, ink, clr, tk)
    cv2.line(frame, ink, iak, clr, tk)
    cv2.line(frame, ohi, onk, clr, tk)
    cv2.line(frame, onk, oak, clr, tk)
    cv2.line(frame, ank, ahd, clr, tk)
    cv2.circle(frame, ahd, hr, clr, tk)

    eyes_open = anim.blink()

    # 사용자 기준 상호작용 좌표
    u_hr     = max(ref // 3, 15)
    head_top = (nose[0], nose[1] - int(2.6 * u_hr))
    head_hi  = (nose[0], nose[1] - int(1.2 * u_hr))

    # 중립 팔 위치
    ni_el = (ai[0] - al//5, ai[1] + al//2)
    ni_wr = (ai[0] - al//8, ai[1] + al)
    no_el = (ao[0] + al//5, ao[1] + al//2)
    no_wr = (ao[0] + al//8, ao[1] + al)

    # ── 포즈 페이즈별 타겟 ──────────────────────────────────

    gx_t = float(fw // 2)
    gy_t = float(fh // 4)
    # v_sign만 outer(오른팔) 사용, 나머지는 inner(왼팔)
    pose_uses_outer = (pose_type == "v_sign")

    # ── 반쪽 하트 ──────────────────────────────────────────
    if pose_type == "half_heart":
        # inner arm이 두 어깨 사이 위로 높은 아치 → 반쪽 하트 형성
        # 사용자가 같은 동작을 거울로 하면 함께 완성하트가 됨
        hrt_tgt = (ul_sh[0], ul_sh[1])

        if t < T_RET:
            tel, twr, a_in = ni_el, ni_wr, 0.20
            gx_t, gy_t = float(fw//2), float(fh//4)

        elif t < T_ACT:
            p   = c01((t - T_RET) / (T_ACT - T_RET))
            # 팔꿈치 조절점: 두 어깨 정중앙 위로 높게 → 베지어 아치 = 반쪽 하트
            apex = ((ai[0] + hrt_tgt[0])//2,
                    min(ai[1], hrt_tgt[1]) - int(H * 0.65))
            tel  = lerp_pt(ni_el, apex, p)
            twr  = lerp_pt(ni_wr, hrt_tgt, p)
            a_in = 0.20
            gx_t, gy_t = float(ul_sh[0]), float(ul_sh[1])

        else:
            apex = ((ai[0] + hrt_tgt[0])//2,
                    min(ai[1], hrt_tgt[1]) - int(H * 0.65))
            tel  = apex
            twr  = hrt_tgt
            a_in = 0.12
            act  = t - T_ACT
            frac = c01(act / 4.0)
            gx_t = ul_sh[0] + (fw//2 - ul_sh[0]) * frac
            gy_t = ul_sh[1] + (fh//4 - ul_sh[1]) * frac

    # ── 머리 쓰다듬기 ───────────────────────────────────────
    elif pose_type == "pat_head":

        if t < T_RET:
            tel, twr, a_in = ni_el, ni_wr, 0.20
            gx_t, gy_t = float(fw//2), float(fh//4)

        elif t < T_ACT:
            p      = c01((t - T_RET) / (T_ACT - T_RET))
            aim_el = ((ai[0] + head_top[0])//2, ai[1] - al//2)
            tel    = lerp_pt(ni_el, aim_el,   p)
            twr    = lerp_pt(ni_wr, head_top, p)
            a_in   = 0.14
            gx_t, gy_t = float(head_top[0]), float(head_top[1])

        else:
            act  = t - T_ACT
            wave = abs(math.sin(2*math.pi*act / 1.6))
            sx   = int(u_hr * 0.3 * math.sin(2*math.pi*act / 1.6))
            pat  = lerp_pt(head_hi, head_top, wave)
            pat  = (pat[0] + sx, pat[1])
            tel  = ((ai[0] + pat[0])//2, ai[1] - al//2)
            twr  = pat
            a_in = 0.18
            gc   = (math.sin(2*math.pi*act / 5.0) + 1) / 2
            gx_t = fw//2 + (nose[0] - fw//2) * (1-gc)
            gy_t = fh//4 + (nose[1] - fh//4) * (1-gc)

    # ── V 사인 (오른팔/outer 사용, 가슴 앞 높이) ────────────
    elif pose_type == "v_sign":
        # 아티스트 오른팔(outer)로 가슴 앞에서 자연스럽게 브이
        # 사용자 앞을 막지 않도록 오른쪽 팔 사용
        v_tgt = (ax + sh_w//4, ay - int(H * 0.45))

        if t < T_RET:
            tel, twr, a_in = no_el, no_wr, 0.20
            gx_t, gy_t = float(fw//2), float(fh//4)

        elif t < T_ACT:
            p   = c01((t - T_RET) / (T_ACT - T_RET))
            aim_el = (ao[0] - hr//2, ao[1] - al//4)
            tel    = lerp_pt(no_el, aim_el, p)
            twr    = lerp_pt(no_wr, v_tgt,  p)
            a_in   = 0.22
            gx_t, gy_t = float(fw//2), float(fh//4)

        else:
            act = t - T_ACT
            sx  = int(3 * math.sin(2*math.pi*act / 2.4))
            sy  = int(2 * math.cos(2*math.pi*act / 3.2))
            tel = (ao[0] - hr//2 + sx//2, ao[1] - al//4 + sy//2)
            twr = (v_tgt[0] + sx, v_tgt[1] + sy)
            a_in = 0.10
            g   = (math.sin(2*math.pi*act / 6.0) + 1) / 2
            gx_t = fw//2 + (nose[0] - fw//2) * g * 0.3
            gy_t = fh//4 + (nose[1] - fh//4) * g * 0.3

    # ── 어깨동무 ───────────────────────────────────────────
    elif pose_type == "arm_around":

        T_ACT_AA = 3.0
        arm_tgt  = (ul_sh[0], ul_sh[1] - int(H * 0.08))

        if t < T_RET:
            tel, twr, a_in = ni_el, ni_wr, 0.20
            gx_t, gy_t = float(nose[0]), float(nose[1])

        elif t < T_ACT_AA:
            p   = c01((t - T_RET) / (T_ACT_AA - T_RET))
            # 팔꿈치를 높게 → 어깨 위를 넘어 내려오는 베지어 아치 = 어깨동무 느낌
            aim_el = ((ai[0] + arm_tgt[0])//2,
                      min(ai[1], arm_tgt[1]) - int(H * 0.35))
            tel    = lerp_pt(ni_el, aim_el,  p)
            twr    = lerp_pt(ni_wr, arm_tgt, p)
            a_in   = 0.18
            gp = c01(p)
            gx_t = ul_sh[0] + (fw//2 - ul_sh[0]) * gp * 0.5
            gy_t = ul_sh[1] + (fh//4 - ul_sh[1]) * gp * 0.5

        else:
            act    = t - T_ACT_AA
            sq     = int(u_hr * 0.30 * abs(math.sin(2*math.pi*act / 2.5)))
            arm_tgt= (ul_sh[0] - sq, ul_sh[1] - int(H * 0.08))
            tel    = ((ai[0] + arm_tgt[0])//2,
                      min(ai[1], arm_tgt[1]) - int(H * 0.35))
            twr    = arm_tgt
            a_in   = 0.14
            gc     = (math.sin(2*math.pi*act / 7.0) + 1) / 2
            gx_t   = fw//2 + (nose[0] - fw//2) * (1-gc)
            gy_t   = fh//4 + (nose[1] - fh//4) * (1-gc)

    else:
        tel, twr, a_in = ni_el, ni_wr, 0.18

    # 팔 EMA 업데이트: v_sign은 outer(오른팔) 사용
    if pose_uses_outer:
        outer.step(tel, twr, a_in)
        inner.step(ni_el, ni_wr, 0.12)
    else:
        inner.step(tel, twr, a_in)
        sw = int(3 * math.sin(2*math.pi*now / 2.9))
        outer.step((no_el[0], no_el[1]+sw), (no_wr[0], no_wr[1]+sw), 0.08)

    # 팔 그리기: half_heart·arm_around는 베지어 곡선으로 자연스러운 아치
    if pose_type in ("half_heart", "arm_around") and inner.el and t >= T_RET:
        draw_bezier_arm(frame, ai, inner.el, inner.wr, clr, tk)
        limb(frame, ao, outer.el, outer.wr, clr, tk)
    else:
        limb(frame, ai, inner.el, inner.wr, clr, tk)
        limb(frame, ao, outer.el, outer.wr, clr, tk)

    # ── 포즈별 손 모양 ───────────────────────────────────────

    if pose_type == "half_heart" and t >= T_RET:
        # 검지+엄지로 만드는 손가락 반쪽 하트 제스처
        draw_finger_half_heart(frame, inner.wr, max(hr * 3 // 4, 18), clr, tk)

    elif pose_type == "pat_head" and t >= T_RET:
        draw_open_hand(frame, inner.wr, max(hr//3, 8), clr, tk)

    elif pose_type == "v_sign" and t >= T_RET:
        wr = outer.wr   # 오른팔(outer) 손목에 V 표시
        fl = max(hr, 22)
        cv2.line(frame, wr, (wr[0] - fl//3, wr[1] - fl), clr, tk+1)
        cv2.line(frame, wr, (wr[0] + fl//2, wr[1] - fl), clr, tk+1)

    elif pose_type == "arm_around" and t >= T_RET:
        draw_shoulder_hand(frame, inner.wr, max(hr//2, 12), clr, tk)
        if inner.wr:
            # 팔이 어깨를 감싸 내려오는 느낌의 단선
            ep = (inner.wr[0] - hr//2, inner.wr[1] + hr//2)
            cv2.line(frame, inner.wr, ep, clr, tk - 1)

    # 시선 + 눈
    anim.gaze(gx_t, gy_t)
    draw_eyes(frame, ahd, hr, anim.gx, anim.gy, eyes_open)


# ── 메인 루프 ─────────────────────────────────────────────────

def main():
    cap = cv2.VideoCapture(0)
    cap.set(cv2.CAP_PROP_FRAME_WIDTH,  FRAME_W)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, FRAME_H)

    holistic = mp_holistic.Holistic(
        min_detection_confidence=0.5,
        min_tracking_confidence=0.5,
        model_complexity=1,
    )

    inner = ArmState()
    outer = ArmState()
    anim  = ArtistAnim(FRAME_W, FRAME_H)

    current_pose = random.choice(POSES)
    timer_start  = time.time()
    flash_on     = False
    flash_time   = 0.0

    h_node = mp_draw.DrawingSpec(color=(255, 200, 50), thickness=2, circle_radius=3)
    h_conn = mp_draw.DrawingSpec(color=(255, 140,  0), thickness=2)

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        frame = cv2.flip(frame, 1)
        fh, fw = frame.shape[:2]

        results = holistic.process(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))

        now = time.time()
        t   = now - timer_start
        remaining = max(0, COUNTDOWN - int(t))

        if t >= COUNTDOWN and not flash_on:
            flash_on   = True
            flash_time = now
        if flash_on and (now - flash_time) > 0.5:
            flash_on     = False
            others       = [p for p in POSES if p != current_pose]
            current_pose = random.choice(others)
            timer_start  = now

        if results.pose_landmarks:
            lm = results.pose_landmarks.landmark
            mp_draw.draw_landmarks(
                frame, results.pose_landmarks, mp_holistic.POSE_CONNECTIONS,
                mp_draw.DrawingSpec(color=(0, 255, 100), thickness=2, circle_radius=3),
                mp_draw.DrawingSpec(color=(0, 200,  60), thickness=2),
            )
            draw_artist(frame, lm, current_pose, fw, fh,
                        inner, outer, anim, t, now)

        for hlm in [results.left_hand_landmarks, results.right_hand_landmarks]:
            if hlm:
                mp_draw.draw_landmarks(frame, hlm,
                                       mp_hands.HAND_CONNECTIONS, h_node, h_conn)

        if flash_on:
            cv2.addWeighted(np.full_like(frame, 255), 0.6, frame, 0.4, 0, frame)

        t_c = (30, 120, 255) if remaining > 3 else (0, 30, 255)
        cv2.putText(frame, f"{remaining}s", (fw-125, 72),
                    cv2.FONT_HERSHEY_SIMPLEX, 2.5, t_c, 5)
        frame = put_kr(frame, f"포즈: {POSE_NAMES_KR[current_pose]}", (20, 14), FONT_LG)
        frame = put_kr(frame, "SPACE: 포즈 변경  |  Q: 종료",
                       (20, fh-42), FONT_SM, color=(170, 170, 170))

        cv2.imshow("AI Photo Booth - Artist Pose Mode", frame)

        key = cv2.waitKey(1) & 0xFF
        if key == ord('q'):
            break
        elif key == 32:
            others       = [p for p in POSES if p != current_pose]
            current_pose = random.choice(others)
            timer_start  = now
            flash_on     = False

    cap.release()
    cv2.destroyAllWindows()
    holistic.close()


if __name__ == "__main__":
    main()
