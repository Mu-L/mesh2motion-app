import { describe, it, expect } from 'vitest'
import { AnimationClip, Bone, NumberKeyframeTrack, Object3D, QuaternionKeyframeTrack, VectorKeyframeTrack } from 'three'
import { ExportAnimationCleanupService } from './ExportAnimationCleanupService'

/**
 * Builds a small rig the way exported models look: the bones hang off a root
 * object that gets moved into the export scene.
 */
function make_export_root (): Object3D {
  const root = new Object3D()
  root.name = 'Armature'

  const hips = new Bone()
  hips.name = 'Hips'
  const spine = new Bone()
  spine.name = 'Spine'

  root.add(hips)
  hips.add(spine)

  return root
}

function make_clip (tracks: Array<QuaternionKeyframeTrack | VectorKeyframeTrack | NumberKeyframeTrack>): AnimationClip {
  return new AnimationClip('walk', -1, tracks)
}

describe('ExportAnimationCleanupService', () => {
  it('removes tracks whose joint is not part of the export hierarchy', () => {
    const export_root = make_export_root()
    const clip = make_clip([
      new QuaternionKeyframeTrack('Hips.quaternion', [0, 1], [0, 0, 0, 1, 0, 0, 0, 1]),
      new QuaternionKeyframeTrack('IndexFinger_L.quaternion', [0, 1], [0, 0, 0, 1, 0, 0, 0, 1])
    ])

    ExportAnimationCleanupService.clean_clips_for_export([clip], [export_root])

    expect(clip.tracks.map((track) => track.name)).toEqual(['Hips.quaternion'])
  })

  it('keeps tracks bound to any of the export roots', () => {
    const first_root = make_export_root()
    const second_root = new Object3D()
    second_root.name = 'Prop'

    const clip = make_clip([
      new QuaternionKeyframeTrack('Spine.quaternion', [0, 1], [0, 0, 0, 1, 0, 0, 0, 1]),
      new VectorKeyframeTrack('Prop.position', [0, 1], [0, 0, 0, 1, 1, 1])
    ])

    ExportAnimationCleanupService.clean_clips_for_export([clip], [first_root, second_root])

    expect(clip.tracks).toHaveLength(2)
  })

  it('drops keyframes whose float32 time collapses into the previous keyframe', () => {
    const export_root = make_export_root()

    // 4/3 and the next-closest float64 value are different in float64, but both round to
    // the same float32, which is how ACCESSOR_ANIMATION_INPUT_NON_INCREASING happens.
    const time_a = 4 / 3
    const time_b = time_a + Number.EPSILON
    expect(Math.fround(time_a)).toBe(Math.fround(time_b))

    const clip = make_clip([
      new VectorKeyframeTrack('Hips.position', [0, time_a, time_b, 2], [
        0, 0, 0,
        1, 1, 1,
        2, 2, 2,
        3, 3, 3
      ])
    ])

    ExportAnimationCleanupService.clean_clips_for_export([clip], [export_root])

    const track = clip.tracks[0]
    expect(Array.from(track.times)).toEqual([0, Math.fround(time_a), 2])
    expect(Array.from(track.values)).toEqual([0, 0, 0, 1, 1, 1, 3, 3, 3])

    for (let i = 1; i < track.times.length; i++) {
      expect(track.times[i]).toBeGreaterThan(track.times[i - 1])
    }
  })

  it('leaves tracks with strictly increasing times untouched', () => {
    const export_root = make_export_root()
    const track = new NumberKeyframeTrack('Hips.scale[x]', [0, 0.5, 1], [1, 2, 3])
    const original_times = track.times
    const original_values = track.values

    ExportAnimationCleanupService.clean_clips_for_export([make_clip([track])], [export_root])

    expect(track.times).toBe(original_times)
    expect(track.values).toBe(original_values)
  })
})
