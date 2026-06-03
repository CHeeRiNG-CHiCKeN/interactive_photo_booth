# 캐릭터 & 애니메이션 제작 가이드

Mixamo, TRIPO, DeepMotion, Plask Motion을 활용해 3D 캐릭터와 커스텀 애니메이션을 만들고 Unity 프로젝트에 적용하는 방법입니다.

---

## 한 줄 요약
- 캐릭터 만들기 : 캐릭터 FBX 파일 (FBX for Unity) (리깅 되는지 꼭 확인! / Mixamo에 업로드 후 모션 적용되는지 확인만 해봐도 됨)
- 모션 만들기 : 캐릭터 FBX 파일 (10초동안 움직이는 모션으로!)

---

## 전체 흐름

```
캐릭터 만들기          애니메이션 만들기        Unity에 적용
──────────────         ──────────────          ──────────
Mixamo (무료 캐릭터)  → Mixamo (기존 라이브러리)  → FBX 임포트
TRIPO (AI 생성)      → DeepMotion (내 영상 기반) → FBX 임포트
                     → Plask (웹캠 실시간)       → FBX 임포트
```

---

## 1. Mixamo — 캐릭터 + 애니메이션

> 무료 3D 캐릭터 + 수백 개 애니메이션 라이브러리
> 🔗 https://www.mixamo.com

### 캐릭터 가져오기
1. mixamo.com 접속 → Adobe 계정으로 로그인
2. 상단 **Characters** 탭 → 원하는 캐릭터 클릭
3. 우측 **Download** 클릭
   - Format: `FBX for Unity`
   - Download

### 애니메이션 가져오기
--> 요거 내가 했던거ㅠㅠ / 우리가 원하는 동작은 정확히 없었어서 애니메이션은 3,4번 링크로 하는거 추천.. (임시구현은 손흘들기 : Waving, 브이 비슷한거 : pointing gesture로 함)
1. 상단 **Animations** 탭
2. 검색창에 원하는 동작 입력
   | 원하는 동작 | 검색어 |
   |-------------|--------|
   | 브이 사인 | `victory`, `peace sign`, `gesture` |
   | 머리 쓰다듬기 | `head pat`, `thinking` |
   | 반쪽 하트 | `heart`, `love gesture` |
   | 손 흔들기 | `wave`, `waving` |
3. 미리보기 후 **Download**
   - Format: `FBX for Unity`
   - Skin: `Without Skin` (캐릭터는 따로 받았으므로)

### Unity에 적용 (지유)
1. 다운받은 FBX 파일을 Unity `Assets` 폴더에 드래그
2. Inspector → **Rig** 탭 → Animation Type: `Humanoid` → Apply
3. Animator Controller에 새 State로 추가

---

## 2. TRIPO — AI로 캐릭터 생성

> 텍스트 또는 이미지로 3D 캐릭터 자동 생성
> 🔗 https://www.tripo3d.ai

### 사용법
1. tripo3d.ai 접속 → 로그인
2. 텍스트 프롬프트 입력 예시:
   ```
   cute cartoon cat with jetpack, game character style, 3D model
   cute small animal mascot, big eyes, chibi style
   ```
   또는 참고 이미지를 업로드
3. AI가 3D 모델 생성 (1~2분 소요)
4. **Export → GLB 또는 FBX** 다운로드

### Mixamo에 연결해 애니메이션 입히기
1. Mixamo 접속 → 상단 **Upload Character** 클릭
2. TRIPO에서 받은 파일 업로드
3. 자동 리깅(뼈대 생성) 진행 → **Next**
4. 리깅 완료 후 원하는 애니메이션 선택 및 다운로드

> ⚠️ TRIPO로 만든 캐릭터는 Mixamo 자동 리깅이 실패할 수 있어요.
> 실패 시 Blender에서 수동 리깅이 필요합니다.

> 캐릭터 만드는 다른 사이트들도 임시로 찾아봐도 좋을듯!!ㅠㅠㅠ (자동 리깅 되는 곳으로! 수동 리깅은 너무 힘들듯)

---

## 3. DeepMotion — 영상으로 커스텀 애니메이션 생성

> 내가 직접 찍은 영상 → 3D 애니메이션으로 자동 변환
> 🔗 https://www.deepmotion.com
> 무료 플랜: 월 5회 제한

### 촬영 팁
- 스마트폰으로 촬영 OK
- **전신이 프레임 안에** 들어오게 촬영
- 배경은 단색/단순할수록 정확도 높음
- 밝은 조명 환경 권장

### 사용법
1. deepmotion.com 접속 → 회원가입
2. **Animate 3D** 클릭 → 영상 업로드
3. 처리 완료 후 (2~5분) 애니메이션 미리보기
4. **Export → FBX** 다운로드

### Unity에 적용 (지유)
1. 다운받은 FBX를 Unity Assets에 드래그
2. Inspector → Rig → Animation Type: `Humanoid` → Apply
3. Animator Controller에 새 State 추가
4. 기존 Transition 연결 및 Condition 설정

---

## 4. Plask Motion — 웹캠으로 실시간 모션 캡처

> 웹캠 앞에서 동작하면 바로 3D 애니메이션 생성
> 🔗 https://plask.ai
> DeepMotion보다 빠르지만 정확도는 약간 낮음

### 사용법
1. plask.ai 접속 → 로그인
2. **New Project** → **Motion Capture** 클릭
3. 웹캠 허용 후 **Record** 클릭
4. 원하는 동작 수행 (V 사인, 손 흔들기, 하트 등)
5. **Stop** → 애니메이션 미리보기 확인
6. **Export → FBX** 다운로드

### Unity에 적용 (지유)
DeepMotion과 동일한 방식으로 임포트 및 적용

---

## 추천 조합

| 목표 | 추천 조합 |
|------|-----------|
| 빠르게 완성 | Mixamo 캐릭터 + Mixamo 애니메이션 |
| 귀여운 동물 캐릭터 | TRIPO 생성 → Mixamo 리깅 → Mixamo 애니메이션 |
| 나만의 포즈 (브이, 하트 등) | Mixamo 캐릭터 + Plask로 직접 촬영 |
| 고품질 커스텀 | Mixamo 캐릭터 + DeepMotion |

---

## Unity 임포트 공통 체크리스트

```
[ ] FBX 파일을 Assets 폴더에 드래그
[ ] Inspector → Rig → Animation Type: Humanoid
[ ] Apply 클릭
[ ] Animator Controller에 State 추가
[ ] Transition 화살표 연결
[ ] Has Exit Time 해제
[ ] Condition 설정 (DoWave / DoPoint / DoIdle 등)
```
