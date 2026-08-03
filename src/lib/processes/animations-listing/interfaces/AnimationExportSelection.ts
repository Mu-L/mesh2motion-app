export type AnimationMirrorExportMode = 'none' | 'mirrored' | 'both'

export interface AnimationExportSelection {
  animation_index: number
  mirror_export_mode: AnimationMirrorExportMode
}
