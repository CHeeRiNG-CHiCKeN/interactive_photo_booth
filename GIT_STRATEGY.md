# Git 협업 전략 (5인 팀)

## 브랜치 전략

```
main
└── develop          ← 통합 브랜치 (PR 대상)
    ├── feature/alice-webcam-capture
    ├── feature/bob-filter-panel
    ├── feature/carol-gallery-view
    ├── feature/dan-sticker-overlay
    └── feature/eve-download-button
```

### 브랜치 규칙
- **절대 `main`에 직접 push하지 않는다.**
- 작업 브랜치 네이밍: `feature/이름-기능명`
  - 예: `feature/alice-webcam`, `feature/bob-grayscale-filter`
- 버그 수정: `fix/이름-버그내용` (예: `fix/carol-camera-leak`)
- 브랜치는 작업 단위로 잘게 나눈다 (한 PR = 한 기능).

### 브랜치 생성 방법
```bash
git switch develop
git pull origin develop
git switch -c feature/이름-기능명
```

---

## 커밋 규칙 (Conventional Commits)

### 형식
```
<타입>(<범위>): <요약>

[본문 — 선택사항]
```

### 타입 목록
| 타입 | 언제 쓰나 |
|------|-----------|
| `feat` | 새로운 기능 추가 |
| `fix` | 버그 수정 |
| `style` | 스타일(Tailwind 클래스) 변경, 기능 변화 없음 |
| `refactor` | 기능 변화 없이 코드 구조 개선 |
| `chore` | 빌드 설정, 의존성 업데이트 등 |
| `docs` | 문서(README, CLAUDE.md 등) 수정 |
| `test` | 테스트 코드 추가/수정 |

### 커밋 예시
```
feat(booth): 웹캠 스트림 컴포넌트 초안 구현
fix(filters): 컴포넌트 언마운트 시 카메라 스트림 누수 수정
style(gallery): 갤러리 그리드 반응형 레이아웃 적용
chore: tailwindcss 3.4 업그레이드
```

---

## PR 규칙

1. **대상 브랜치는 항상 `develop`.**
2. PR 제목은 커밋 형식과 동일하게: `feat(booth): 웹캠 캡처 기능 구현`
3. PR 본문에 다음 항목을 포함한다:
   - **무엇을 했나**: 변경 사항 요약
   - **어떻게 테스트했나**: 로컬 실행 결과 스크린샷 또는 설명
   - **리뷰어에게 요청사항**: 집중적으로 봐줬으면 하는 부분
4. 최소 1명의 팀원 리뷰 후 머지.
5. 머지 후 작업 브랜치는 삭제한다.

---

## 충돌 방지 수칙

- 각자 `src/sandbox/member-본인이름/` 안에서 개발하면 충돌 거의 없음.
- 공통 파일(`App.tsx`, `index.css`, `tailwind.config.ts`)은 수정 전 팀 채널에 공유.
- 매일 작업 시작 전 `git pull origin develop`으로 최신화.
