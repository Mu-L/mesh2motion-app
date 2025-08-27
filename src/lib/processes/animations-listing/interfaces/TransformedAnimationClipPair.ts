import { type AnimationClip } from "three"

export interface TransformedAnimationClipPair {
  /**
   * The original version of the animation clip, without any transformations
   * applied to it.
   *
   * This allows for simple non-destructive modification of the animation,
   * since we can always reset to the original.
   */
  original_animation_clip: AnimationClip
  /**
   * The warped version of the animation clip, which is what will be displayed
   * and downloaded by the user.
   */
  display_animation_clip: AnimationClip
}
