# AI Photo Booth — Unity 통합 로드맵

Python(MediaPipe) 기반 스틱피겨 프로토타입을 Unity 실사 3D 캐릭터로 전환하는 전체 과정 요약

---

## 아키텍처 개요

```
Python (MediaPipe 관절 감지)
        │
        │  WebSocket  JSON 실시간 전송
        ▼
Unity  (3D 캐릭터 + Animation Rigging IK)
        │
        ▼
포토부스 최종 화면
```

**Python이 보내는 데이터 (JSON)**
```json
{
  "pose": "half_heart",
  "user_nose":           [0.50, 0.28],
  "user_left_shoulder":  [0.45, 0.42],
  "user_left_wrist":     [0.40, 0.63],
  "timer": 7.5
}
```
> 좌표는 화면 크기로 정규화된 0~1 값

---

## 전체 로드맵

| 단계 | 내용 | 예상 소요 |
|------|------|----------|
| Step 1 | Unity 설치 | 30분 |
| Step 2 | Mixamo 캐릭터 + 애니메이션 준비 | 20분 |
| Step 3 | Unity 프로젝트 세팅 + 캐릭터 임포트 | 30분 |
| Step 4 | Python WebSocket 서버 추가 | 15분 |
| Step 5 | Unity C# 수신 스크립트 작성 | 1시간 |
| Step 6 | IK로 접촉 포즈 연결 | 1시간 |

---

## Step 1 — Unity 설치

1. [unity.com/download](https://unity.com/download) → **Unity Hub** 다운로드 및 설치
2. Unity Hub → **Installs** → **Install Editor** → **Unity 6000.x LTS** 선택
3. 모듈 추가 체크:
   - `Microsoft Visual Studio Community`
   - `Windows Build Support (IL2CPP)`

---

## Step 2 — Mixamo 캐릭터 + 애니메이션 준비

1. [mixamo.com](https://www.mixamo.com) → Adobe 무료 계정 로그인
2. **Characters** 탭 → 원하는 캐릭터 선택 (예: `Y Bot`, `Adam`)
3. **Animations** 탭 → 아래 4종 검색 후 다운로드

| 검색어 | 포즈 용도 |
|--------|----------|
| `Idle` | 기본 대기 (호흡) |
| `Waving` | 반쪽 하트 기반 |
| `Pointing Forward` | V 사인 기반 |
| `Capoeira` | 어깨동무 기반 |

**다운로드 설정**
- Format: `FBX for Unity`
- 첫 번째(캐릭터 포함): `With Skin`
- 나머지 애니메이션: `Without Skin`
- Frames: `30`

---

## Step 3 — Unity 프로젝트 세팅 + 캐릭터 임포트

### 3-1. 프로젝트 생성
- Unity Hub → **New project** → **3D (URP)**
- 프로젝트 이름: `AIPhotoBooth`

### 3-2. 패키지 설치
**Window → Package Manager → + → Add package by name**

```
com.unity.animation.rigging
com.unity.nuget.newtonsoft-json
```

**+ → Add package from git URL**

```
https://github.com/endel/NativeWebSocket.git#upm
```

### 3-3. 캐릭터 임포트
1. `Assets` 폴더에 `Characters` 폴더 생성
2. Mixamo FBX 파일 드래그 앤 드롭
3. FBX 선택 → Inspector → **Rig** 탭 → Animation Type: `Humanoid` → **Apply**

### 3-4. 씬 배치
- 캐릭터 FBX → Hierarchy로 드래그
- Transform: Position `(0, 0, 0)`, Rotation `(0, 0, 0)`, Scale `(1, 1, 1)`
- Main Camera: Position `(0, 1.6, -3)`, Rotation `(0, 0, 0)`

### 3-5. Animation Rigging 세팅
1. 캐릭터 선택 → **Add Component** → `Rig Builder`
2. Hierarchy에서 캐릭터 하위에 빈 오브젝트 생성 → 이름: `Rig`
3. `Rig` 오브젝트 → **Add Component** → `Rig`
4. 캐릭터의 `Rig Builder` → Rig Layers → `+` → `Rig` 연결

---

## Step 4 — Python WebSocket 서버 추가

`project1.py`에 아래 코드 추가:

```python
# pip install websockets
import asyncio, websockets, json, threading

_ws_clients = set()
_ws_data    = {}

async def _ws_handler(ws):
    _ws_clients.add(ws)
    try:
        await ws.wait_closed()
    finally:
        _ws_clients.discard(ws)

async def _ws_server():
    async with websockets.serve(_ws_handler, "localhost", 8765):
        await asyncio.Future()

def start_ws_server():
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    loop.run_until_complete(_ws_server())

# 메인 시작 시 별도 스레드로 서버 실행
threading.Thread(target=start_ws_server, daemon=True).start()

# 메인 루프 안에서 매 프레임 호출
async def broadcast(data: dict):
    if _ws_clients:
        msg = json.dumps(data)
        await asyncio.gather(*[c.send(msg) for c in _ws_clients])

# draw_artist() 호출 직후에 아래 추가
payload = {
    "pose": current_pose,
    "user_nose":          [nose[0]/fw, nose[1]/fh],
    "user_left_shoulder": [ul_sh[0]/fw, ul_sh[1]/fh],
    "user_left_wrist":    [ul_wr[0]/fw, ul_wr[1]/fh],
    "timer": remaining,
}
asyncio.run(broadcast(payload))
```

---

## Step 5 — Unity C# 수신 스크립트

`Assets/Scripts/PoseReceiver.cs` 생성:

```csharp
using UnityEngine;
using NativeWebSocket;
using Newtonsoft.Json;

public class PoseReceiver : MonoBehaviour
{
    WebSocket ws;
    public string currentPose = "idle";
    public Vector2 userNose;
    public Vector2 userLeftShoulder;
    public Vector2 userLeftWrist;
    public float timer;

    async void Start()
    {
        ws = new WebSocket("ws://localhost:8765");
        ws.OnMessage += (bytes) =>
        {
            var json = System.Text.Encoding.UTF8.GetString(bytes);
            var data = JsonConvert.DeserializeObject<PoseData>(json);
            currentPose       = data.pose;
            userNose          = new Vector2(data.user_nose[0], data.user_nose[1]);
            userLeftShoulder  = new Vector2(data.user_left_shoulder[0], data.user_left_shoulder[1]);
            userLeftWrist     = new Vector2(data.user_left_wrist[0], data.user_left_wrist[1]);
            timer             = data.timer;
        };
        await ws.Connect();
    }

    void Update() => ws?.DispatchMessageQueue();

    async void OnDestroy() => await ws?.Close();
}

[System.Serializable]
public class PoseData
{
    public string pose;
    public float[] user_nose;
    public float[] user_left_shoulder;
    public float[] user_left_wrist;
    public float timer;
}
```

---

## Step 6 — IK로 접촉 포즈 연결

### 6-1. IK 타겟 오브젝트 생성

`Rig` 하위에 빈 오브젝트 4개 생성:

```
Rig/
├── LeftHandTarget      ← 반쪽 하트 · 머리 쓰다듬기 · 어깨동무
└── RightHandTarget     ← V 사인
```

### 6-2. Two Bone IK 컴포넌트 추가

`Rig` 오브젝트 → **Add Component** → `Two Bone IK Constraint`
- Root: `LeftUpperArm`
- Mid: `LeftLowerArm`
- Tip: `LeftHand`
- Target: `LeftHandTarget`

### 6-3. C# 스크립트로 IK 타겟 위치 제어

```csharp
public class ArtistController : MonoBehaviour
{
    public PoseReceiver receiver;
    public Transform leftHandTarget;
    public Transform rightHandTarget;
    public Animator animator;

    // 화면 좌표(0~1) → Unity 월드 좌표 변환
    Vector3 ScreenToWorld(Vector2 normalized)
    {
        // 카메라 앞 2m 평면에 투영
        var cam = Camera.main;
        var vp  = new Vector3(normalized.x, 1f - normalized.y, 2f);
        return cam.ViewportToWorldPoint(vp);
    }

    void Update()
    {
        var pose = receiver.currentPose;

        // 포즈별 애니메이터 트리거
        animator.SetTrigger(pose);

        // IK 타겟 위치를 사용자 관절에 연동
        switch (pose)
        {
            case "pat_head":
                leftHandTarget.position = ScreenToWorld(receiver.userNose);
                break;
            case "arm_around":
                leftHandTarget.position = ScreenToWorld(receiver.userLeftShoulder);
                break;
            case "half_heart":
                leftHandTarget.position = ScreenToWorld(receiver.userLeftWrist);
                break;
            case "v_sign":
                // 오른팔은 캐릭터 자체 위치 기준
                break;
        }
    }
}
```

---

## 최종 씬 구성

```
Scene
├── Main Camera         (Position: 0, 1.6, -3)
├── Directional Light
├── Artist (캐릭터)
│   ├── Animator        (Controller: ArtistAnimator)
│   ├── Rig Builder
│   ├── PoseReceiver    (WebSocket 수신)
│   ├── ArtistController
│   └── Rig/
│       ├── LeftHandTarget
│       └── RightHandTarget
└── Canvas (선택: 타이머 UI 표시용)
```

---

## 실행 순서

1. `python project1.py` 실행 (WebSocket 서버 시작)
2. Unity **Play** 버튼 클릭
3. Python이 관절 데이터를 전송하면 Unity 캐릭터가 실시간으로 반응

---


## AI 생성 캐릭터 사용하기

Mixamo 기본 캐릭터 대신, 생성형 AI로 만든 커스텀 얼굴을 가진 3D 아바타를 사용할 수 있습니다.


### 파이프라인

셀카 or AI 생성 얼굴 이미지
↓
Ready Player Me (웹에서 3D 아바타 생성)
↓
Mixamo (애니메이션 적용)
↓
Unity (WebSocket + IK 연결)



### 방법 1 — Ready Player Me

1. [readyplayer.me](https://readyplayer.me) 접속 → 셀카 업로드
2. AI가 자동으로 3D 아바타 생성 → 얼굴 / 헤어 / 옷 커스터마이징
3. **GLB 포맷**으로 내보내기
4. Mixamo에 드래그 앤 드롭 → 애니메이션 리깅 적용
5. FBX for Unity로 최종 다운로드 → Step 3과 동일하게 임포트

- Unity 공식 SDK 제공 (`com.readyplayerme.avatarloader`)
- 완전 무료
- 

### 방법 2 — AI 이미지 → Ready Player Me

1. Midjourney / DALL·E / Stable Diffusion으로 얼굴 이미지 생성
2. 해당 이미지를 Ready Player Me에 업로드
3. 이후 과정은 방법 1과 동일

### 방법 3 — MetaHuman Creator (고퀄리티, 고난도)

- Unreal Engine 공식 도구, 실사급 얼굴 생성 가능
- Unity로 옮기는 과정이 복잡하여 초보자에게는 비추천


---


## 참고 자료

- [Unity Animation Rigging 공식 문서](https://docs.unity3d.com/Packages/com.unity.animation.rigging@1.3/manual/index.html)
- [NativeWebSocket GitHub](https://github.com/endel/NativeWebSocket)
- [Mixamo 공식 사이트](https://www.mixamo.com)
- [MediaPipe Holistic](https://developers.google.com/mediapipe/solutions/vision/holistic_landmarker)
