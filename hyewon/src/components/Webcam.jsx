import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react'

const Webcam = forwardRef(function Webcam({ width = 1280, height = 720 }, ref) {
  const videoRef = useRef(null)

  useImperativeHandle(ref, () => ({
    getVideo: () => videoRef.current,
  }))

  useEffect(() => {
    let stream = null

    async function startCamera() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width, height, facingMode: 'user' },
          audio: false,
        })
        if (videoRef.current) {
          videoRef.current.srcObject = stream
        }
      } catch (err) {
        console.error('카메라 접근 실패:', err)
      }
    }

    startCamera()

    return () => {
      if (stream) stream.getTracks().forEach((t) => t.stop())
    }
  }, [width, height])

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted
      width={width}
      height={height}
    />
  )
})

export default Webcam
