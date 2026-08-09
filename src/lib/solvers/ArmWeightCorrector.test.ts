import { describe, it, expect } from 'vitest'
import { Bone, BufferGeometry, Float32BufferAttribute, type Vector3 } from 'three'
import { Utility } from '../Utilities'
import { ArmWeightCorrector } from './ArmWeightCorrector'

/**
 * Builds a minimal symmetric humanoid-ish rig with these WORLD positions:
 *
 *   root      (0, 0,   0)
 *   spine_01  (0, 1.0, 0)   chest (0, 1.5, 0)
 *   clavicle  (+/-0.1, 1.5, 0)
 *   upperarm  (+/-1.0, 1.5, 0)   lowerarm (+/-2.0, ...)   hand (+/-3.0, ...)
 *
 * Which puts the midpoint-to-child reference points the solver measures against at:
 *   spine_01 (0, 1.25, 0)   chest (+/-0.05, 1.5, 0)   clavicle (+/-0.55, 1.5, 0)
 */
function build_test_rig (): Bone[] {
  const root = new Bone()
  root.name = 'root'

  const spine = new Bone()
  spine.name = 'spine_01'
  spine.position.set(0, 1.0, 0)
  root.add(spine)

  const chest = new Bone()
  chest.name = 'chest'
  chest.position.set(0, 0.5, 0)
  spine.add(chest)

  const bones: Bone[] = [root, spine, chest]

  const build_arm = (side: string, direction: number): void => {
    const clavicle = new Bone()
    clavicle.name = `clavicle_${side}`
    clavicle.position.set(direction * 0.1, 0, 0) // world x = direction * 0.1

    const upperarm = new Bone()
    upperarm.name = `upperarm_${side}`
    upperarm.position.set(direction * 0.9, 0, 0) // world x = direction * 1.0

    const lowerarm = new Bone()
    lowerarm.name = `lowerarm_${side}`
    lowerarm.position.set(direction * 1.0, 0, 0) // world x = direction * 2.0

    const hand = new Bone()
    hand.name = `hand_${side}`
    hand.position.set(direction * 1.0, 0, 0) // world x = direction * 3.0

    lowerarm.add(hand)
    upperarm.add(lowerarm)
    clavicle.add(upperarm)
    chest.add(clavicle)

    bones.push(clavicle, upperarm, lowerarm, hand)
  }

  build_arm('l', 1)
  build_arm('r', -1)

  root.updateWorldMatrix(true, true)
  return bones
}

function bone_index (bones: Bone[], name: string): number {
  return bones.findIndex(bone => bone.name === name)
}

function geometry_from_points (points: Array<[number, number, number]>): BufferGeometry {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(points.flat(), 3))
  return geometry
}

describe('ArmWeightCorrector.shoulder_anchor_x', () => {
  it('returns the absolute world X of the upperarm bone', () => {
    const bones = build_test_rig()
    expect(ArmWeightCorrector.shoulder_anchor_x(bones)).toBeCloseTo(1.0)
  })

  it('returns null when the rig has no arm bones', () => {
    const snake_head = new Bone()
    snake_head.name = 'head'
    expect(ArmWeightCorrector.shoulder_anchor_x([snake_head])).toBeNull()
  })
})

describe('ArmWeightCorrector.apply_arm_weight_correction', () => {
  it('reassigns inboard vertices off arm bones onto the nearest non-arm bone', () => {
    const bones = build_test_rig()
    const upperarm_l = bone_index(bones, 'upperarm_l')

    // a chest-height vertex inboard of the shoulder plane (x = 1.0), closest to
    // the clavicle's reference point at 0.55
    const geometry = geometry_from_points([[0.35, 1.5, 0]])
    const skin_indices = [upperarm_l, 0, 0, 0]
    const skin_weights = [1.0, 0, 0, 0]

    new ArmWeightCorrector(geometry, bones, 0).apply_arm_weight_correction(skin_indices, skin_weights)

    expect(skin_indices[0]).not.toBe(upperarm_l)
    expect(bones[skin_indices[0]].name).toBe('clavicle_l')
    expect(skin_weights[0] + skin_weights[1] + skin_weights[2] + skin_weights[3]).toBeCloseTo(1.0)
  })

  it('leaves vertices outboard of the plane alone', () => {
    const bones = build_test_rig()
    const upperarm_l = bone_index(bones, 'upperarm_l')

    const geometry = geometry_from_points([[1.5, 1.5, 0]])
    const skin_indices = [upperarm_l, 0, 0, 0]
    const skin_weights = [1.0, 0, 0, 0]

    new ArmWeightCorrector(geometry, bones, 0).apply_arm_weight_correction(skin_indices, skin_weights)

    expect(skin_indices[0]).toBe(upperarm_l)
    expect(skin_weights[0]).toBe(1.0)
  })

  it('applies symmetrically to the negative X side', () => {
    const bones = build_test_rig()
    const upperarm_r = bone_index(bones, 'upperarm_r')

    const geometry = geometry_from_points([[-0.35, 1.5, 0]])
    const skin_indices = [upperarm_r, 0, 0, 0]
    const skin_weights = [1.0, 0, 0, 0]

    new ArmWeightCorrector(geometry, bones, 0).apply_arm_weight_correction(skin_indices, skin_weights)

    expect(bones[skin_indices[0]].name).toBe('clavicle_r')
  })

  it('never hands a vertex to the clavicle when the offset pushes the plane past it', () => {
    // clavicle midpoint sits at x = 0.55, so a -0.5 offset puts the plane at 0.5
    const bones = build_test_rig()
    const upperarm_l = bone_index(bones, 'upperarm_l')

    const geometry = geometry_from_points([[0.45, 1.5, 0]])
    const skin_indices = [upperarm_l, 0, 0, 0]
    const skin_weights = [1.0, 0, 0, 0]

    new ArmWeightCorrector(geometry, bones, -0.5).apply_arm_weight_correction(skin_indices, skin_weights)

    // still corrected (0.45 < 0.5), and the replacement is never an arm bone
    expect(bones[skin_indices[0]].name.includes('arm')).toBe(false)
  })

  it('is a no-op when the rig has no arm bones', () => {
    const snake_head = new Bone()
    snake_head.name = 'head'
    snake_head.updateWorldMatrix(true, true)

    const geometry = geometry_from_points([[0, 0, 0]])
    const skin_indices = [0, 0, 0, 0]
    const skin_weights = [1.0, 0, 0, 0]

    new ArmWeightCorrector(geometry, [snake_head], 0).apply_arm_weight_correction(skin_indices, skin_weights)

    expect(skin_indices).toEqual([0, 0, 0, 0])
    expect(skin_weights).toEqual([1.0, 0, 0, 0])
  })

  it('does not strip weights from the clavicle itself', () => {
    const bones = build_test_rig()
    const clavicle_l = bone_index(bones, 'clavicle_l')

    const geometry = geometry_from_points([[0.35, 1.5, 0]])
    const skin_indices = [clavicle_l, 0, 0, 0]
    const skin_weights = [1.0, 0, 0, 0]

    new ArmWeightCorrector(geometry, bones, 0).apply_arm_weight_correction(skin_indices, skin_weights)

    expect(skin_indices[0]).toBe(clavicle_l)
    expect(skin_weights[0]).toBe(1.0)
  })

  it('merges the stolen weight into an existing slot for the replacement bone', () => {
    const bones = build_test_rig()
    const upperarm_l = bone_index(bones, 'upperarm_l')
    const clavicle_l = bone_index(bones, 'clavicle_l')

    const geometry = geometry_from_points([[0.35, 1.5, 0]])
    const skin_indices = [upperarm_l, clavicle_l, 0, 0]
    const skin_weights = [0.6, 0.4, 0, 0]

    new ArmWeightCorrector(geometry, bones, 0).apply_arm_weight_correction(skin_indices, skin_weights)

    // all of it collapses onto the single clavicle slot
    expect(skin_indices[1]).toBe(clavicle_l)
    expect(skin_weights[1]).toBeCloseTo(1.0)
    expect(skin_weights[0]).toBe(0)
  })
})

describe('Utility.bone_midpoint_to_child', () => {
  it('returns the halfway point to the first child', () => {
    const bones = build_test_rig()
    const upperarm_l = bones[bone_index(bones, 'upperarm_l')]
    const midpoint: Vector3 = Utility.bone_midpoint_to_child(upperarm_l)
    expect(midpoint.x).toBeCloseTo(1.5)
  })

  it('falls back to the bone position when childless', () => {
    const bones = build_test_rig()
    const hand_l = bones[bone_index(bones, 'hand_l')]
    expect(Utility.bone_midpoint_to_child(hand_l).x).toBeCloseTo(3.0)
  })
})
