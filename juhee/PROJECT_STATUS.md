# Interactive Photobooth Project Status

**User:** 고애수 (goaesu5@gmail.com)  
**Project:** 고애수플젝_손주희  
**Goal:** 인터랙티브 포토부스 (AI 포즈 감지, 손 추적) - 토큰 효율적으로 구현

---

## 완료된 작업 (✅)

### Option 1: MoveNet (포즈 감지)
- **상태:** 완전 작동 ✅
- **기술:** TensorFlow.js + MoveNet (SINGLEPOSE_LIGHTNING)
- **기능:**
  - 실시간 웹캠 영상 처리
  - 17개 포즈 키포인트 감지
  - Canvas 렌더링 (초록색 뼈대 + 신뢰도별 색상 점)
  - 포즈 상태 패널 (카메라/모델/감지 상태)
- **백업 위치:** `test_movenet` 폴더 ✅
- **React 구조:**
  - src/components/Photobooth.jsx (메인 컴포넌트)
  - src/hooks/useMediaPipe.js (포즈 감지 훅)
  - public/index.html (CDN 스크립트)

### Option 2: MediaPipe 양손 감지 ✅ 완료
- **상태:** 완전 구현 및 테스트 완료
- **기술:** Vanilla JS + TensorFlow.js MoveNet + MediaPipe HandLandmarker
- **파일:** `public/option2.html` (단일 HTML 파일)
- **구현된 기능:**
  1. ✅ React 제거 → Vanilla JS로 간결화
  2. ✅ 포즈 감지 (초록색 뼈대)
  3. ✅ 양손 감지 (청록색 뼈대)
  4. ✅ 양손 동시 감지 (numHands: 2 설정)
  5. ✅ 포즈 딜레이 효과 (15프레임 = ~250ms)
     - 스틱맨이 사용자의 움직임을 따라하는 느낌
     - 프레임 히스토리 버퍼 구현
  6. ✅ 캐릭터 코드 제거 - **뼈대만 표시**
     - 초록색 선 (포즈 뼈대)
     - 신뢰도별 색상 점 (빨강/주황/노랑)
     - 청록색 손가락 뼈대
  7. ✅ 상태 정보 패널 (카메라/모델/감지 상태)
  8. ✅ FPS 모니터링
- **백업 위치:**
  - `test_option2/` - 초기 버전
  - `test_option2/option2_final.html` - 최종 버전 ✅

---

## 기술 스택

| 요소 | 기술 |
|------|------|
| 포즈 감지 | TensorFlow.js MoveNet |
| 손 감지 | MediaPipe HandLandmarker |
| 렌더링 | HTML5 Canvas |
| 프론트엔드 | React 18 또는 Vanilla JS |
| 배포 | CDN 기반 (번들 최소화) |

---

## 알려진 이슈 & 해결책

| 이슈 | 상태 | 해결책 |
|------|------|--------|
| 양손 동시 감지 불완전 | 🔧 수정 중 | 콘솔 로그 추가해 양손 감지 확인 중 |
| MediaPipe WASM 로드 실패 | ✅ 해결 | CDN URL 명시적 지정 |
| 좌우 반전 좌표 불일치 | ✅ 개선 | 정규화 좌표 검증 추가 |

---

## 완료된 마일스톤

✅ **2025-05-20: Option 2 완전 완성**
- 양손 감지 구현
- 포즈 딜레이 효과 추가
- 캐릭터 제거 및 뼈대만 표시

## 다음 단계

### 계획 중인 개선사항 (우선순위별)

### 계획 중인 기능 (우선순위 중간)
- [ ] 4-photo grid 레이아웃
- [ ] 스티커/이모지 오버레이
- [ ] 표정/감정 필터
- [ ] 사진 저장/내보내기

---

## 사용자 선호도

- **효율성 최우선:** "토큰 낭비없이 효율적으로" → Vanilla JS 선택, 최소 번들
- **단계적 개발:** 동작하는 버전 먼저 백업 후 새 기능 시도
- **명확한 피드백:** 구체적인 동작 설명 (예: "손1/손2", "21/21 랜드마크")
- **브라우저 직접 테스트 선호:** React 서버 대신 HTML 파일로 직접 열기

---

**마지막 업데이트:** 2025-05-20 (Option 2 양손 감지 수정)
