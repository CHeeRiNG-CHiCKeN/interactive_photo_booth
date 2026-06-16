import './App.css'
import * as THREE from 'three'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Environment } from '@react-three/drei'
import { Suspense, useRef, useState, useMemo } from 'react'
import { useAvatarBones } from './Avatar/AvatarLoader'
import { applyPoseToBones, applyHandToBones } from './Avatar/BoneMapper'
import Webcam from './components/Webcam'
import { useMotionTracker } from './hooks/useMotionTracker'

// MediaPipe 2D 정규화 좌표 → Three.js z=0 평면 월드 좌표
// 비디오가 CSS scaleX(-1) 미러이므로 ndcX를 반전
function useLandmarkToWorld() {
  const { camera } = useThree()
  const raycaster = useMemo(() => new THREE.Raycaster(), [])
  const plane     = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), [])

  return function toWorld(mp2d) {
    const ndcX = 1 - 2 * mp2d.x   // 미러 반전 후 NDC
    const ndcY = 1 - 2 * mp2d.y   // 이미지 y → NDC y
    raycaster.setFromCamera({ x: ndcX, y: ndcY }, camera)
    const hit = new THREE.Vector3()
    raycaster.ray.intersectPlane(plane, hit)
    return hit
  }
}

function Avatar({ landmarksRef }) {
  const { scene, bones } = useAvatarBones('/models/Anna.glb')
  const groupRef = useRef()
  const toWorld  = useLandmarkToWorld()

  useFrame(() => {
    const lm = landmarksRef.current
    applyPoseToBones(lm?.worldPose ?? null, bones.current)
    applyHandToBones(lm?.hands ?? null, lm?.pose ?? null, bones.current)

    const g = groupRef.current
    if (!g) return

    // ── 사용자 어깨 위치에 Anna 정렬 ─────────────────────────
    // MediaPipe 2D 어깨 → z=0 평면 월드 좌표
    const pose2d = lm?.pose
    if (pose2d) {
      const rSho = pose2d[12]   // RIGHT_SHOULDER
      const lSho = pose2d[11]   // LEFT_SHOULDER
      if ((rSho?.visibility ?? 0) > 0.3 && (lSho?.visibility ?? 0) > 0.3) {
        const rW = toWorld(rSho)
        const lW = toWorld(lSho)

        const midX = (rW.x + lW.x) * 0.5
        const midY = (rW.y + lW.y) * 0.5
        const userShoulderWidth = rW.distanceTo(lW)

        // Anna scale=1 기준 어깨 너비 / 루트→어깨 높이 (튜닝값)
        const ANNA_SHO_W = 0.38
        const ANNA_SHO_Y = 1.07

        const s = Math.max(0.5, Math.min(4.0, userShoulderWidth / ANNA_SHO_W))
        g.scale.setScalar(s)
        // 사용자 오른쪽 어깨 바깥에 나란히 배치
        // rW.x = 사용자 오른쪽 어깨 월드 x (미러 기준 오른쪽 = 양수)
        g.position.x = rW.x + userShoulderWidth * 0.7
        g.position.y = midY - ANNA_SHO_Y * s
        g.position.z = 0
        return
      }
    }
    // 포즈 미감지 시 기본값 (이전과 동일)
    g.scale.setScalar(1.5)
    g.position.set(0, -0.8, 0)
  })

  return (
    <group ref={groupRef}>
      <primitive object={scene} />
    </group>
  )
}

// Three.js 캔버스 안에서 캡처 신호를 감지해 PNG 합성 저장
function CaptureHelper({ webcamRef, captureSignalRef }) {
  const { gl } = useThree()

  useFrame(() => {
    if (!captureSignalRef.current) return
    captureSignalRef.current = false

    const video = webcamRef.current?.getVideo()
    const threeCanvas = gl.domElement
    if (!video || !threeCanvas) return

    const canvasW = threeCanvas.width
    const canvasH = threeCanvas.height

    const off = document.createElement('canvas')
    off.width  = canvasW
    off.height = canvasH
    const ctx = off.getContext('2d')

    const vW = video.videoWidth  || 1280
    const vH = video.videoHeight || 720
    const scale = Math.max(canvasW / vW, canvasH / vH)
    const dW = vW * scale
    const dH = vH * scale
    const dx = (canvasW - dW) / 2
    const dy = (canvasH - dH) / 2
    ctx.save()
    ctx.scale(-1, 1)
    ctx.drawImage(video, -dx - dW, dy, dW, dH)
    ctx.restore()

    ctx.drawImage(threeCanvas, 0, 0)

    const a = document.createElement('a')
    a.download = `photobooth_${Date.now()}.png`
    a.href = off.toDataURL('image/png')
    a.click()
  })

  return null
}

const STATUS_LABEL = {
  loading:   '⏳ MediaPipe 로딩 중...',
  ready:     '✅ 준비 완료 - 화면 앞에 서주세요',
  detecting: '🟢 포즈 감지 중',
  error:     '❌ MediaPipe 초기화 실패',
}

export default function App() {
  const webcamRef       = useRef(null)
  const captureSignalRef = useRef(false)
  const [flash, setFlash] = useState(false)
  const { landmarksRef, status } = useMotionTracker(webcamRef)

  function handleCapture() {
    setFlash(true)
    setTimeout(() => setFlash(false), 300)
    captureSignalRef.current = true
  }

  return (
    <div className="stage">
      <div className="webcam-bg">
        <Webcam ref={webcamRef} width={1280} height={720} />
      </div>

      {flash && <div className="capture-flash" />}

      <div className="avatar-overlay">
        <Canvas
          camera={{ position: [0, 0.8, 4], fov: 55 }}
          gl={{ alpha: true, preserveDrawingBuffer: true }}
          style={{ background: 'transparent' }}
        >
          <ambientLight intensity={1.5} />
          <directionalLight position={[2, 4, 2]} intensity={1} />
          <Suspense fallback={null}>
            <Avatar landmarksRef={landmarksRef} />
            <Environment preset="studio" />
          </Suspense>
          <CaptureHelper webcamRef={webcamRef} captureSignalRef={captureSignalRef} />
        </Canvas>
      </div>

      <button className="capture-btn" onClick={handleCapture} title="사진 찍기">
        <span className="capture-btn-inner" />
      </button>

      <div className="status-bar">
        {STATUS_LABEL[status] ?? status}
      </div>
    </div>
  )
}
