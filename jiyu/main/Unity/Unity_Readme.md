# AI Interactive Photo Booth

MediaPipe로 사용자의 포즈를 실시간 감지하고, 옆에 있는 가상 아티스트 캐릭터가 함께 포즈를 취하는 인터랙티브 포토부스 프로젝트입니다.

---

## 버전 구성

### v1 — 스틱피겨 버전 (`project1.py`)
Python 단독 실행. OpenCV 화면 위에 스틱피겨 아티스트가 사용자 옆에 나타나 포즈를 함께 수행합니다.

### v2 — Unity AR 버전 (`project1_unity.py` + `PhotoBooth/`)
Python이 MediaPipe로 포즈를 감지하고 WebSocket으로 Unity에 전송하면, Unity 3D 아바타가 AR처럼 사용자 옆에서 애니메이션을 수행합니다.

---

## 동작 방식

```
카메라 → MediaPipe 포즈 감지 → WebSocket → Unity 3D 캐릭터 애니메이션
```

- 10초마다 포즈가 랜덤으로 변경됩니다
- 스페이스바를 누르면 즉시 다음 포즈로 전환됩니다
- 지원 포즈: 반쪽 하트 / 머리 쓰다듬기 / V 사인 / 어깨동무

---

## 폴더 구조

```
jiyu/
├── main/
│   ├── project1.py          # v1: 스틱피겨 버전
│   ├── project1_unity.py    # v2: Unity AR 버전 (Python 측)
│   ├── UNITY_ROADMAP.md     # Unity 통합 개발 로드맵
│   └── README.md
└── PhotoBooth/              # v2: Unity 프로젝트
    ├── Assets/
    │   ├── PoseReceiver.cs          # WebSocket 수신 + 애니메이션 제어
    │   ├── WebcamBackground.cs      # 웹캠 배경 스크립트
    │   ├── PhotoBoothAnimator.controller
    │   ├── Waving.fbx               # Mixamo 캐릭터 + 애니메이션
    │   ├── Breathing Idle.fbx
    │   ├── Pointing Gesture.fbx
    │   └── Scenes/
    ├── Packages/
    └── ProjectSettings/
```

---

## 실행 방법

### v1 — 스틱피겨 버전

**설치**
```bash
pip install opencv-python mediapipe numpy Pillow
```

**실행**
```bash
python project1.py
```

| 키 | 동작 |
|----|------|
| `Space` | 포즈 즉시 변경 |
| `Q` | 종료 |

---

### v2 — Unity AR 버전

**요구사항**
- Python 3.8+
- Unity 6 (URP 템플릿)
- 웹캠

**Python 패키지 설치**
```bash
pip install opencv-python mediapipe numpy websockets
```

**Unity 패키지** (Package Manager에서 설치)
- Animation Rigging
- Newtonsoft Json
- NativeWebSocket
  ```
  https://github.com/endel/NativeWebSocket.git#upm
  ```

**실행 순서**
```bash
# 1. Python 서버 먼저 실행
python project1_unity.py

# 2. Unity에서 Play 버튼 클릭
# → Unity Game 탭에서 AR 화면 확인
```

| 키 | 동작 |
|----|------|
| `Space` (Unity 창) | 포즈 즉시 변경 |
| `Q` (Python 디버그 창) | 종료 |

---

## 기술 스택

| 분류 | 기술 |
|------|------|
| 포즈 감지 | MediaPipe Holistic |
| 영상 처리 | OpenCV |
| 3D 렌더링 | Unity 6 (URP) |
| 통신 | WebSocket (NativeWebSocket) |
| 캐릭터 | Mixamo (FBX) |
| 애니메이션 | Unity Animator + Animation Rigging |

---

## 시스템 아키텍처 (v2)

```
[웹캠]
  ↓
[Python: MediaPipe 포즈 감지]
  ↓ WebSocket (ws://localhost:8765)
  ↓ JSON { pose, pose_kr, timer, frame(base64) }
[Unity: PoseReceiver.cs]
  ├── RawImage  → 웹캠 프레임 배경 표시
  ├── Animator  → 포즈에 맞는 애니메이션 트리거
  └── TextMeshPro → 포즈명 / 타이머 UI 표시
```

---

## v1 주요 기능 (스틱피겨)

### 아티스트 캐릭터
- 성인 남성 7.5등신 비율 (어깨 2.8H · 몸통 3.0H · 팔 2.7H)
- 사용자 카메라 거리에 맞게 크기 자동 조정
- 호흡 애니메이션 (전신 사인파 흔들림)
- 랜덤 눈 깜빡임 + EMA 시선 추적

### 포즈 4종

| 포즈 | 동작 |
|------|------|
| 반쪽 하트 | 왼팔 아치 + 손가락 반쪽 하트 제스처 |
| 머리 쓰다듬기 | 사용자 머리 위를 1.6초 주기로 왕복 |
| V 사인 | 오른팔로 가슴 앞에서 브이 |
| 어깨동무 | 왼팔이 사용자 어깨 위로 베지어 아치 |

---

## 향후 계획

- 동물 캐릭터 AR 버전 (v3)
- 캐릭터 동적 위치 추적 (사용자 머리 위 공전 등)
- WebGL 빌드 (브라우저 실행)
