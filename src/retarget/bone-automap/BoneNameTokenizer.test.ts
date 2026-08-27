import { describe, it, expect } from 'vitest'
import { normalized_lookup_key, parse_bone_name } from './BoneNameTokenizer'
import { BoneSide } from './BoneTypes'

describe('parse_bone_name', () => {
  it('splits camelCase, separators and letter/digit boundaries', () => {
    expect(parse_bone_name('LeftHandIndex1').tokens).toEqual(['hand', 'index'])
    expect(parse_bone_name('upperarm_l').tokens).toEqual(['upper', 'arm'])
    expect(parse_bone_name('DEF-upper_arm.L').tokens).toEqual(['upper', 'arm'])
    expect(parse_bone_name('lShldr').tokens).toEqual(['shldr'])
  })

  it('strips rig namespaces and prefixes', () => {
    expect(parse_bone_name('mixamorig:Hips').tokens).toEqual(['hips'])
    expect(parse_bone_name('mixamorigHips').tokens).toEqual(['hips'])
    expect(parse_bone_name('Armature|mixamorig:LeftFoot').tokens).toEqual(['foot'])
    expect(parse_bone_name('CC_Base_L_Upperarm').tokens).toEqual(['upper', 'arm'])
    expect(parse_bone_name('Bip01 L UpperArm').tokens).toEqual(['upper', 'arm'])
  })

  it('never mistakes a trailing letter for a side marker', () => {
    // the old normalizer read "shoulder" as right-sided and "tail" as left-sided,
    // then chopped them down to "shoulde" and "tai"
    const shoulder = parse_bone_name('shoulder')
    expect(shoulder.tokens).toEqual(['shoulder'])
    expect(shoulder.side).toBe(BoneSide.Unknown)

    const tail = parse_bone_name('tail_01')
    expect(tail.tokens).toEqual(['tail'])
    expect(tail.side).toBe(BoneSide.Unknown)
    expect(tail.index).toBe(1)
  })

  it('reads the side only from a standalone token', () => {
    expect(parse_bone_name('LeftArm').side).toBe(BoneSide.Left)
    expect(parse_bone_name('hand_r').side).toBe(BoneSide.Right)
    expect(parse_bone_name('DEF-f_index.01.R').side).toBe(BoneSide.Right)
    expect(parse_bone_name('lCollar').side).toBe(BoneSide.Left)
    expect(parse_bone_name('spine_02').side).toBe(BoneSide.Unknown)
  })

  it('extracts segment indices and leaf markers', () => {
    expect(parse_bone_name('spine_02').index).toBe(2)
    expect(parse_bone_name('LeftHandThumb3').index).toBe(3)

    const leaf = parse_bone_name('thumb_04_leaf_l')
    expect(leaf.index).toBe(4)
    expect(leaf.is_leaf).toBe(true)
    expect(leaf.tokens).toEqual(['thumb'])

    expect(parse_bone_name('HeadTop_End').is_leaf).toBe(true)
    expect(parse_bone_name('LeftToe_End').is_leaf).toBe(true)
    expect(parse_bone_name('head').is_leaf).toBe(false)
  })

  it('keeps a name that is nothing but a prefix', () => {
    expect(parse_bone_name('mixamorig').tokens.length).toBeGreaterThan(0)
  })
})

describe('normalized_lookup_key', () => {
  it('collapses Mixamo prefix variations onto one key', () => {
    expect(normalized_lookup_key('mixamorig:LeftForeArm')).toBe('leftforearm')
    expect(normalized_lookup_key('mixamorigLeftForeArm')).toBe('leftforearm')
    expect(normalized_lookup_key('LeftForeArm')).toBe('leftforearm')
  })

  it('collapses Rigify separator and leading-zero variations onto one key', () => {
    expect(normalized_lookup_key('DEF-upper_arm.L')).toBe('upperarml')
    expect(normalized_lookup_key('DEF-upper_armL')).toBe('upperarml')
    expect(normalized_lookup_key('DEF-thumb.01.L')).toBe('thumb1l')
    expect(normalized_lookup_key('DEF-thumb01L')).toBe('thumb1l')
    expect(normalized_lookup_key('DEF-spine.001')).toBe('spine1')
    expect(normalized_lookup_key('DEF-spine001')).toBe('spine1')
  })

  it('keeps side and index, unlike parse_bone_name', () => {
    expect(normalized_lookup_key('LeftUpLeg')).toBe('leftupleg')
    expect(normalized_lookup_key('upleg_l')).toBe('uplegl')
  })
})
