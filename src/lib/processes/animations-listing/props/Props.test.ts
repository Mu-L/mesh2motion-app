import { describe, it, expect } from 'vitest'
import { Bone, Group, Mesh, Skeleton } from 'three'
import { HandBoneResolver } from './HandBoneResolver'
import { PropCatalog } from './PropCatalog'
import { PropType } from './PropType'
import { PropsExportFilter, PROP_USER_DATA_KEY } from './PropsExportFilter'
import { PropSide } from './PropSide'

function make_skeleton (names: string[]): Skeleton {
  return new Skeleton(names.map((name) => {
    const bone = new Bone()
    bone.name = name
    return bone
  }))
}

describe('PropCatalog', () => {
  it('registers every bundled prop model and keeps legacy Pole and Staff choices', () => {
    const definitions = PropCatalog.all()

    expect(definitions).toHaveLength(31)
    expect(new Set(definitions.map((definition) => definition.asset_path)).size).toBe(31)
    expect(PropCatalog.find(PropType.Pole)?.asset_path).toBe('props/spear_A.glb')
    expect(PropCatalog.find(PropType.Pole)?.model_offset_y).toBe(0.93)
    expect(PropCatalog.find(PropType.Staff)?.asset_path).toBe('props/staff_A.glb')
  })
})

describe('HandBoneResolver', () => {
  it('finds exact hand bone names', () => {
    const skeleton = make_skeleton(['pelvis', 'hand_l', 'index_01_l', 'hand_r'])
    expect(HandBoneResolver.resolve(skeleton, PropSide.Left)?.name).toBe('hand_l')
    expect(HandBoneResolver.resolve(skeleton, PropSide.Right)?.name).toBe('hand_r')
  })

  it('falls back to side-marked hand bones and skips fingers', () => {
    const skeleton = make_skeleton(['Hand_Index_L', 'Claw_Hand_L', 'Claw_Hand_R'])
    expect(HandBoneResolver.resolve(skeleton, PropSide.Left)?.name).toBe('Claw_Hand_L')
    expect(HandBoneResolver.resolve(skeleton, PropSide.Right)?.name).toBe('Claw_Hand_R')
  })

  it('returns null when the hand bone is missing', () => {
    const skeleton = make_skeleton(['pelvis', 'hand_r'])
    expect(HandBoneResolver.resolve(skeleton, PropSide.Left)).toBeNull()
  })
})

describe('PropsExportFilter', () => {
  it('detaches props and restores them to their original parents', () => {
    const root = new Bone()
    const hand = new Bone()
    root.add(hand)

    const prop = new Group()
    prop.userData[PROP_USER_DATA_KEY] = true
    prop.add(new Mesh())
    const other_child = new Bone()
    hand.add(prop, other_child)

    const restore = PropsExportFilter.detach_props([root])
    expect(prop.parent).toBeNull()
    expect(hand.children).toEqual([other_child])

    restore()
    expect(prop.parent).toBe(hand)
  })
})
