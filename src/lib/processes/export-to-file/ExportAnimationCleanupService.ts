import { type AnimationClip, type KeyframeTrack, type Object3D, PropertyBinding } from 'three'

/**
 * Cleans animation clips right before they are handed to an exporter.
 *
 * The animation library is authored against the full skeleton, but the user can delete
 * joints (fingers, tail, ...) before exporting. Tracks that target a deleted joint have
 * nothing to bind to, so they are stripped here instead of relying on every exporter to
 * quietly skip them.
 *
 * Keyframe times also need to be strictly increasing. Times are parsed as float64 but
 * KeyframeTrack stores them as float32, so two times that were distinct in the source
 * file can collapse into the same float32 value. glTF validators reject that with
 * ACCESSOR_ANIMATION_INPUT_NON_INCREASING, so duplicated times are dropped here.
 */
export class ExportAnimationCleanupService {
  /**
   * Cleans the clips in place: removes tracks that do not resolve to a node inside the
   * export hierarchy, then drops keyframes whose time is not strictly greater than the
   * previous keyframe's time.
   *
   * @param animation_clips clips that are about to be exported
   * @param export_roots the objects being moved into the export scene
   */
  public static clean_clips_for_export (animation_clips: AnimationClip[], export_roots: Object3D[]): void {
    animation_clips.forEach((animation_clip) => {
      animation_clip.tracks = animation_clip.tracks.filter((track) => {
        const is_bound = this.track_binds_to_export_hierarchy(track, export_roots)

        if (!is_bound) {
          console.log(`Export cleanup: removing animation track "${track.name}" because its joint is not part of the exported skeleton`)
        }

        return is_bound
      })

      animation_clip.tracks.forEach((track) => { this.remove_non_increasing_keyframes(track) })
    })
  }

  private static track_binds_to_export_hierarchy (track: KeyframeTrack, export_roots: Object3D[]): boolean {
    const node_name: string | undefined = PropertyBinding.parseTrackName(track.name).nodeName

    return export_roots.some((export_root) => {
      return PropertyBinding.findNode(export_root, node_name) !== null
    })
  }

  private static remove_non_increasing_keyframes (track: KeyframeTrack): void {
    const times = track.times
    const value_size = track.getValueSize()
    const kept_indices: number[] = []

    for (let i = 0; i < times.length; i++) {
      if (kept_indices.length === 0 || times[i] > times[kept_indices[kept_indices.length - 1]]) {
        kept_indices.push(i)
      }
    }

    if (kept_indices.length === times.length) {
      return // already strictly increasing
    }

    const cleaned_times = new Float32Array(kept_indices.length)
    const cleaned_values = new Float32Array(kept_indices.length * value_size)

    kept_indices.forEach((source_index, kept_index) => {
      cleaned_times[kept_index] = times[source_index]

      for (let component = 0; component < value_size; component++) {
        cleaned_values[kept_index * value_size + component] = track.values[source_index * value_size + component]
      }
    })

    track.times = cleaned_times
    track.values = cleaned_values
  }
}
