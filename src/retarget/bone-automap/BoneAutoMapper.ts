import { Bone, Group, Object3D, Scene, SkinnedMesh } from 'three'
import { BoneCategoryMapper } from './BoneCategoryMapper'
import { BoneChainResolver, type RawBoneRecord } from './BoneChainResolver'
import { CanonicalSlotMapper } from './CanonicalSlotMapper'
import { MixamoMapper } from './MixamoMapper'
import { RigifyMapper } from './RigifyMapper'
import { TargetBoneMappingType } from '../steps/StepBoneMapping'
import { AnimationRetargetService } from '../AnimationRetargetService'

// re-exported so existing imports from './BoneAutoMapper' keep working
export { BoneCategory, BoneSide, BoneSlot, type BoneMetadata } from './BoneTypes'
import { type BoneMetadata } from './BoneTypes'

/**
 * BoneAutoMapper - Handles automatic bone mapping between source and target skeletons
 * Source = Mesh2Motion skeleton (draggable bones)
 * Target = Uploaded mesh skeleton (drop zones)
 *
 * Rigs that match a known template (Mixamo, Rigify) go through that template's
 * exact table. Everything else goes through canonical slot resolution, which
 * reduces both skeletons to (joint, side, position-in-chain) and matches on that -
 * see BoneSlotVocabulary and BoneChainResolver.
 */
export class BoneAutoMapper {
  /**
   * Attempts to automatically map source bones (Mesh2Motion) to target bones (uploaded mesh)
   * Reads both armatures and the detected rig type from AnimationRetargetService.
   * @returns Map of target bone name -> source bone name
   */
  public static auto_map_bones (): Map<string, string> {
    // Traverse source skeleton to build parent-child relationships
    const source_armature: Group | null = AnimationRetargetService.getInstance().get_source_armature()
    if (source_armature === null) {
      console.error('Source armature is null while extracting bone parent map.')
      return new Map<string, string>()
    }

    // Create metadata for both source and target bones
    const retarget_service: AnimationRetargetService = AnimationRetargetService.getInstance()
    let source_bones_meta: BoneMetadata[] = []
    let target_bones_meta: BoneMetadata[] = []

    if (retarget_service.get_source_armature().children.length > 0) {
      source_bones_meta = BoneAutoMapper.create_all_bone_metadata(retarget_service.get_source_armature(), true)
    }

    if (retarget_service.get_target_armature().children.length > 0) {
      target_bones_meta = BoneAutoMapper.create_all_bone_metadata(retarget_service.get_target_armature(), false)
    }

    // if the target is a mixamo rig and our skeleton type is human, we can do a direct name mapping
    // without worrying about guessing
    if (retarget_service.get_target_mapping_type() === TargetBoneMappingType.Mixamo) {
      console.log('Target skeleton appears to be a Mixamo rig, performing direct name mapping...')
      return MixamoMapper.map_mixamo_bones(source_bones_meta, target_bones_meta)
    }

    if (retarget_service.get_target_mapping_type() === TargetBoneMappingType.Rigify) {
      console.log('Target skeleton appears to be a Rigify rig, performing direct name mapping...')
      return RigifyMapper.map_rigify_bones(source_bones_meta, target_bones_meta)
    }

    return BoneAutoMapper.map_by_canonical_slots(source_bones_meta, target_bones_meta)
  }

  /**
   * Map an arbitrarily named rig in three passes.
   *
   * Exact names go first: if two rigs literally agree on a bone name, nothing the
   * vocabulary infers should overrule that. Canonical slots handle the rest of the
   * humanoid skeleton, and a final loose-name pass picks up anything anatomical the
   * vocabulary has no word for - custom animal chains, accessory bones.
   *
   * Each pass carries the accumulated map forward, so a source bone claimed by one
   * pass can never be handed out again by a later one.
   *
   * Kept separate from auto_map_bones so it can be unit tested without a three.js scene.
   */
  public static map_by_canonical_slots (
    source_bones_meta: BoneMetadata[], target_bones_meta: BoneMetadata[]
  ): Map<string, string> {
    const exact_mappings = BoneCategoryMapper.match_exact_names(
      source_bones_meta, target_bones_meta, new Map()
    )

    const slot_mappings = CanonicalSlotMapper.map_bones(
      source_bones_meta, target_bones_meta, exact_mappings
    )

    const mappings = BoneCategoryMapper.match_loose_names(
      source_bones_meta, target_bones_meta, slot_mappings
    )

    console.log(`Auto-mapped ${mappings.size} bones ` +
      `(${exact_mappings.size} by exact name, ` +
      `${slot_mappings.size - exact_mappings.size} by canonical slot, ` +
      `${mappings.size - slot_mappings.size} by loose name)`)

    return mappings
  }

  /**
   * Build resolved metadata for every bone in an armature.
   * @param armature - the armature to read bones from
   * @param is_source_skeleton - source is a plain Group of Bones; target bones come
   *                             off a SkinnedMesh's skeleton
   */
  private static create_all_bone_metadata (armature: Group | Scene, is_source_skeleton: boolean): BoneMetadata[] {
    const bones: Bone[] = []

    // the source M2M skeleton is a Group that contains a lot of bones...but no Skinned Meshes,
    // so just traverse the tree and build the bone list directly
    if (is_source_skeleton) {
      armature.traverse((child: Object3D) => {
        if (child.type === 'Bone') {
          bones.push(child as Bone)
        }
      })
    } else {
      // if we find multiple skinned meshes, we will log a warning. Probably won't be an issue, but just putting
      // this in there for now
      let skinned_mesh_found: boolean = false
      let skinned_mesh: SkinnedMesh | null = null
      armature.traverse((child: Object3D) => {
        if (child.type === 'SkinnedMesh') {
          if (skinned_mesh_found) {
            console.log('create_all_bone_metadata(): Multiple SkinnedMesh objects found in armature. Only processing the first one.')
            return
          }
          skinned_mesh_found = true
          skinned_mesh = child as SkinnedMesh
        }
      })

      if (skinned_mesh !== null) {
        bones.push(...(skinned_mesh as SkinnedMesh).skeleton.bones)
      }
    }

    // BoneChainResolver works on plain records, so it can be tested without a scene.
    // A bone's parent is often the armature node rather than another bone; the
    // resolver treats any parent outside the bone list as no parent.
    const bone_records: RawBoneRecord[] = bones.map(bone => ({
      name: bone.name,
      parent_name: bone.parent !== null ? bone.parent.name : null
    }))

    return BoneChainResolver.build_metadata(bone_records)
  }
}
