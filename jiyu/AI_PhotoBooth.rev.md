# AI Photo Booth — 사용자를 향해 움직이는 AI 인플루언서

---

## 프로젝트 개요

기존 포토부스는 **아티스트 중심**이다. 캐릭터가 취할 포즈는 미리 정해져 있고, 사용자는 그 틀 안에 자신을 맞춰야 한다.

이 프로젝트는 그 방향을 뒤집는다.

> **AI 인플루언서가 사용자를 읽고, 사용자에게 맞춰 반응한다.**

사용자의 분위기를 분석해 어울리는 포즈를 선택하고, 사용자 얼굴을 실시간으로 시선 추적하며, 그 결과를 Unity 3D 캐릭터에 반영한다. 포토부스의 주인공은 아티스트가 아니라 사용자다.

---

## 핵심 기능

### 1. 분위기 기반 포즈 선택 (CLIP)

사용자의 분위기를 분석해 4가지 포즈 중 가장 어울리는 것을 선택한다.

- 밝고 활기차면 → V 사인
- 친근하고 따뜻하면 → 어깨동무
- 귀엽고 장난스러우면 → 반쪽 하트
- 차분하고 부드러우면 → 머리 쓰다듬기

### 2. 실시간 시선 추적 (MediaPipe Iris)

AI 캐릭터의 눈동자와 고개가 사용자 얼굴을 실시간으로 쫓아온다. 사용자가 어디에 있든 캐릭터는 그쪽을 바라본다.

### 3. 자연스러운 포즈 전환

포즈 변경 시 플래시 효과와 함께 부드러운 애니메이션 블렌딩으로 전환된다. CLIP 신뢰도가 낮거나 짧은 시간 안에 다시 전환되지 않도록 최소 유지 시간(5초)과 신뢰도 임계값(35%)을 두어 안정적인 인터랙션을 보장한다.

---

## AI 모델 선택과 이유

### MediaPipe FaceMesh + Iris — 시선 추적

**선택 이유**

시선 추적은 1프레임도 지연되면 어색하다. 캐릭터의 "존재감"은 얼마나 빠르게 사용자를 쳐다보느냐에서 나온다. 따라서 이 기능에는 낮은 레이턴시가 절대 조건이다.

- 일반 웹캠만으로 홍채 위치 추출 가능 — 전용 아이트래킹 하드웨어 불필요
- 30fps 이상 로컬 실시간 처리
- 기존에 사용 중인 MediaPipe 패키지 안에 포함

**작동 원리**

`FaceMesh(refine_landmarks=True)` 옵션을 켜면 기존 468개 얼굴 랜드마크에 더해 홍채 5개 포인트(landmark 468~472)가 추가된다. 눈의 좌우 끝 대비 홍채 중심 위치를 비율로 계산하면 -1 ~ +1 범위의 시선 방향 벡터를 얻을 수 있다.

```python
# 오른쪽 홍채 중심: landmark 468
iris  = lm[468]
eye_l = lm[33]   # 눈 왼쪽 끝
eye_r = lm[133]  # 눈 오른쪽 끝

eye_w  = (eye_r.x - eye_l.x) + 1e-6
gaze_x = (iris.x - (eye_l.x + eye_r.x) / 2) / (eye_w / 2)
# → -1(왼쪽) ~ +1(오른쪽)
```

이 값을 Unity 캐릭터의 Look At Constraint에 연결해 캐릭터 눈/고개가 사용자 얼굴을 향하게 한다.

---

### CLIP — 분위기 기반 포즈 선택

**선택 이유**

포즈 선택에는 "이 사람이 지금 어떤 분위기인가"라는 의미론적 판단이 필요하다. 규칙 기반(if 웃음 → V사인)은 경우의 수가 단순하고, 별도 학습 데이터가 필요한 분류 모델은 포즈 카테고리를 바꿀 때마다 재학습이 필요하다.

CLIP을 선택한 이유:
- **Zero-shot 분류** — 학습 데이터 없이 텍스트 프롬프트만으로 분류 기준 정의
- **프롬프트만 수정하면** 포즈 카테고리 추가/변경 가능 — 유연성
- CPU에서도 0.1~0.3초 내 추론 완료 → 3~5초 주기 실행에 적합

**Prompt Engineering**

CLIP 활용의 핵심은 프롬프트 설계다. 동작(gesture) 묘사보다 **분위기(vibe) 중심**으로 작성했다. CLIP은 기하학적 포즈 분석보다 의미론적 장면 이해에 강하기 때문에, "V자 손동작"보다 "밝고 활기찬 사람"으로 표현하는 것이 더 정확한 분류를 이끌어낸다.

| 포즈 | 텍스트 프롬프트 |
|------|----------------|
| 반쪽 하트 | `"a cute and playful person making a heart gesture"` |
| 머리 쓰다듬기 | `"a calm and gentle person with a relaxed expression"` |
| V 사인 | `"a cheerful and bright person celebrating with a peace sign"` |
| 어깨동무 | `"a friendly and warm person wanting to be close"` |

**설계 원칙:**
1. 사람(person)을 주어로 — 카메라 프레임의 맥락과 일치
2. 감정 형용사 + 행동 동사 조합 — CLIP의 의미 이해를 최대화
3. 포즈 자체보다 그 포즈가 어울리는 사람의 분위기를 기술

**작동 방식**

```python
POSE_PROMPTS = {
    "half_heart": "a cute and playful person making a heart gesture",
    "pat_head":   "a calm and gentle person with a relaxed expression",
    "v_sign":     "a cheerful and bright person celebrating with a peace sign",
    "arm_around": "a friendly and warm person wanting to be close",
}

# 텍스트 임베딩은 시작 시 한 번만 계산 (고정값)
text_tokens = clip.tokenize(list(POSE_PROMPTS.values())).to(device)
with torch.no_grad():
    text_features = model.encode_text(text_tokens)
    text_features /= text_features.norm(dim=-1, keepdim=True)

# 3초마다 이미지 임베딩과 유사도 계산
def classify_user_vibe(frame):
    image = preprocess(PIL_frame).unsqueeze(0).to(device)
    with torch.no_grad():
        image_features = model.encode_image(image)
        image_features /= image_features.norm(dim=-1, keepdim=True)
        probs = (image_features @ text_features.T).softmax(dim=-1)
    best_idx = probs.argmax()
    return pose_names[best_idx], float(probs[0][best_idx])
```

---

## 시스템 아키텍처

```
웹캠 입력
   │
   ├─ MediaPipe Holistic ──────── 신체 33개 랜드마크 → 포즈 애니메이션
   │
   ├─ MediaPipe FaceMesh + Iris ─ 홍채 위치 → 시선 벡터 (매 프레임, 30fps)
   │
   └─ CLIP ───────────────────── 분위기 분류 → 포즈 선택 (3초마다)
          │
          ▼  WebSocket JSON
      {
        "pose":            "v_sign",
        "gaze":            {"x": 0.12, "y": -0.05, "face_x": 640, "face_y": 360},
        "clip_confidence": 0.72,
        "clip_ready":      true
      }
          │
          ▼  Unity 3D 캐릭터
          ├─ Look At Constraint   ← gaze 데이터 → 눈/고개 실시간 추적
          └─ Animator Controller  ← pose 데이터 → 포즈 전환
```

**두 모델의 역할 분리**

| | MediaPipe Iris | CLIP |
|--|----------------|------|
| 실행 주기 | 매 프레임 (30fps) | 3초마다 |
| 역할 | "지금 어디를 봐야 하나" | "지금 어떤 사람인가" |
| 응답 속도 | 즉각 | 주기적 판단 |
| 핵심 이유 | 시선은 1프레임 지연도 어색함 | 분위기는 3초에 한 번 판단해도 자연스러움 |

---

## 구현 과정에서 맞닥뜨린 문제들

### 문제 1: Stable Diffusion 실시간 불가

초기에는 ControlNet + Stable Diffusion으로 매 프레임 캐릭터 이미지를 생성하는 방안을 검토했다. 그러나 RTX 3060 기준 1장 생성에 5~10초가 소요되어 실시간 인터랙션이 불가능했다.

**해결:** SD의 역할을 분리했다.

- **세션 중 (실시간):** Unity Mixamo 3D 캐릭터가 사용자와 인터랙션 — MediaPipe + CLIP이 담당
- **촬영 순간 (최종 결과물):** 사용자 + 캐릭터가 함께한 Unity 화면을 캡처 → ControlNet이 포즈를 보존한 채 SD가 아트 스타일로 변환 → AI 생성 사진 출력

실시간으로 3D 캐릭터와 교류하다가, 촬영 버튼을 누르면 그 장면이 AI 일러스트로 변환되어 나오는 구조다. 필름 인화를 기다리는 포토부스 경험과 자연스럽게 맞아떨어진다.

### 문제 2: CLIP 포즈 전환이 너무 잦음

3초마다 CLIP 결과를 즉시 반영하면 사용자가 잠깐 웃을 때마다 포즈가 바뀌어 어색했다.

**해결:** 두 가지 조건을 추가했다.
- **신뢰도 임계값 35%**: 확신이 낮으면 전환하지 않음
- **최소 유지 시간 5초**: 마지막 전환 후 5초 이내 재전환 차단

```python
if (clip_confidence >= 0.35
        and clip_pose != current_pose
        and now - last_transition >= 5.0):
    next_pose_by_clip = clip_pose  # 전환 예약
```

### 문제 3: Holistic과 FaceMesh 병행 실행

기존에 사용 중인 MediaPipe Holistic의 face landmark는 홍채를 포함하지 않는다. `refine_landmarks` 옵션이 Holistic에는 없기 때문이다.

**해결:** FaceMesh를 별도 인스턴스로 병렬 실행했다. Holistic은 신체 포즈용, FaceMesh는 시선 추적용으로 역할을 분리했다.

### 문제 4: CLIP 첫 로딩 시간

CLIP 모델 첫 다운로드 및 로딩에 1~2분이 소요된다. 이 시간 동안 부스가 아무것도 하지 않으면 사용자 경험이 나쁘다.

**해결:** CLIP을 백그라운드 스레드에서 로딩하고, 준비되기 전까지는 기존 랜덤 방식으로 동작하다가 준비 완료 시 자동으로 CLIP 방식으로 전환되도록 했다.

```python
# 시작 즉시 백그라운드 로딩
threading.Thread(target=_load_clip, daemon=True).start()

# classify_user_vibe() 내부
if not _clip_ready:
    return None, 0.0  # 준비 전엔 랜덤 fallback
```

---

## 기술 스택

| 구분 | 기술 |
|------|------|
| 포즈 감지 | MediaPipe Holistic |
| 시선 추적 | MediaPipe FaceMesh + Iris |
| 분위기 분류 | CLIP (ViT-B/32) |
| 실시간 통신 | WebSocket (Python ↔ Unity) |
| 캐릭터 렌더링 | Unity + Animation Rigging |
| 언어 | Python, C# |

---

## 한계와 향후 발전 방향

**현재 한계**
- CLIP은 미세한 표정 변화보다 전반적 분위기 분류에 최적화 — 표정이 모호하면 분류 정확도가 낮아질 수 있음
- 포즈 카테고리가 4가지로 고정 — 사용자 행동 범위가 넓어질수록 분류 경계가 불명확해질 수 있음

**향후 발전 방향**

| 기능 | 모델 | 내용 |
|------|------|------|
| 최종 사진 생성 | ControlNet + Stable Diffusion | 촬영 시 Unity 장면을 AI 아트로 변환해 제공 |
| 감정 인식 추가 | FER / DeepFace | CLIP과 병행해 표정 기반 세밀한 반응 |
| 캐릭터 의사결정 | Gemini Flash | 시스템 프롬프트로 캐릭터 페르소나 설계, 상황별 유연한 반응 생성 |

---

## 설치 및 실행

```bash
# 기본 패키지
pip install opencv-python mediapipe numpy websockets pillow

# CLIP
pip install git+https://github.com/openai/CLIP.git torch torchvision
```

**실행 (Unity 연동)**
```bash
python Unity_v2.py      # WebSocket 서버 + CLIP + Iris
# → Unity에서 Play 버튼
```

**실행 (독립 실행)**
```bash
python AI_Photo_Booth_v2.py   # Unity 없이 단독 실행
```
