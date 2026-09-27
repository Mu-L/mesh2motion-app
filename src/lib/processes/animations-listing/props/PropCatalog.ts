import { Euler, type Object3D } from 'three'
import { SkeletonType } from '../../../enums/SkeletonType.ts'
import { PropType } from './PropType.ts'
import { PropSide } from './PropSide.ts'
import { ProceduralPropBuilder } from './ProceduralPropBuilder.ts'

export interface PropMountOffset {
  // meters for a rig at skeleton scale 1.0, along the hand bone toward the fingers
  along_hand: number
  // meters for a rig at skeleton scale 1.0, along world down in the bind pose
  below_palm: number
  // applied after the prop's +Y is aligned with the grip axis (world forward)
  rotation: Euler
}

export interface PropDefinition {
  type: PropType
  display_name: string
  create_object: () => Object3D
  default_mount_offsets: Record<PropSide, PropMountOffset>
  rig_mount_offsets: Partial<Record<SkeletonType, Record<PropSide, PropMountOffset>>>
}

export class PropCatalog {
  public static readonly supported_skeleton_types: SkeletonType[] = [SkeletonType.Human, SkeletonType.Kaiju]

  private static readonly definitions: PropDefinition[] = [
    {
      type: PropType.Pole,
      display_name: 'Pole',
      create_object: () => ProceduralPropBuilder.create_pole(),
      default_mount_offsets: {
        [PropSide.Left]: { along_hand: 0.09, below_palm: 0.035, rotation: new Euler() },
        [PropSide.Right]: { along_hand: 0.09, below_palm: 0.035, rotation: new Euler() }
      },
      rig_mount_offsets: {}
    }
  ]

  public static all (): PropDefinition[] {
    return this.definitions
  }

  public static find (type: PropType): PropDefinition | undefined {
    return this.definitions.find((definition) => definition.type === type)
  }

  public static is_supported_skeleton (skeleton_type: SkeletonType): boolean {
    return this.supported_skeleton_types.includes(skeleton_type)
  }

  public static mount_offset (definition: PropDefinition, skeleton_type: SkeletonType, side: PropSide): PropMountOffset {
    return definition.rig_mount_offsets[skeleton_type]?.[side] ?? definition.default_mount_offsets[side]
  }
}
