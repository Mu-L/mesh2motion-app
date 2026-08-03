import { type AnimationClip } from 'three'
import { type AnimationClipMetadata } from './TransformedAnimationClipPair'
import { type AnimationMirrorExportMode } from './AnimationExportSelection'

export interface AnimationWithState extends AnimationClip {
  isChecked?: boolean
  mirror_export_mode?: AnimationMirrorExportMode
  name: string
  metadata: AnimationClipMetadata
}
