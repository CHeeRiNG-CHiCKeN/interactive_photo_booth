/**
 * DiagMode.jsx  v2
 * – Armature +90°X / Root Bone -90°X 문제 확인 + 보정 테스트
 */
import { useEffect, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { useGLTF, OrbitControls } from '@react-three/drei'
import * as THREE from 'three'

const v3 = (v) => `[${v.x.toFixed(3)}, ${v.y.toFixed(3)}, ${v.z.toFixed(3)}]`
const deg = (r) => `${(r * 180 / Math.PI).toFixed(1)}°`

// 수정 프리셋 목록
const CORRECTIONS = [
  { label: '⓪ 보정 없음 (원본)',          rot: [0, 0, 0] },
  { label: '① Y +180° (뒤집기)',          rot: [0, Math.PI, 0] },
  { label: '② X -90° (눕힌 거 세우기)',  rot: [-Math.PI / 2, 0, 0] },
  { label: '③ X -90° + Y +180°',         rot: [-Math.PI / 2, Math.PI, 0] },
  { label: '④ X +90° (반대로 세우기)',   rot: [Math.PI / 2, 0, 0] },
  { label: '⑤ X +90° + Y +180°',        rot: [Math.PI / 2, Math.PI, 0] },
]

function ModelDiag({ correctionRot }) {
  const { scene } = useGLTF('/models/Anna.glb')

  useEffect(() => {
    scene.updateMatrixWorld(true)

    // 모든 본 수집
    const allBones = []
    scene.traverse(o => { if (o.isBone) allBones.push(o) })
    if (allBones.length === 0) {
      scene.traverse(o => {
        if (o.isSkinnedMesh) o.skeleton?.bones?.forEach(b => allBones.push(b))
      })
    }

    const boneMap = {}
    allBones.forEach(b => { boneMap[b.name] = b })

    // ── A. Armature 회전 ─────────────────────────────────
    const arm = scene.getObjectByName('Armature')
    console.log('━━━ [A] Armature ━━━')
    if (arm) {
      console.log('  rotation (deg):', deg(arm.rotation.x), deg(arm.rotation.y), deg(arm.rotation.z))
      console.log('  quaternion    :', arm.quaternion.toArray().map(v => +v.toFixed(4)).join(', '))
    } else {
      console.log('  Armature 오브젝트 없음')
    }

    // ── B. Root Bone ─────────────────────────────────────
    const rootBones = allBones.filter(b => !b.parent?.isBone)
    console.log('━━━ [B] Root Bones ━━━')
    rootBones.forEach(rb => {
      const wp = new THREE.Vector3()
      const wq = new THREE.Quaternion()
      rb.getWorldPosition(wp)
      rb.getWorldQuaternion(wq)
      console.log(`  "${rb.name}"`)
      console.log('  localRot (deg):', deg(rb.rotation.x), deg(rb.rotation.y), deg(rb.rotation.z))
      console.log('  worldPos      :', v3(wp))
      console.log('  worldQuat     :', wq.toArray().map(v => +v.toFixed(4)).join(', '))
    })

    // ── C. 척추 Up 벡터 ──────────────────────────────────
    console.log('━━━ [C] 척추 Up 벡터 ━━━')
    const spines = allBones.filter(b => b.name.toLowerCase().includes('spine'))
    if (spines.length >= 2) {
      const bot = spines[0]
      const top = spines[spines.length - 1]
      const bp = new THREE.Vector3(); bot.getWorldPosition(bp)
      const tp = new THREE.Vector3(); top.getWorldPosition(tp)
      const up = tp.clone().sub(bp).normalize()
      console.log(`  ${bot.name} → ${top.name}`)
      console.log('  Up 벡터:', v3(up))
      console.log('  → +Y에 가까우면 정상 서있는 상태')
      console.log('  → +Z에 가까우면 카메라 쪽으로 누워있는 상태')
      console.log('  → -Y이면 거꾸로 뒤집힌 상태')
    }

    // ── D. 어깨 Right 벡터 (어느 방향을 보는지) ──────────
    console.log('━━━ [D] 어깨 벡터 ━━━')
    const lSho = allBones.find(b => b.name === 'l_Arm_ShoulderSHJnt')
    const rSho = allBones.find(b => b.name === 'r_Arm_ShoulderSHJnt')
    if (lSho && rSho) {
      const lp = new THREE.Vector3(); lSho.getWorldPosition(lp)
      const rp = new THREE.Vector3(); rSho.getWorldPosition(rp)
      const right = rp.clone().sub(lp).normalize()
      console.log('  l_Shoulder → r_Shoulder Right 벡터:', v3(right))
      console.log('  → +X에 가까우면: Anna가 카메라 반대(뒤)를 보고 있음')
      console.log('  → -X에 가까우면: Anna가 카메라(정면)를 보고 있음')
    }

    // ── E. 얼굴 Forward 벡터 (Neck → Head) ─────────────
    console.log('━━━ [E] 얼굴 Forward 벡터 ━━━')
    const neck = allBones.find(b => b.name === 'Neck_01SHJnt' || b.name.toLowerCase().includes('neck'))
    const head = allBones.find(b => b.name.toLowerCase() === 'head' || b.name.includes('Neck_Top'))
    if (neck && head) {
      const np = new THREE.Vector3(); neck.getWorldPosition(np)
      const hp = new THREE.Vector3(); head.getWorldPosition(hp)
      // neck→head는 위 방향이므로, 얼굴 방향은 neck의 local forward
      const nq = new THREE.Quaternion(); neck.getWorldQuaternion(nq)
      const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(nq)
      console.log(`  Neck(${neck.name}) world forward:`, v3(fwd))
      console.log('  → +Z이면 카메라 정면을 봄, -Z이면 뒤를 봄')
    }

    // ── F. 주요 본 Y 위치 (누구는 위에 있어야 하나) ──────
    console.log('━━━ [F] 주요 본 월드 Y 위치 ━━━')
    const keyBones = ['RL_BoneRoot', 'Spine_01SHJnt', 'Spine_TopSHJnt', 'l_Arm_ShoulderSHJnt', 'Neck_01SHJnt']
    keyBones.forEach(name => {
      const b = boneMap[name]
      if (!b) return
      const p = new THREE.Vector3(); b.getWorldPosition(p)
      console.log(`  ${name}: Y=${p.y.toFixed(3)} (높을수록 위에 있어야 정상)`)
    })

    console.log('━━━ [결론] ━━━')
    console.log('화면에서 버튼 ①~⑤ 눌러가며 Anna가 정면으로 서는 번호를 찾으세요')

  }, [scene])

  const [rx, ry, rz] = correctionRot
  return (
    <group rotation={[rx, ry, rz]}>
      <primitive object={scene} />
    </group>
  )
}

export default function DiagMode() {
  const [corrIdx, setCorrIdx] = useState(0)

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#111' }}>
      {/* 버튼 패널 */}
      <div style={{
        position: 'absolute', top: 12, left: 12, zIndex: 10,
        fontFamily: 'monospace', fontSize: 13, color: '#fff',
        background: 'rgba(0,0,0,0.8)', padding: '12px 16px', borderRadius: 8,
        display: 'flex', flexDirection: 'column', gap: 6,
      }}>
        <b style={{ color: '#f7c948' }}>회전 보정 테스트</b>
        <small style={{ color: '#aaa', marginBottom: 4 }}>콘솔(F12) [C][D] 항목도 확인하세요</small>
        {CORRECTIONS.map((c, i) => (
          <button key={i} onClick={() => setCorrIdx(i)} style={{
            background: corrIdx === i ? '#4fc3f7' : '#333',
            color: corrIdx === i ? '#000' : '#fff',
            border: 'none', borderRadius: 4, padding: '5px 10px',
            cursor: 'pointer', textAlign: 'left', fontSize: 13,
          }}>
            {c.label}
          </button>
        ))}
        <hr style={{ borderColor: '#444', margin: '4px 0' }} />
        <small style={{ color: '#aaa' }}>마우스: 회전 | 스크롤: 줌<br />OrbitControls 활성</small>
      </div>

      <Canvas camera={{ position: [0, 1.5, 4], fov: 60 }}>
        <ambientLight intensity={1.2} />
        <directionalLight position={[3, 5, 3]} intensity={1} />
        <directionalLight position={[-3, 2, -3]} intensity={0.4} />
        <gridHelper args={[6, 6, '#444', '#333']} />
        <axesHelper args={[1.5]} />   {/* X=빨강, Y=초록(위), Z=파랑(카메라) */}
        <ModelDiag correctionRot={CORRECTIONS[corrIdx].rot} />
        <OrbitControls target={[0, 1, 0]} />
      </Canvas>
    </div>
  )
}
