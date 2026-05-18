# Interactive Photo Booth — CLAUDE.md

## 프로젝트 개요
웹캠을 활용한 인터랙티브 포토 부스 웹앱. 실시간 필터 적용, 사진 촬영, 갤러리 저장 기능을 제공한다.

## 기술 스택
| 영역 | 기술 |
|------|------|
| UI 프레임워크 | React 18 + TypeScript |
| 번들러 | Vite |
| 스타일링 | Tailwind CSS v3 (인라인 유틸리티 클래스만 사용) |
| Web API | MediaDevices (getUserMedia), Canvas API, File API |
| 린터/포매터 | ESLint + Prettier |

## 폴더 구조
```
src/
├── components/
│   ├── booth/      # 웹캠 뷰파인더, 촬영 버튼 등 부스 핵심 UI
│   ├── filters/    # 필터 선택 패널 및 Canvas 필터 로직
│   ├── gallery/    # 촬영된 사진 목록, 다운로드 기능
│   └── ui/         # Button, Modal 등 재사용 가능한 공통 컴포넌트
├── sandbox/        # 팀원별 독립 개발 공간 (메인에 영향 없음)
│   ├── member-a/
│   ├── member-b/
│   ├── member-c/
│   ├── member-d/
│   └── member-e/
└── App.tsx
```

## 코딩 규칙

### 스타일링
- **Tailwind CSS만 사용.** 별도 CSS 파일 생성 금지 (단, `src/index.css`의 `@tailwind` 디렉티브는 유지).
- 커스텀 색상/간격이 필요하면 `tailwind.config.ts`의 `theme.extend`에 추가.

### 웹캠 / Web API
- `getUserMedia` 호출은 항상 `try/catch`로 감싸고, 사용자에게 에러 메시지를 표시해야 한다.
- 카메라 스트림은 컴포넌트 언마운트 시 반드시 `track.stop()`으로 해제한다.
- Canvas 조작은 `requestAnimationFrame`을 활용해 렌더링 루프를 관리한다.

### TypeScript
- `any` 사용 금지. 타입을 모를 경우 `unknown`을 사용하고 타입 가드를 작성한다.
- Props 타입은 `interface`로 정의한다.

### 컴포넌트
- 파일 1개 = 컴포넌트 1개 원칙.
- 파일명과 컴포넌트명은 PascalCase.

### sandbox 규칙
- `src/sandbox/` 안의 코드는 실험적 코드다. 메인(`src/components`, `src/App.tsx`)을 직접 수정하지 말 것.
- 완성된 기능은 PR을 통해 `src/components`로 이동한다.
