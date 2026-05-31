# 인터랙티브 포토부스 - 1단계 설정 가이드

## 📋 개요
이것은 MediaPipe를 사용하여 실시간으로 사용자의 동작을 감지하고 스틱맨 캐릭터로 변환하는 포토부스입니다.

## 🚀 빠른 시작 (5분)

### 1. Node.js 확인
```bash
node --version
npm --version
```
(설치 안 되어 있으면 https://nodejs.org/ 에서 설치)

### 2. 프로젝트 디렉토리로 이동
```bash
cd "C:\Users\juhee\Documents\Claude\Projects\고애수플젝_손주희"
```

### 3. 의존성 설치
```bash
npm install
```

### 4. 개발 서버 시작
```bash
npm start
```

브라우저가 자동으로 열리고 http://localhost:3000 에서 앱이 실행됩니다.

## 📦 필요한 라이브러리
- **React**: UI 프레임워크
- **MediaPipe**: AI 포즈 감지 (CDN에서 로드)

## 🎯 현재 기능 (1단계)

✅ **구현된 기능:**
- 웹캠 실시간 입력
- MediaPipe를 사용한 신체 포즈 감지 (33개 포인트)
- Canvas에 스틱맨 캐릭터 렌더링
  - 머리 (원형)
  - 눈, 입 (기본 표정)
  - 팔 (어깨, 팔꿈치, 손목)
  - 몸통
  - 다리 (허리, 무릎, 발목)

## 📂 파일 구조

```
고애수플젝_손주희/
├── src/
│   ├── components/
│   │   └── Photobooth.jsx       # 메인 포토부스 컴포넌트
│   ├── hooks/
│   │   └── useMediaPipe.js      # MediaPipe 초기화 및 감지
│   ├── utils/
│   │   └── StickmanRenderer.js  # Canvas 렌더링 로직
│   ├── styles/
│   │   └── Photobooth.css       # 포토부스 스타일
│   ├── App.jsx                   # 메인 앱 컴포넌트
│   ├── App.css                   # 앱 스타일
│   └── index.js                  # 엔트리 포인트
├── public/
│   └── index.html                # HTML 템플릿
├── package.json                  # 의존성 정의
└── SETUP.md                      # 이 파일
```

## 🔧 기술 스택

| 부분 | 기술 |
|------|------|
| **Frontend** | React |
| **UI 렌더링** | Canvas API |
| **포즈 감지** | MediaPipe (CDN) |
| **통신** | WebRTC (WebCam) |

## ⚙️ 주요 구성 요소 설명

### 1. **StickmanRenderer.js**
- Canvas에 스틱맨을 그리는 클래스
- MediaPipe의 33개 포즈 포인트를 받아서 선과 원으로 렌더링
- `drawStickman()`: 전체 캐릭터 그리기
- `drawLine()`: 관절 연결선 그리기
- `drawCircle()`: 손/발 끝점 그리기
- `drawFace()`: 기본 얼굴 표정 그리기

### 2. **useMediaPipe.js**
- MediaPipe 라이브러리 초기화
- 웹캠 스트림 처리
- 포즈 감지 루프 (비디오 프레임마다 실행)
- 감지된 landmarks를 React 상태로 제공

### 3. **Photobooth.jsx**
- 웹캠과 Canvas를 통합
- useMediaPipe Hook에서 landmarks 받음
- AnimationFrame을 사용하여 Canvas 업데이트
- 상태 정보 표시

## 🎮 사용 방법

1. **앱 실행 후** → 웹캠 접근 허용 요청이 나옵니다 → "허용" 클릭
2. **AI 모델 로딩** → "AI 모델 로딩 중" 메시지 (약 10-30초)
3. **움직이기** → 카메라 앞에서 자유롭게 움직이면 스틱맨이 따라갑니다!

## ⚠️ 주의사항

- **웹캠 필수**: 실시간 입력이 필요합니다
- **브라우저 호환성**: Chrome, Edge, Firefox 권장 (Safari는 제한적)
- **로딩 시간**: 첫 실행 시 MediaPipe 모델 로딩에 10-30초 소요
- **성능**: 저사양 컴퓨터에서는 프레임 드롭 가능

## 🔍 디버깅

### 웹캠이 안 됨
```javascript
// 브라우저 콘솔에서 확인
navigator.mediaDevices.getUserMedia({video: true})
```

### MediaPipe 로딩 실패
- 인터넷 연결 확인
- CDN 접근 가능 확인
- 브라우저 콘솔의 CORS 에러 확인

## 🚀 다음 단계 (2단계 예정)

- [ ] 표정 필터 추가 (행복, 슬픔 등)
- [ ] 스티커/이모지 필터
- [ ] 손 제스처 인식
- [ ] 사진 저장 기능
- [ ] 4칸 배치 출력

## 📝 빌드 & 배포

### 프로덕션 빌드
```bash
npm run build
```
`build/` 디렉토리에 최적화된 파일 생성

### 배포 (Vercel 예시)
```bash
npm install -g vercel
vercel
```

## 💡 팁

- Canvas 크기를 조정하려면 `Photobooth.jsx`의 width/height 수정
- 스틱맨 색상 변경: `StickmanRenderer.js`의 `fillStyle` 수정
- 감지 정확도 개선: MediaPipe 모델을 `full` 버전으로 변경 (더 느림)

## 📞 문제 해결

| 문제 | 해결책 |
|------|--------|
| 스틱맨이 안 움직임 | 웹캠이 밝은 곳에 있는지 확인, 브라우저 재시작 |
| 자주 끊김 | 브라우저 탭 수 줄이기, 다른 무거운 앱 종료 |
| 메모리 누수 | 브라우저 메모리 캐시 정리, 개발자도구에서 확인 |

---

**질문이나 버그 리포트**: 프로젝트 폴더에 issue.md 파일 생성!
