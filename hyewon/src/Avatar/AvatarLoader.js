import { useGLTF } from '@react-three/drei'
import { useEffect, useRef, useMemo } from 'react'
import { SkeletonUtils } from 'three-stdlib'
import * as THREE from 'three'

// ── 뼈대 연결 맵 (의상/물리 본 건너뜀) ────────────────────────
const BONE_NEXT = {
  'Spine_01SHJnt':       'Spine_02SHJnt',
  'Spine_02SHJnt':       'Spine_03SHJnt',
  'Spine_03SHJnt':       'Spine_TopSHJnt',
  'Spine_TopSHJnt':      'Neck_01SHJnt',
  'l_Arm_ClavicleSHJnt': 'l_Arm_ShoulderSHJnt',
  'l_Arm_ShoulderSHJnt': 'l_Arm_ElbowSHJnt',
  'l_Arm_ElbowSHJnt':    'l_Arm_WristSHJnt',
  'l_Arm_WristSHJnt':    'l_Finger_02_01SHJnt',
  'r_Arm_ClavicleSHJnt': 'r_Arm_ShoulderSHJnt',
  'r_Arm_ShoulderSHJnt': 'r_Arm_ElbowSHJnt',
  'r_Arm_ElbowSHJnt':    'r_Arm_WristSHJnt',
  'r_Arm_WristSHJnt':    'r_Finger_02_01SHJnt',
  'Neck_01SHJnt':        'Neck_TopSHJnt',
  'l_Leg_HipSHJnt':      'l_Leg_KneeSHJnt',
  'l_Leg_KneeSHJnt':     'l_Leg_AnkleSHJnt',
  'r_Leg_HipSHJnt':      'r_Leg_KneeSHJnt',
  'r_Leg_KneeSHJnt':     'r_Leg_AnkleSHJnt',
  // 손가락 (l: 왼손, r: 오른손)
  'l_Thumb_01_01SHJnt':   'l_Thumb_01_02SHJnt',
  'l_Thumb_01_02SHJnt':   'l_Thumb_01_03SHJnt',
  'l_Finger_01_01SHJnt':  'l_Finger_01_02SHJnt',
  'l_Finger_01_02SHJnt':  'l_Finger_01_03SHJnt',
  'l_Finger_02_01SHJnt':  'l_Finger_02_02SHJnt',
  'l_Finger_02_02SHJnt':  'l_Finger_02_03SHJnt',
  'l_Finger_03_01SHJnt':  'l_Finger_03_02SHJnt',
  'l_Finger_03_02SHJnt':  'l_Finger_03_03SHJnt',
  'r_Thumb_01_01SHJnt':   'r_Thumb_01_02SHJnt',
  'r_Thumb_01_02SHJnt':   'r_Thumb_01_03SHJnt',
  'r_Finger_01_01SHJnt':  'r_Finger_01_02SHJnt',
  'r_Finger_01_02SHJnt':  'r_Finger_01_03SHJnt',
  'r_Finger_02_01SHJnt':  'r_Finger_02_02SHJnt',
  'r_Finger_02_02SHJnt':  'r_Finger_02_03SHJnt',
  'r_Finger_03_01SHJnt':  'r_Finger_03_02SHJnt',
  'r_Finger_03_02SHJnt':  'r_Finger_03_03SHJnt',
}

export function useAvatarBones(path) {
  // ① 원본 캐시 오염 방지: 매 마운트마다 독립 복사본 사용
  const { scene: origScene } = useGLTF(path)
  const scene = useMemo(() => SkeletonUtils.clone(origScene), [origScene])

  const bonesRef = useRef({})

  useEffect(() => {
    // ② GLB 축 보정: Blender Z-up export 문제 수정
    //    Armature +90°X / Root Bone -90°X → 납작하게 누워있는 상태
    //    보정: -90°X 만으로 세우기 완료 (l→r=-X → 카메라 정면 확인)
    scene.rotation.set(-Math.PI / 2, 0, 0)
    scene.updateMatrixWorld(true)

    // ③ 본 수집
    const bones = {}
    scene.traverse((obj) => {
      if (obj.isBone) bones[obj.name] = obj
    })
    if (Object.keys(bones).length === 0) {
      scene.traverse((obj) => {
        if (obj.isSkinnedMesh) {
          obj.skeleton.bones.forEach((b) => { bones[b.name] = b })
        }
      })
    }

    // ④ 각 본의 rest 데이터 저장 (부모 먼저 처리되도록 traverse 순서 유지)
    scene.traverse((obj) => {
      if (!obj.isBone && !bones[obj.name]) return
      const bone = bones[obj.name]
      if (!bone) return

      // 로컬 rest 쿼터니언
      bone.userData.restLocalQuat = bone.quaternion.clone()

      // 월드 rest 쿼터니언
      const worldQ = new THREE.Quaternion()
      bone.getWorldQuaternion(worldQ)
      bone.userData.restWorldQuat = worldQ.clone()

      // 본이 가리키는 방향 (보정된 월드 공간)
      const nextName = BONE_NEXT[bone.name]
      const nextBone = nextName ? bones[nextName] : null

      const bPos = new THREE.Vector3()
      bone.getWorldPosition(bPos)

      if (nextBone) {
        const cPos = new THREE.Vector3()
        nextBone.getWorldPosition(cPos)
        bone.userData.restWorldDir = cPos.clone().sub(bPos).normalize()
      } else {
        bone.userData.restWorldDir = new THREE.Vector3(0, 1, 0)
      }

      // 부모 로컬 공간에서의 rest 방향 (런타임 계산 가속)
      if (bone.parent?.userData?.restWorldQuat) {
        bone.userData.restLocalDir = bone.userData.restWorldDir.clone()
          .applyQuaternion(bone.parent.userData.restWorldQuat.clone().invert())
          .normalize()
      } else {
        bone.userData.restLocalDir = bone.userData.restWorldDir.clone()
      }
    })

    // ⑤ 손목 본의 rest 손바닥 normal 계산
    //    검지(Finger_01)·약지+새끼(Finger_03) 본의 실제 rest 월드 위치로
    //    팔(cross product)을 구해 "이 리그의 진짜 손바닥이 향하는 방향"을 얻음
    //    → BoneMapper에서 손 랜드마크의 동일한 cross product와 비교해
    //      손목 roll(손바닥이 향하는 방향)을 정확히 따라가게 함
    const WRIST_NORMAL_REF = {
      'l_Arm_WristSHJnt': ['l_Finger_01_01SHJnt', 'l_Finger_03_01SHJnt'],
      'r_Arm_WristSHJnt': ['r_Finger_01_01SHJnt', 'r_Finger_03_01SHJnt'],
    }
    for (const [wristName, [idxName, pinkyName]] of Object.entries(WRIST_NORMAL_REF)) {
      const wristBone = bones[wristName]
      const idxBone   = bones[idxName]
      const pinkyBone = bones[pinkyName]
      if (!wristBone || !idxBone || !pinkyBone) continue

      const wp = new THREE.Vector3(); wristBone.getWorldPosition(wp)
      const ip = new THREE.Vector3(); idxBone.getWorldPosition(ip)
      const pp = new THREE.Vector3(); pinkyBone.getWorldPosition(pp)

      const restWorldNormal = new THREE.Vector3()
        .crossVectors(ip.clone().sub(wp), pp.clone().sub(wp))
        .normalize()
      wristBone.userData.restWorldNormal = restWorldNormal

      if (wristBone.parent?.userData?.restWorldQuat) {
        wristBone.userData.restLocalNormal = restWorldNormal.clone()
          .applyQuaternion(wristBone.parent.userData.restWorldQuat.clone().invert())
          .normalize()
      } else {
        wristBone.userData.restLocalNormal = restWorldNormal.clone()
      }
    }

    bonesRef.current = bones

    // ⑥ 보정 후 척추 Up 벡터 확인 (정상이면 [0, ~1, 0])
    const sp1 = bones['Spine_01SHJnt']
    const spT = bones['Spine_TopSHJnt']
    if (sp1 && spT) {
      const p1 = new THREE.Vector3(); sp1.getWorldPosition(p1)
      const p2 = new THREE.Vector3(); spT.getWorldPosition(p2)
      const up = p2.clone().sub(p1).normalize()
      console.log('AvatarLoader 보정 후 척추 Up 벡터:', [+up.x.toFixed(3), +up.y.toFixed(3), +up.z.toFixed(3)])
      console.log('→ Y가 ~+1에 가까우면 보정 성공')
    }

    // 의상 메시 렌더 순서 보정:
    // transparent:true + depthWrite:false → 투명 패스에서 피부 위에 그려지는 문제
    // 의상을 alphaTest 방식(불투명 패스)으로 전환 → 피부와 올바른 depth 경쟁
    const SKIN = 'annaF2_travel_4'
    const EYES = 'annaF2_travel_eyelashes'
    scene.traverse(obj => {
      if (!(obj.isMesh || obj.isSkinnedMesh) || !obj.material) return
      if (obj.name === SKIN || obj.name === EYES) return
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
      mats.forEach(m => {
        m.transparent  = false
        m.alphaTest    = 0.08
        m.depthWrite   = true
        m.needsUpdate  = true
      })
    })
    console.log('AvatarLoader: 본 초기화 완료', Object.keys(bones).length, '개')
  }, [scene])

  return { scene, bones: bonesRef }
}
