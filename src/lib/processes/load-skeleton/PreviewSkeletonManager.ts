import { Group, type Object3D, type Object3DEventMap, type Scene } from 'three'
import { type GLTF, GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type GLTFResult from './interfaces/GLTFResult'
import { type HandSkeletonType, SkeletonType } from '../../enums/SkeletonType'
import { HandHelper } from './HandHelper'
import { RigConfig } from '../../RigConfig'
import { CustomSkeletonHelper } from '../../CustomSkeletonHelper'

const skeleton_group_name: string = 'preview_skeleton_group'

// need a function that will add a preview skeleton to the scene
// this will remove any existing preview skeleton first
// and then add the new one based on the selected type
export async function add_preview_skeleton (
  root: Scene,
  skeleton_type: SkeletonType,
  hand_skeleton_type: HandSkeletonType,
  skeleton_scale: number = 1.0,
  show_joints: boolean = true
): Promise<Object3D<Object3DEventMap>> {
  let preview_skeleton_group = root.getObjectByName(skeleton_group_name) as Group | undefined

  // Check if preview skeleton group exists and matches requested skeleton
  if (preview_skeleton_group !== undefined) {
    // Read previous skeleton info from userData
    const previous_file_path = preview_skeleton_group.userData.skeleton_type
    const previous_hand_type = preview_skeleton_group.userData.hand_skeleton_type
    if (previous_file_path === skeleton_type && previous_hand_type === hand_skeleton_type) {
      // Only update scale
      preview_skeleton_group.scale.set(skeleton_scale, skeleton_scale, skeleton_scale)

      // this path reuses a helper built by an earlier call, so the joint setting
      // has to be reapplied here. Leaving it to the constructor alone meant a
      // helper created while joints were on kept showing them
      const existing_helper = preview_skeleton_group.getObjectByName('preview_skeleton')
      if (existing_helper instanceof CustomSkeletonHelper) {
        existing_helper.setJointsVisible(show_joints)
      }

      // Return the first child (should be loaded_scene)
      return preview_skeleton_group.children[0]
    } else {
      // Remove old skeleton group
      remove_preview_skeleton(root)
    }
  }

  // Create new preview skeleton group
  preview_skeleton_group = new Group()
  preview_skeleton_group.name = skeleton_group_name
  // Store current skeleton info for future comparison
  preview_skeleton_group.userData.skeleton_type = skeleton_type
  preview_skeleton_group.userData.hand_skeleton_type = hand_skeleton_type
  root.add(preview_skeleton_group)

  // Resolve the rig file path from the central config
  const rig_file = RigConfig.rig_file_for(skeleton_type)
  if (rig_file === undefined) {
    throw new Error(`No rig file found for skeleton type: ${skeleton_type}`)
  }

  // Load and customize skeleton
  const loaded_scene: Object3D<Object3DEventMap> = await load_skeleton(rig_file)
  if (skeleton_type === SkeletonType.Human) {
    const helper = new HandHelper()
    helper.modify_hand_skeleton(loaded_scene, hand_skeleton_type)
  }
  // same custom helper used everywhere else, so the preview matches the
  // edit skeleton display instead of three's default line skeleton
  const skeleton_helper = new CustomSkeletonHelper(loaded_scene, { showJoints: show_joints })
  skeleton_helper.name = 'preview_skeleton'
  preview_skeleton_group.add(skeleton_helper)
  preview_skeleton_group.scale.set(skeleton_scale, skeleton_scale, skeleton_scale)
  root.add(preview_skeleton_group)
  return loaded_scene
}

async function load_skeleton (file_path: string): Promise<Object3D<Object3DEventMap>> {
  const loader = new GLTFLoader()
  const gltf: GLTF | GLTFResult = await loader.loadAsync(file_path)
  // If your GLTFResult extends GLTF and has `.scene`, this is fine:
  return gltf.scene as Object3D<Object3DEventMap>
}

// need a function that will remove the preview skeleton from the scene
export function remove_preview_skeleton (root: Scene): void {
  const skeleton_group = root.getObjectByName(skeleton_group_name)
  if (skeleton_group === undefined) {
    return
  }

  // the custom helper owns GPU resources (instance buffers, geometries,
  // materials) that have to be released explicitly when it leaves the scene
  const skeleton_helper = skeleton_group.getObjectByName('preview_skeleton')
  if (skeleton_helper instanceof CustomSkeletonHelper) {
    skeleton_helper.dispose()
  }

  if (skeleton_group.parent != null) {
    skeleton_group.parent.remove(skeleton_group)
  }
}
