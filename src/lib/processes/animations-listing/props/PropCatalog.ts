import { Euler, Group, Mesh, type Object3D } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { SkeletonType } from '../../../enums/SkeletonType.ts'
import { PropType } from './PropType.ts'
import { PropSide } from './PropSide.ts'

export type PropCategory = 'Polearms' | 'Staves' | 'Ranged' | 'Axes' | 'Daggers' | 'Fist Weapons' | 'Hammers' | 'Shields' | 'Swords' | 'Wands'

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
  category: PropCategory
  asset_path: string
  model_offset_y: number
  default_mount_offsets: Record<PropSide, PropMountOffset>
  rig_mount_offsets: Partial<Record<SkeletonType, Record<PropSide, PropMountOffset>>>
}

function create_definition (
  type: PropType,
  display_name: string,
  category: PropCategory,
  filename: string,
  model_offset_y: number = 0
): PropDefinition {
  return {
    type,
    display_name,
    category,
    asset_path: `props/${filename}`,
    model_offset_y,
    default_mount_offsets: {
      [PropSide.Left]: { along_hand: 0.09, below_palm: 0.035, rotation: new Euler() },
      [PropSide.Right]: { along_hand: 0.09, below_palm: 0.035, rotation: new Euler() }
    },
    rig_mount_offsets: {}
  }
}

export class PropCatalog {
  public static readonly supported_skeleton_types: SkeletonType[] = [SkeletonType.Human, SkeletonType.Kaiju]

  private static readonly loader: GLTFLoader = new GLTFLoader()
  private static readonly model_cache = new Map<string, Promise<Group>>()

  private static readonly definitions: PropDefinition[] = [
    create_definition(PropType.Pole, 'Pole', 'Polearms', 'spear_A.glb', 0.93),
    create_definition(PropType.Halberd, 'Halberd', 'Polearms', 'halberd.glb'),
    create_definition(PropType.Staff, 'Staff', 'Staves', 'staff_A.glb'),
    create_definition(PropType.StaffB, 'Staff B', 'Staves', 'staff_B.glb'),
    create_definition(PropType.ArrowA, 'Arrow A', 'Ranged', 'arrow_A.glb'),
    create_definition(PropType.ArrowB, 'Arrow B', 'Ranged', 'arrow_B.glb'),
    create_definition(PropType.BowA, 'Bow A', 'Ranged', 'bow_A.glb'),
    create_definition(PropType.BowAWithString, 'Bow A (String)', 'Ranged', 'bow_A_withString.glb'),
    create_definition(PropType.BowB, 'Bow B', 'Ranged', 'bow_B.glb'),
    create_definition(PropType.BowBWithString, 'Bow B (String)', 'Ranged', 'bow_B_withString.glb'),
    create_definition(PropType.AxeA, 'Axe A', 'Axes', 'axe_A.glb'),
    create_definition(PropType.AxeB, 'Axe B', 'Axes', 'axe_B.glb'),
    create_definition(PropType.AxeC, 'Axe C', 'Axes', 'axe_C.glb'),
    create_definition(PropType.DaggerA, 'Dagger A', 'Daggers', 'dagger_A.glb'),
    create_definition(PropType.DaggerB, 'Dagger B', 'Daggers', 'dagger_B.glb'),
    create_definition(PropType.FistWeaponA, 'Fist Weapon A', 'Fist Weapons', 'fistweapon_A.glb'),
    create_definition(PropType.FistWeaponAStacked, 'Fist Weapon A (Stacked)', 'Fist Weapons', 'fistweapon_A_stacked.glb'),
    create_definition(PropType.FistWeaponB, 'Fist Weapon B', 'Fist Weapons', 'fistweapon_B.glb'),
    create_definition(PropType.FistWeaponBStacked, 'Fist Weapon B (Stacked)', 'Fist Weapons', 'fistweapon_B_stacked.glb'),
    create_definition(PropType.HammerA, 'Hammer A', 'Hammers', 'hammer_A.glb'),
    create_definition(PropType.HammerB, 'Hammer B', 'Hammers', 'hammer_B.glb'),
    create_definition(PropType.HammerC, 'Hammer C', 'Hammers', 'hammer_C.glb'),
    create_definition(PropType.ShieldA, 'Shield A', 'Shields', 'shield_A.glb'),
    create_definition(PropType.ShieldB, 'Shield B', 'Shields', 'shield_B.glb'),
    create_definition(PropType.ShieldC, 'Shield C', 'Shields', 'shield_C.glb'),
    create_definition(PropType.SwordA, 'Sword A', 'Swords', 'sword_A.glb'),
    create_definition(PropType.SwordB, 'Sword B', 'Swords', 'sword_B.glb'),
    create_definition(PropType.SwordC, 'Sword C', 'Swords', 'sword_C.glb'),
    create_definition(PropType.SwordD, 'Sword D', 'Swords', 'sword_D.glb'),
    create_definition(PropType.SwordE, 'Sword E', 'Swords', 'sword_E.glb'),
    create_definition(PropType.WandA, 'Wand A', 'Wands', 'wand_A.glb')
  ]

  public static all (): PropDefinition[] {
    return this.definitions
  }

  public static find (type: PropType): PropDefinition | undefined {
    return this.definitions.find((definition) => definition.type === type)
  }

  public static async create_object (definition: PropDefinition): Promise<Object3D> {
    const model = (await this.load_model(definition.asset_path)).clone(true)
    model.traverse((child) => {
      if (child instanceof Mesh) {
        child.geometry = child.geometry.clone()
        child.material = Array.isArray(child.material)
          ? child.material.map((material) => material.clone())
          : child.material.clone()
      }
    })

    const prop_object = new Group()
    model.position.y += definition.model_offset_y
    prop_object.add(model)
    return prop_object
  }

  public static is_supported_skeleton (skeleton_type: SkeletonType): boolean {
    return this.supported_skeleton_types.includes(skeleton_type)
  }

  public static mount_offset (definition: PropDefinition, skeleton_type: SkeletonType, side: PropSide): PropMountOffset {
    return definition.rig_mount_offsets[skeleton_type]?.[side] ?? definition.default_mount_offsets[side]
  }

  private static async load_model (asset_path: string): Promise<Group> {
    let model_promise = this.model_cache.get(asset_path)
    if (model_promise === undefined) {
      model_promise = this.loader.loadAsync(asset_path)
        .then((gltf) => gltf.scene)
        .catch((error: unknown) => {
          this.model_cache.delete(asset_path)
          throw error
        })
      this.model_cache.set(asset_path, model_promise)
    }

    return await model_promise
  }
}
