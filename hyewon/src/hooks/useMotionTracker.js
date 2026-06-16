import { useEffect, useRef, useState } from 'react'
import { FilesetResolver } from '@mediapipe/tasks-vision'
import { createPoseTracker } from '../MediaPipe/PoseTracker'
import { createHandTracker } from '../MediaPipe/HandTracker'

const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm'

export function useMotionTracker(webcamRef) {
  const poseRef = useRef(null)
  const handRef = useRef(null)
  const rafRef = useRef(null)
  const lastTimeRef = useRef(-1)

  // 매 프레임 갱신되는 랜드마크 (ref → 리렌더 없음, 성능 최적화)
  const landmarksRef = useRef({ pose: null, hands: null })

  const [status, setStatus] = useState('loading') // 'loading' | 'ready' | 'detecting'

  // 초기화: WASM + 모델 로드
  useEffect(() => {
    let cancelled = false

    async function init() {
      try {
        setStatus('loading')
        // WASM 모듈 한 번만 로드 후 두 트래커에 공유
        const resolver = await FilesetResolver.forVisionTasks(WASM_URL)
        if (cancelled) return

        const [pose, hand] = await Promise.all([
          createPoseTracker(resolver),
          createHandTracker(resolver),
        ])
        if (cancelled) return

        poseRef.current = pose
        handRef.current = hand
        setStatus('ready')
        console.log('MediaPipe 초기화 완료')
      } catch (err) {
        console.error('MediaPipe 초기화 실패:', err)
        setStatus('error')
      }
    }

    init()
    return () => {
      cancelled = true
    }
  }, [])

  // 감지 루프: 매 프레임 실행
  useEffect(() => {
    if (status !== 'ready' && status !== 'detecting') return

    function detect() {
      const video = webcamRef.current?.getVideo()

      if (!video || video.readyState < 2 || video.currentTime === 0) {
        rafRef.current = requestAnimationFrame(detect)
        return
      }

      const now = performance.now()

      // 같은 타임스탬프로 두 번 호출하면 에러 → 방지
      if (now <= lastTimeRef.current) {
        rafRef.current = requestAnimationFrame(detect)
        return
      }
      lastTimeRef.current = now

      try {
        const poseResult = poseRef.current.detectForVideo(video, now)
        const handResult = handRef.current.detectForVideo(video, now)

        landmarksRef.current = {
          pose: poseResult.landmarks[0] ?? null,         // 33개 포즈 랜드마크
          worldPose: poseResult.worldLandmarks[0] ?? null, // 3D 월드 좌표
          hands: handResult,                              // { landmarks, handedness }
        }

        if (poseResult.landmarks[0] && status !== 'detecting') {
          setStatus('detecting')
        }
      } catch {
        // 개별 프레임 에러는 무시
      }

      rafRef.current = requestAnimationFrame(detect)
    }

    rafRef.current = requestAnimationFrame(detect)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [status, webcamRef])

  return { landmarksRef, status }
}
