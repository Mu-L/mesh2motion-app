import { type Bone, type Object3D, type Scene, type Skeleton, type SkinnedMesh } from 'three'

/**
 * Works out which objects have to be moved into the export scene.
 *
 * Exporters only see what is inside the scene they are handed, and a skin is only
 * valid if every bone it references was written out as a node. Meshes rigged inside
 * Mesh2Motion keep their root bone as a child of the skinned mesh, so moving the mesh
 * was enough to bring the skeleton along. Rigs imported for retargeting keep their
 * bones as siblings of the mesh instead (this is what FBX files look like), so moving
 * only the mesh left every joint pointing at a node that was never exported. Loaders
 * report that as "/skins/0/joints/null: failed to find index (null)".
 */
export class ExportHierarchyService {
  /**
   * @param skinned_meshes the meshes being exported
   * @param skeleton_only true when only the bone hierarchy should be exported
   * @returns the objects to move into the export scene. No returned object is a
   * descendant of another, so each one can be moved and restored on its own.
   */
  public static collect_objects_to_export (skinned_meshes: SkinnedMesh[], skeleton_only: boolean): Object3D[] {
    const collected: Object3D[] = []

    skinned_meshes.forEach((skinned_mesh) => {
      this.skeleton_root_bones(skinned_mesh.skeleton).forEach((root_bone) => {
        // a skeleton-only export stops at the bones on purpose. Going any higher would
        // pull the mesh back in through a parent the bones and the mesh share.
        collected.push(skeleton_only ? root_bone : this.highest_ancestor_below_scene(root_bone))
      })

      if (!skeleton_only) {
        collected.push(this.highest_ancestor_below_scene(skinned_mesh))
      }
    })

    // moving the whole subtree keeps the transforms on the nodes between the mesh and
    // its bones, so anything already travelling with a parent is dropped here
    const unique_objects = Array.from(new Set(collected))
    return unique_objects.filter((object) => !this.has_ancestor_in(object, unique_objects))
  }

  /**
   * Bones are not stored in hierarchical order, and a rig can have more than one root,
   * so the first bone in the list is not reliably the top of the tree.
   */
  private static skeleton_root_bones (skeleton: Skeleton): Bone[] {
    const bones_in_skeleton = new Set<Object3D>(skeleton.bones)

    return skeleton.bones.filter((bone) => {
      // a broken file can leave gaps in the bone list, and those are not ours to export
      if (bone === undefined || bone === null) {
        return false
      }

      return bone.parent === null || !bones_in_skeleton.has(bone.parent)
    })
  }

  /**
   * Climbs to the top of the model hierarchy, stopping below the scene the model was
   * loaded into. The scene is the container we are moving out of, not part of the model.
   */
  private static highest_ancestor_below_scene (object: Object3D): Object3D {
    let highest_ancestor: Object3D = object

    while (highest_ancestor.parent !== null && (highest_ancestor.parent as Scene).isScene !== true) {
      highest_ancestor = highest_ancestor.parent
    }

    return highest_ancestor
  }

  private static has_ancestor_in (object: Object3D, candidates: Object3D[]): boolean {
    let ancestor: Object3D | null = object.parent

    while (ancestor !== null) {
      if (candidates.includes(ancestor)) {
        return true
      }

      ancestor = ancestor.parent
    }

    return false
  }
}
