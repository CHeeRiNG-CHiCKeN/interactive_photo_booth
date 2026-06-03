# pip install opencv-python mediapipe numpy websockets
import cv2
import mediapipe as mp
import random
import time
import base64
import asyncio
import websockets
import json
import threading

mp_holistic = mp.solutions.holistic

FRAME_W, FRAME_H = 1280, 720
COUNTDOWN = 10

POSES = ["half_heart", "pat_head", "v_sign", "arm_around"]

POSE_NAMES_KR = {
    "half_heart": "반쪽 하트",
    "pat_head":   "머리 쓰다듬기",
    "v_sign":     "V 사인",
    "arm_around": "어깨동무",
}

POSE_TO_UNITY = {
    "half_heart": "wave",
    "arm_around": "wave",
    "v_sign":     "point",
    "pat_head":   "idle",
}

# ── WebSocket 서버 ────────────────────────────────────────────

connected_clients = set()
ws_loop = None
_last_send_time = 0.0
skip_requested = threading.Event()


async def _ws_handler(websocket):
    connected_clients.add(websocket)
    try:
        async for message in websocket:
            try:
                data = json.loads(message)
                if data.get("action") == "skip":
                    skip_requested.set()
            except Exception:
                pass
    except Exception:
        pass
    finally:
        connected_clients.discard(websocket)


async def _ws_main():
    async with websockets.serve(_ws_handler, "localhost", 8765):
        await asyncio.Future()


def start_ws_server():
    global ws_loop
    ws_loop = asyncio.new_event_loop()
    asyncio.set_event_loop(ws_loop)
    ws_loop.run_until_complete(_ws_main())


def send_frame_and_pose(frame, pose_name, pose_kr, remaining):
    global _last_send_time
    now = time.time()
    if now - _last_send_time < 0.066:
        return
    _last_send_time = now

    if not ws_loop or not connected_clients:
        return

    small = cv2.resize(frame, (640, 360))
    _, buffer = cv2.imencode('.jpg', small, [cv2.IMWRITE_JPEG_QUALITY, 65])
    frame_b64 = base64.b64encode(buffer).decode('utf-8')

    data = json.dumps({
        "pose":    pose_name,
        "pose_kr": pose_kr,
        "timer":   remaining,
        "frame":   frame_b64
    })

    async def _broadcast():
        dead = set()
        for c in connected_clients.copy():
            try:
                await c.send(data)
            except Exception:
                dead.add(c)
        connected_clients.difference_update(dead)

    asyncio.run_coroutine_threadsafe(_broadcast(), ws_loop)


# ── 메인 루프 ─────────────────────────────────────────────────

def main():
    ws_thread = threading.Thread(target=start_ws_server, daemon=True)
    ws_thread.start()
    print("WebSocket 서버 시작: ws://localhost:8765")
    print("Unity에서 Play 버튼을 누르세요. 이 창은 최소화해도 됩니다.")

    cap = cv2.VideoCapture(0)
    cap.set(cv2.CAP_PROP_FRAME_WIDTH,  FRAME_W)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, FRAME_H)

    holistic = mp_holistic.Holistic(
        min_detection_confidence=0.5,
        min_tracking_confidence=0.5,
        model_complexity=1,
    )

    current_pose = random.choice(POSES)
    timer_start  = time.time()
    flash_on     = False
    flash_time   = 0.0

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        frame = cv2.flip(frame, 1)
        holistic.process(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))

        now = time.time()
        t   = now - timer_start
        remaining = max(0, COUNTDOWN - int(t))

        # Unity 스페이스바 또는 10초 경과 시 포즈 변경
        if skip_requested.is_set() or (t >= COUNTDOWN and not flash_on):
            skip_requested.clear()
            flash_on   = True
            flash_time = now

        if flash_on and (now - flash_time) > 0.4:
            flash_on     = False
            others       = [p for p in POSES if p != current_pose]
            current_pose = random.choice(others)
            timer_start  = now

        send_frame_and_pose(
            frame,
            POSE_TO_UNITY.get(current_pose, "idle"),
            POSE_NAMES_KR.get(current_pose, current_pose),
            remaining
        )

        # 작은 디버그 창
        debug = cv2.resize(frame, (320, 180))
        cv2.putText(debug, f"{POSE_NAMES_KR.get(current_pose)}  {remaining}s",
                    (5, 20), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 100), 1)
        cv2.putText(debug, "Q: quit",
                    (5, 170), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (180, 180, 180), 1)
        cv2.imshow("Debug (minimize me)", debug)

        key = cv2.waitKey(1) & 0xFF
        if key == ord('q'):
            break

    cap.release()
    cv2.destroyAllWindows()
    holistic.close()


if __name__ == "__main__":
    main()
