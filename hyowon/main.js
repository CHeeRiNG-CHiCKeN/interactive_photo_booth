/* ============================================================
   AI Photoism — main.js
   화면 전환 / 상태 관리 / 웹캠 / 타이머 / 촬영 로직
   ============================================================ */

/* ── 전역 상태 ─────────────────────────────────────────────── */
const state = {
  currentScreen: 'start',
  selectedCharacter: null,      // 'robot' | 'bear' | 'cat' | 'alien'
  currentMode: 'character',     // 'character' | 'decoration'
  currentDecoTab: 'draw',       // 'draw' | 'sticker'
  shotCount: 0,                 // 0~4
  capturedPhotos: [],           // DataURL 배열 (최대 4개)
  isTimerRunning: false,
  timerInterval: null,
  drawColor: '#38bdf8',
  selectedSticker: null,
  stream: null,                 // MediaStream
};

/* ── DOM 참조 ─────────────────────────────────────────────── */
const $ = (id) => document.getElementById(id);

const screens = {
  start:            $('screen-start'),
  characterSelect:  $('screen-character-select'),
  loading:          $('screen-loading'),
  studio:           $('screen-studio'),
  rendering:        $('screen-rendering'),
  result:           $('screen-result'),
};

/* ── 화면 전환 ────────────────────────────────────────────── */
function goTo(screenKey) {
  Object.values(screens).forEach(el => el.classList.remove('active'));
  screens[screenKey].classList.add('active');
  state.currentScreen = screenKey;
}

/* ── SCREEN 1 → 2: START 버튼 ───────────────────────────── */
$('btn-start').addEventListener('click', () => {
  goTo('characterSelect');
});

/* ── SCREEN 2: 캐릭터 선택 ──────────────────────────────── */
const characterCards = document.querySelectorAll('.character-card');
const charLabels = {
  female: '👩 Female',
  male:   '👨 Male',
};

characterCards.forEach(card => {
  card.addEventListener('click', () => {
    // 이전 선택 해제
    characterCards.forEach(c => c.classList.remove('selected'));
    // 현재 카드 선택
    card.classList.add('selected');
    state.selectedCharacter = card.dataset.character;
    // 확인 버튼 활성화
    $('btn-confirm-character').disabled = false;
    $('btn-confirm-character').classList.remove('bg-gray-200', 'text-gray-400', 'cursor-not-allowed');
    $('btn-confirm-character').classList.add('bg-black', 'text-white');
  });
});

$('btn-confirm-character').addEventListener('click', () => {
  if (!state.selectedCharacter) return;
  // 스튜디오 상단 캐릭터 레이블 업데이트
  $('selected-char-label').textContent = charLabels[state.selectedCharacter];
  // 로딩 화면 → 웹캠 초기화 후 스튜디오로
  goTo('loading');
  initWebcam();
});

/* ── SCREEN 3 → 4: 웹캠 초기화 ─────────────────────────── */
async function initWebcam() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 960 } },
      audio: false,
    });
    state.stream = stream;
    const video = $('webcam-video');
    video.srcObject = stream;
    video.onloadedmetadata = () => {
      video.play();
      // 웹캠 로딩 오버레이 숨기기
      $('webcam-loading').style.display = 'none';
      // 로딩 화면 최소 1초 유지 후 스튜디오로
      setTimeout(() => {
        goTo('studio');
        updateShotUI();
      }, 1000);
    };
  } catch (err) {
    console.error('웹캠 접근 실패:', err);
    alert('카메라 권한을 허용해주세요.\n설정에서 카메라 접근을 허용한 뒤 새로고침 해주세요.');
    goTo('characterSelect');
  }
}

/* ── SCREEN 4: 모드 토글 ────────────────────────────────── */
$('btn-mode-char').addEventListener('click', () => setMode('character'));
$('btn-mode-deco').addEventListener('click', () => setMode('decoration'));

function setMode(mode) {
  state.currentMode = mode;

  const charBtn = $('btn-mode-char');
  const decoBtn = $('btn-mode-deco');
  const charUI  = $('char-mode-ui');
  const decoUI  = $('deco-mode-ui');

  if (mode === 'character') {
    charBtn.classList.add('active');
    decoBtn.classList.remove('active');
    charUI.classList.remove('hidden');
    decoUI.classList.add('hidden');
  } else {
    decoBtn.classList.add('active');
    charBtn.classList.remove('active');
    decoUI.classList.remove('hidden');
    charUI.classList.add('hidden');
    // 처음 진입 시 draw 탭 기본 활성화
    setDecoTab(state.currentDecoTab);
  }
}

/* ── SCREEN 4: 꾸미기 탭 전환 ──────────────────────────── */
document.querySelectorAll('.deco-tab').forEach(tab => {
  tab.addEventListener('click', () => setDecoTab(tab.dataset.tab));
});

function setDecoTab(tab) {
  state.currentDecoTab = tab;
  document.querySelectorAll('.deco-tab').forEach(t => t.classList.remove('active'));
  document.querySelector(`.deco-tab[data-tab="${tab}"]`).classList.add('active');

  if (tab === 'draw') {
    $('draw-tools').classList.remove('hidden');
    $('sticker-tools').classList.add('hidden');
  } else {
    $('sticker-tools').classList.remove('hidden');
    $('draw-tools').classList.add('hidden');
  }
}

/* ── SCREEN 4: 색상 선택 ────────────────────────────────── */
document.querySelectorAll('.color-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    state.drawColor = btn.dataset.color;
    // 선택 링 표시
    document.querySelectorAll('.color-btn').forEach(b => {
      b.style.outline = 'none';
    });
    btn.style.outline = `2px solid ${btn.dataset.color}`;
    btn.style.outlineOffset = '3px';
  });
});

/* ── SCREEN 4: 스티커 선택 ──────────────────────────────── */
document.querySelectorAll('.sticker-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    state.selectedSticker = btn.dataset.sticker;
    document.querySelectorAll('.sticker-btn').forEach(b => b.style.opacity = '0.4');
    btn.style.opacity = '1';
  });
});

/* ── SCREEN 4: 드로잉 초기화 버튼 ──────────────────────── */
$('btn-clear-draw').addEventListener('click', () => {
  const canvas = $('draw-canvas');
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
});

/* ── SCREEN 4: 촬영 카운터 UI 업데이트 ─────────────────── */
function updateShotUI() {
  const count = state.shotCount;
  // 카운터 텍스트
  $('shot-counter').textContent = `${count + 1} / 4`;
  // 점 상태 업데이트
  document.querySelectorAll('.shot-dot').forEach((dot, i) => {
    dot.classList.remove('taken', 'current');
    if (i < count) dot.classList.add('taken');
    else if (i === count) dot.classList.add('current');
  });
  // 4장 완료 시 인쇄 버튼 활성화
  if (count >= 4) {
    const printBtn = $('btn-print');
    printBtn.disabled = false;
    printBtn.classList.remove('border-gray-200', 'text-gray-300', 'cursor-not-allowed');
    printBtn.classList.add('border-black', 'text-black', 'hover:bg-black', 'hover:text-white');
    // 촬영 버튼 비활성화
    $('btn-capture').disabled = true;
    $('btn-capture').textContent = '촬영 완료 ✓';
    $('btn-capture').classList.add('opacity-50', 'cursor-not-allowed');
  }
}

/* ── SCREEN 4: 10초 타이머 + 촬영 ─────────────────────── */
$('btn-capture').addEventListener('click', () => {
  if (state.isTimerRunning || state.shotCount >= 4) return;
  startTimer();
});

function startTimer() {
  state.isTimerRunning = true;
  $('btn-capture').disabled = true;
  $('btn-capture').textContent = '타이머 작동 중...';

  const overlay  = $('timer-overlay');
  const countEl  = $('timer-count');
  const bar      = $('timer-progress');
  const FULL     = 263.9; // SVG 원 둘레 (2π × 42)
  let remaining  = 10;

  overlay.classList.remove('hidden');
  countEl.textContent = remaining;
  bar.style.strokeDashoffset = 0;

  state.timerInterval = setInterval(() => {
    remaining--;
    countEl.textContent = remaining;
    // 원형 바 줄이기
    const progress = (10 - remaining) / 10;
    bar.style.strokeDashoffset = FULL * progress;

    if (remaining <= 0) {
      clearInterval(state.timerInterval);
      overlay.classList.add('hidden');
      capturePhoto();
    }
  }, 1000);
}

/* ── 실제 사진 캡처 ──────────────────────────────────────── */
function capturePhoto() {
  const video  = $('webcam-video');
  const flash  = $('capture-flash');

  // 플래시 효과
  flash.classList.add('flash');
  flash.addEventListener('animationend', () => flash.classList.remove('flash'), { once: true });

  // 캔버스에 현재 프레임 그리기
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width  = video.videoWidth  || 640;
  tempCanvas.height = video.videoHeight || 480;
  const ctx = tempCanvas.getContext('2d');

  // 좌우 반전 (셀카 느낌)
  ctx.save();
  ctx.scale(-1, 1);
  ctx.drawImage(video, -tempCanvas.width, 0, tempCanvas.width, tempCanvas.height);
  ctx.restore();

  // 드로잉 캔버스 합성 (꾸미기 모드일 경우)
  const drawCanvas = $('draw-canvas');
  if (drawCanvas.width > 0) {
    ctx.drawImage(drawCanvas, 0, 0, tempCanvas.width, tempCanvas.height);
  }

  const dataURL = tempCanvas.toDataURL('image/jpeg', 0.92);
  state.capturedPhotos.push(dataURL);
  state.shotCount++;

  // 타이머 상태 초기화
  state.isTimerRunning = false;
  $('btn-capture').disabled = false;
  $('btn-capture').textContent = '📸 촬영하기 (10초 타이머)';

  // 카운터 UI 업데이트
  updateShotUI();

  // 썸네일 미리보기 (선택 사항 — 나중에 하단에 추가 가능)
  console.log(`📸 ${state.shotCount}번째 사진 촬영 완료`);
}

/* ── SCREEN 4 → 5: 인쇄하기 버튼 ──────────────────────── */
$('btn-print').addEventListener('click', () => {
  if (state.shotCount < 4) return;
  goTo('rendering');
  startRendering();
});

/* ── SCREEN 5: 렌더링 시뮬레이션 → SCREEN 6 ────────────── */
function startRendering() {
  // 2.5초 후 결과 화면으로 (실제 합성 처리 시간 시뮬레이션)
  setTimeout(() => {
    buildResultScreen();
    goTo('result');
  }, 2500);
}

/* ── SCREEN 6: 결과 화면 구성 ───────────────────────────── */
function buildResultScreen() {
  const photos = state.capturedPhotos;
  for (let i = 0; i < 4; i++) {
    const imgEl = $(`result-photo-${i + 1}`);
    if (photos[i]) {
      imgEl.src = photos[i];
      imgEl.classList.remove('hidden');
      imgEl.parentElement.classList.remove('bg-gray-100');
    }
  }
}

/* ── SCREEN 6: 이미지 다운로드 ─────────────────────────── */
$('btn-download-photo').addEventListener('click', () => {
  const composite = buildCompositeImage();
  composite.then(dataURL => {
    const a = document.createElement('a');
    a.href = dataURL;
    a.download = `AI_Photoism_${Date.now()}.jpg`;
    a.click();
  });
});

async function buildCompositeImage() {
  const canvas = $('composite-canvas');
  const PHOTO_W = 400;
  const PHOTO_H = 300; // 4:3 비율
  const GAP     = 8;
  const PADDING = 20;
  const BRAND_H = 32;

  canvas.width  = PADDING * 2 + PHOTO_W * 2 + GAP;
  canvas.height = PADDING * 2 + PHOTO_H * 2 + GAP + BRAND_H;

  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const positions = [
    [PADDING,             PADDING],
    [PADDING + PHOTO_W + GAP, PADDING],
    [PADDING,             PADDING + PHOTO_H + GAP],
    [PADDING + PHOTO_W + GAP, PADDING + PHOTO_H + GAP],
  ];

  for (let i = 0; i < 4; i++) {
    if (!state.capturedPhotos[i]) continue;
    const img = new Image();
    img.src = state.capturedPhotos[i];
    await new Promise(res => { img.onload = res; });
    const [x, y] = positions[i];
    ctx.drawImage(img, x, y, PHOTO_W, PHOTO_H);
  }

  // 브랜드 텍스트
  ctx.fillStyle = '#9ca3af';
  ctx.font = '12px DM Sans, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('AI Photoism', canvas.width / 2, canvas.height - 10);

  return canvas.toDataURL('image/jpeg', 0.95);
}

/* ── SCREEN 6: 릴스 다운로드 (placeholder) ─────────────── */
$('btn-download-reels').addEventListener('click', () => {
  alert('릴스 기능은 준비 중이에요! 🎬');
});

/* ── SCREEN 6 → 1: 다시 촬영 ───────────────────────────── */
$('btn-restart').addEventListener('click', () => {
  // 상태 초기화
  state.selectedCharacter  = null;
  state.currentMode        = 'character';
  state.currentDecoTab     = 'draw';
  state.shotCount          = 0;
  state.capturedPhotos     = [];
  state.isTimerRunning     = false;

  // 웹캠 스트림 종료
  if (state.stream) {
    state.stream.getTracks().forEach(t => t.stop());
    state.stream = null;
  }

  // UI 초기화
  characterCards.forEach(c => c.classList.remove('selected'));
  $('btn-confirm-character').disabled = true;
  $('btn-confirm-character').classList.add('bg-gray-200', 'text-gray-400', 'cursor-not-allowed');
  $('btn-confirm-character').classList.remove('bg-black', 'text-white');

  $('btn-capture').disabled = false;
  $('btn-capture').textContent = '📸 촬영하기 (10초 타이머)';
  $('btn-capture').classList.remove('opacity-50', 'cursor-not-allowed');

  $('btn-print').disabled = true;
  $('btn-print').classList.add('border-gray-200', 'text-gray-300', 'cursor-not-allowed');
  $('btn-print').classList.remove('border-black', 'text-black', 'hover:bg-black', 'hover:text-white');

  $('webcam-loading').style.display = '';

  // 드로잉 캔버스 초기화
  const drawCanvas = $('draw-canvas');
  drawCanvas.getContext('2d').clearRect(0, 0, drawCanvas.width, drawCanvas.height);

  // 시작 화면으로
  goTo('start');
});

/* ── 추천 포즈 / 따라하기 (placeholder) ────────────────── */
$('btn-pose-suggest').addEventListener('click', () => {
  alert('추천 포즈 기능은 준비 중이에요! 🕺');
});
$('btn-pose-follow').addEventListener('click', () => {
  alert('따라하기 기능은 준비 중이에요! 🪞');
});

/* ── 초기 실행 ──────────────────────────────────────────── */
goTo('start');