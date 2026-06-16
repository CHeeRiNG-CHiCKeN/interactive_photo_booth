import * as THREE from 'three'

const IDX = {
  NOSE: 0,
  LEFT_EYE: 2,  RIGHT_EYE: 5,
  LEFT_EAR: 7,  RIGHT_EAR: 8,
  LEFT_SHOULDER:  11, RIGHT_SHOULDER: 12,
  LEFT_ELBOW:     13, RIGHT_ELBOW:    14,
  LEFT_WRIST:     15, RIGHT_WRIST:    16,
  LEFT_HIP:       23, RIGHT_HIP:      24,
  LEFT_KNEE:      25, RIGHT_KNEE:     26,
  LEFT_ANKLE:     27, RIGHT_ANKLE:    28,
}

// MediaPipe HandLandmarker 21개 랜드마크 인덱스
const HLM = {
  WRIST: 0,
  THUMB_CMC: 1, THUMB_MCP: 2, THUMB_IP: 3,  THUMB_TIP: 4,
  IDX_MCP:   5, IDX_PIP:   6, IDX_DIP:  7,  IDX_TIP:   8,
  MID_MCP:   9, MID_PIP:  10, MID_DIP: 11,  MID_TIP:  12,
  RNG_MCP:  13, RNG_PIP:  14, RNG_DIP: 15,  RNG_TIP:  16,
  PNK_MCP:  17, PNK_PIP:  18, PNK_DIP: 19,  PNK_TIP:  20,
}

// MediaPipe world → Three.js world (보정된 씬 기준)
//   X: 카메라 기준 좌우(HandLandmarker와 동일 규약) → 반전 (-p.x)
//      반전 안 하면 팔꿈치-어깨 delta의 안쪽/바깥쪽 부호가 Anna의 본
//      방향(바깥쪽=+X) 규약과 반대로 들어가 팔이 반대로 움직임
//      좌우 어느 쪽 팔이 움직이는지는 bone swap이 별도로 처리하므로
//      이 반전이 좌우 미러를 다시 깨뜨리지 않음
//   Y: 이미지 아래가 + → 위가 + 로 반전 (-p.y)
//   Z: 증폭 없음 — ×3은 팔꿈치가 몸 뒤로 숨게 만들었음
function mp(lm, idx) {
  const p = lm[idx]
  return new THREE.Vector3(-p.x, -p.y, -p.z)
}

// 매 프레임 rest 포즈로 리셋
function resetToRest(bones) {
  for (const bone of Object.values(bones)) {
    if (bone.userData.restLocalQuat) {
      bone.quaternion.copy(bone.userData.restLocalQuat)
      bone.updateMatrix()
    }
  }
}

// 로컬 공간 방식 회전
// - 부모 월드 Q로 worldTargetDir을 부모 로컬 공간으로 변환
// - 사전 계산된 restLocalDir과 비교해 delta 산출
// - restLocalQuat에 delta 적용
function rotateBone(bone, worldTargetDir) {
  if (!bone?.userData?.restLocalDir || !bone?.userData?.restLocalQuat) return

  const parentQ = new THREE.Quaternion()
  if (bone.parent) {
    bone.parent.updateWorldMatrix(true, false)
    bone.parent.getWorldQuaternion(parentQ)
  }

  const invParentQ = parentQ.clone().invert()
  const localTarget = worldTargetDir.clone().normalize().applyQuaternion(invParentQ)
  const localRest   = bone.userData.restLocalDir

  if (localRest.dot(localTarget) >= 0.9999) return

  const deltaQ = new THREE.Quaternion().setFromUnitVectors(localRest, localTarget)
  bone.quaternion.copy(deltaQ.clone().multiply(bone.userData.restLocalQuat))
  bone.updateMatrix()
}

// 방향 + 비틀림(roll) 모두 반영하는 회전
// - worldForward: 본이 가리켜야 할 방향 (기존 rotateBone과 동일 역할)
// - worldNormal:  forward 축 둘레의 비틀림을 결정하는 보조 방향
//                 (손목이면 손바닥이 향하는 방향)
// rest일 때의 (forward, normal) 관계를 그대로 보존한 채
// 새 (forward, normal)로 옮기는 단단한(rigid) 회전을 적용한다
function rotateBoneFull(bone, worldForward, worldNormal) {
  if (!bone?.userData?.restLocalDir || !bone?.userData?.restLocalQuat) return
  if (!bone.userData.restLocalNormal) {
    rotateBone(bone, worldForward)
    return
  }

  const parentQ = new THREE.Quaternion()
  if (bone.parent) {
    bone.parent.updateWorldMatrix(true, false)
    bone.parent.getWorldQuaternion(parentQ)
  }
  const invParentQ = parentQ.clone().invert()

  const tFwd = worldForward.clone().normalize().applyQuaternion(invParentQ)
  const tUp  = worldNormal.clone().applyQuaternion(invParentQ)
  tUp.sub(tFwd.clone().multiplyScalar(tUp.dot(tFwd)))
  if (tUp.lengthSq() < 1e-6) { rotateBone(bone, worldForward); return }
  tUp.normalize()
  const tRight = new THREE.Vector3().crossVectors(tUp, tFwd).normalize()
  tUp.crossVectors(tFwd, tRight).normalize()

  const rFwd = bone.userData.restLocalDir
  const rUp  = bone.userData.restLocalNormal.clone()
  rUp.sub(rFwd.clone().multiplyScalar(rUp.dot(rFwd)))
  if (rUp.lengthSq() < 1e-6) { rotateBone(bone, worldForward); return }
  rUp.normalize()
  const rRight = new THREE.Vector3().crossVectors(rUp, rFwd).normalize()
  rUp.crossVectors(rFwd, rRight).normalize()

  const mRest   = new THREE.Matrix4().makeBasis(rRight, rUp, rFwd)
  const mTarget = new THREE.Matrix4().makeBasis(tRight, tUp, tFwd)
  const qRest   = new THREE.Quaternion().setFromRotationMatrix(mRest)
  const qTarget = new THREE.Quaternion().setFromRotationMatrix(mTarget)

  const deltaQ = qTarget.multiply(qRest.invert())
  bone.quaternion.copy(deltaQ.multiply(bone.userData.restLocalQuat))
  bone.updateMatrix()
}

// 2초마다 한 번 디버그 출력
let _dbgT = 0
function debugLog(bones, lShoulderDir) {
  const now = performance.now()
  if (now - _dbgT < 2000) return
  _dbgT = now
  const b = bones['l_Arm_ShoulderSHJnt']
  if (!b) return
  const wp = new THREE.Vector3()
  b.getWorldPosition(wp)
  console.log('[BoneMapper] l_Arm_Shoulder', {
    worldPos:     [+wp.x.toFixed(2), +wp.y.toFixed(2), +wp.z.toFixed(2)],
    restWorldDir: b.userData.restWorldDir?.toArray().map(v => +v.toFixed(3)),
    restLocalDir: b.userData.restLocalDir?.toArray().map(v => +v.toFixed(3)),
    targetDir:    lShoulderDir?.toArray().map(v => +v.toFixed(3)),
  })
}

export function applyPoseToBones(worldLandmarks, bones) {
  if (!bones || Object.keys(bones).length === 0) return

  resetToRest(bones)

  if (!worldLandmarks) return

  // 랜드마크 추출
  const rSho = mp(worldLandmarks, IDX.RIGHT_SHOULDER)
  const rElb = mp(worldLandmarks, IDX.RIGHT_ELBOW)
  const rWri = mp(worldLandmarks, IDX.RIGHT_WRIST)
  const lSho = mp(worldLandmarks, IDX.LEFT_SHOULDER)
  const lElb = mp(worldLandmarks, IDX.LEFT_ELBOW)
  const lWri = mp(worldLandmarks, IDX.LEFT_WRIST)
  const rHip   = mp(worldLandmarks, IDX.RIGHT_HIP)
  const lHip   = mp(worldLandmarks, IDX.LEFT_HIP)
  const rKnee  = mp(worldLandmarks, IDX.RIGHT_KNEE)
  const lKnee  = mp(worldLandmarks, IDX.LEFT_KNEE)
  const rAnkle = mp(worldLandmarks, IDX.RIGHT_ANKLE)
  const lAnkle = mp(worldLandmarks, IDX.LEFT_ANKLE)

  // ── 거울 모드 ─────────────────────────────────────────────
  // 사용자 오른쪽 → Anna 왼쪽(l_), 사용자 왼쪽 → Anna 오른쪽(r_)
  const lShoulderDir = rElb.clone().sub(rSho)
  const lElbowDir    = rWri.clone().sub(rElb)
  const rShoulderDir = lElb.clone().sub(lSho)
  const rElbowDir    = lWri.clone().sub(lElb)

  // 상완(shoulder): 팔이 올라갈수록 앞으로(+z) 밀어 망토와 겹침 방지
  // 기본 오프셋 0.08 + 팔 상향 비례 추가
  const lUpFactor = Math.max(0, lShoulderDir.y)
  const rUpFactor = Math.max(0, rShoulderDir.y)
  lShoulderDir.z = 0.08 + lUpFactor * 0.25
  rShoulderDir.z = 0.08 + rUpFactor * 0.25
  // 전완(elbow): z 감쇠 유지 — 앞으로 뻗기 동작 일부 반영
  lElbowDir.z *= 0.3
  rElbowDir.z *= 0.3

  // 바깥쪽 편향 강화: 팔이 안쪽으로 늘어질 때 몸통 관통 방지
  lShoulderDir.x += 0.20
  rShoulderDir.x -= 0.20

  // ── 팔 ────────────────────────────────────────────────────
  rotateBone(bones['l_Arm_ShoulderSHJnt'], lShoulderDir)
  rotateBone(bones['l_Arm_ElbowSHJnt'],    lElbowDir)
  rotateBone(bones['r_Arm_ShoulderSHJnt'], rShoulderDir)
  rotateBone(bones['r_Arm_ElbowSHJnt'],    rElbowDir)

  // ── 목/머리 ───────────────────────────────────────────────
  // 귀↔코는 높이 차이가 거의 없어 x 성분만 남아 목이 옆으로 꺾임
  // 어깨→코는 수직 거리가 충분해 정면 볼 때 ≈+Y → 회전 거의 없음
  const nose = mp(worldLandmarks, IDX.NOSE)
  const shoulderMid = rSho.clone().add(lSho).multiplyScalar(0.5)
  const neckDir = nose.clone().sub(shoulderMid)
  neckDir.z = 0
  if (neckDir.lengthSq() > 0.0001) {
    rotateBone(bones['Neck_01SHJnt'], neckDir.normalize())
  }

  // ── 다리: 랜드마크 가시성이 낮으면 rest 포즈 유지 ──────────
  // (상체만 화면에 보일 때 다리가 이상한 자세 되는 것 방지)
  const VIS = 0.35
  function v(idx) { return worldLandmarks[idx]?.visibility ?? 0 }

  if (v(IDX.RIGHT_HIP) > VIS && v(IDX.RIGHT_KNEE) > VIS)
    rotateBone(bones['l_Leg_HipSHJnt'],  rKnee.clone().sub(rHip))
  if (v(IDX.RIGHT_KNEE) > VIS && v(IDX.RIGHT_ANKLE) > VIS)
    rotateBone(bones['l_Leg_KneeSHJnt'], rAnkle.clone().sub(rKnee))

  if (v(IDX.LEFT_HIP) > VIS && v(IDX.LEFT_KNEE) > VIS)
    rotateBone(bones['r_Leg_HipSHJnt'],  lKnee.clone().sub(lHip))
  if (v(IDX.LEFT_KNEE) > VIS && v(IDX.LEFT_ANKLE) > VIS)
    rotateBone(bones['r_Leg_KneeSHJnt'], lAnkle.clone().sub(lKnee))

  debugLog(bones, lShoulderDir)
}

// ── 손 좌표 시간축 스무딩 ────────────────────────────────────
// 분절별 회전(MCP→PIP, PIP→DIP, DIP→TIP)은 손가락 굽힘(하트 모양 등)을
// 정확히 표현하지만 프레임 간 랜드마크 떨림이 누적되어 "안 펴짐"처럼
// 보일 수 있음 → 지수이동평균(EMA)으로 떨림만 줄이고 굽힘 정보는 보존
const SMOOTH = 0.45   // 1=스무딩 없음, 낮을수록 부드럽지만 반응 느려짐
const _smoothCache = { l: [], r: [] }

function smoothVec(cache, idx, raw) {
  let v = cache[idx]
  if (!v) {
    v = raw.clone()
    cache[idx] = v
  } else {
    v.lerp(raw, SMOOTH)
  }
  return v.clone()
}

// ── 손 랜드마크 → 손가락 본 적용 ────────────────────────────
// Anna 손 구조: Finger_01=검지, Finger_02=중지, Finger_03=약지+새끼 평균
// 거울 모드: pose RIGHT_WRIST에 가까운 손 → l_ 본 (사용자 오른손 → Anna 왼손)
//            pose LEFT_WRIST에 가까운 손  → r_ 본 (사용자 왼손  → Anna 오른손)
export function applyHandToBones(hands, pose2DLandmarks, bones) {
  if (!hands?.worldLandmarks?.length) return

  const rWristX = pose2DLandmarks?.[IDX.RIGHT_WRIST]?.x ?? -1
  const lWristX = pose2DLandmarks?.[IDX.LEFT_WRIST]?.x  ?? -1

  for (let i = 0; i < hands.worldLandmarks.length; i++) {
    const lm    = hands.worldLandmarks[i]
    const hlm2d = hands.landmarks[i]
    const handX = hlm2d[HLM.WRIST].x

    const distR = Math.abs(handX - rWristX)
    const distL = Math.abs(handX - lWristX)
    const pfx   = distR < distL ? 'l' : 'r'
    const cache = _smoothCache[pfx]

    // HandLandmarker world → Three.js (+ EMA 스무딩)
    //   x: 카메라 기준 좌우 → 반전 (-p.x)
    //      카메라 오른쪽 = 사람 왼쪽 → 반전해야 l_/r_ 본에 올바른 방향
    //   y: 이미지 아래가 + → 위가 + 로 반전 (-p.y)
    //   z: HandLandmarker z+ = 카메라 방향 (PoseLandmarker와 반대 규약)
    //      Three.js 카메라가 +z이므로 부호 그대로 (+p.z)
    // 같은 인덱스를 한 프레임에 여러 번 참조해도(예: MCP는 손목·각
    // 손가락 계산에서 중복 사용됨) 스무딩이 그 횟수만큼 누적 적용되지
    // 않도록 프레임 단위로 한 번만 계산해 재사용
    const frameCache = {}
    function h(idx) {
      // 호출부에서 .add()/.sub()로 반환값을 직접 변형하므로
      // 캐시에는 원본을 보관하고 매번 새 clone을 돌려줘야 함
      if (frameCache[idx]) return frameCache[idx].clone()
      const p = lm[idx]
      const raw = new THREE.Vector3(-p.x, -p.y, p.z)
      const v = smoothVec(cache, idx, raw)
      frameCache[idx] = v
      return v.clone()
    }
    function mid(a, b) { return h(a).clone().add(h(b)).multiplyScalar(0.5) }

    // ── 손목 방향 + 손바닥 비틀림(roll) ──────────────────────────
    // 손목 → 손가락 MCP 평균 방향으로 손목 본의 "가리키는 방향"을 정함
    // + 검지 MCP × (약지+새끼 평균 MCP) 외적으로 "손바닥이 향하는 방향"을
    //   구해 손목의 비틀림까지 반영 (이전엔 방향만 따라가고 roll은 항상
    //   rest 값에 고정돼 있어 손바닥이 사용자와 반대로 보이는 문제가 있었음)
    // 실제 왼손/오른손은 손바닥 둘레 외적 방향이 서로 반대라 pfx로 부호 보정
    // (pfx='l' → 사용자 실제 오른손 데이터, pfx='r' → 사용자 실제 왼손 데이터)
    const wrist  = h(HLM.WRIST)
    const avgMCP = h(HLM.IDX_MCP).add(h(HLM.MID_MCP)).add(h(HLM.RNG_MCP)).add(h(HLM.PNK_MCP)).multiplyScalar(0.25)
    const wristForward = avgMCP.sub(wrist)

    const idxDir   = h(HLM.IDX_MCP).sub(wrist)
    const pinkyDir = mid(HLM.RNG_MCP, HLM.PNK_MCP).sub(wrist)
    // 왼손(pfx='r')은 부호 +1로 검증됨. 오른손(pfx='l')도 동일 부호로
    // 통일 (이전엔 pfx별로 반대 부호를 줬으나 오른손 회전 시 반대로
    // 보이는 문제가 있어 왼손과 같은 부호로 맞춤)
    const palmNormal  = new THREE.Vector3().crossVectors(idxDir, pinkyDir)

    rotateBoneFull(bones[`${pfx}_Arm_WristSHJnt`], wristForward, palmNormal)

    // ── 엄지 ──────────────────────────────────────────────────
    // 손가락 뿌리 관절은 굽혀진 상태에서 palmNormal 기반 회전이
    // 불안정해져(거의 평행해지는 경우) 손가락이 거꾸로 꺾이는 문제가
    // 있어 방향만 따라가는 단순 회전으로 되돌림
    rotateBone(bones[`${pfx}_Thumb_01_01SHJnt`], h(HLM.THUMB_MCP).sub(h(HLM.THUMB_CMC)))
    rotateBone(bones[`${pfx}_Thumb_01_02SHJnt`], h(HLM.THUMB_IP) .sub(h(HLM.THUMB_MCP)))
    rotateBone(bones[`${pfx}_Thumb_01_03SHJnt`], h(HLM.THUMB_TIP).sub(h(HLM.THUMB_IP)))

    // ── 검지 (Finger_01) — 분절별 회전 (하트 손가락 등 굽힘 표현) ──
    rotateBone(bones[`${pfx}_Finger_01_01SHJnt`], h(HLM.IDX_PIP).sub(h(HLM.IDX_MCP)))
    rotateBone(bones[`${pfx}_Finger_01_02SHJnt`], h(HLM.IDX_DIP).sub(h(HLM.IDX_PIP)))
    rotateBone(bones[`${pfx}_Finger_01_03SHJnt`], h(HLM.IDX_TIP).sub(h(HLM.IDX_DIP)))

    // ── 중지 (Finger_02) ──────────────────────────────────────
    rotateBone(bones[`${pfx}_Finger_02_01SHJnt`], h(HLM.MID_PIP).sub(h(HLM.MID_MCP)))
    rotateBone(bones[`${pfx}_Finger_02_02SHJnt`], h(HLM.MID_DIP).sub(h(HLM.MID_PIP)))
    rotateBone(bones[`${pfx}_Finger_02_03SHJnt`], h(HLM.MID_TIP).sub(h(HLM.MID_DIP)))

    // ── 약지+새끼 평균 (Finger_03) ────────────────────────────
    const mcp = mid(HLM.RNG_MCP, HLM.PNK_MCP)
    const pip = mid(HLM.RNG_PIP, HLM.PNK_PIP)
    const dip = mid(HLM.RNG_DIP, HLM.PNK_DIP)
    const tip = mid(HLM.RNG_TIP, HLM.PNK_TIP)
    rotateBone(bones[`${pfx}_Finger_03_01SHJnt`], pip.clone().sub(mcp))
    rotateBone(bones[`${pfx}_Finger_03_02SHJnt`], dip.clone().sub(pip))
    rotateBone(bones[`${pfx}_Finger_03_03SHJnt`], tip.clone().sub(dip))
  }
}
