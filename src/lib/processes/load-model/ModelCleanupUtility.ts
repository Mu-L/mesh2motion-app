import { Box3, type BufferGeometry, Group, Matrix4, type Object3DEventMap, type Object3D, Scene, Mesh, MeshPhongMaterial, type SkinnedMesh } from 'three'
import { FrontSide } from 'three/src/constants.js'

/**
 * Utility helpers to clean up and normalize loaded model geometry.
 */
export class ModelCleanupUtility {
  public static calculate_bounding_box (scene_object: Scene | Group<Object3DEventMap>): Box3 {
    let bounding_box: Box3 = new Box3()

    scene_object.traverse((child: Object3D) => {
      const test_bb = new Box3().setFromObject(child)
      if (test_bb.max.x - test_bb.min.x > bounding_box.max.x - bounding_box.min.x ||
          test_bb.max.y - test_bb.min.y > bounding_box.max.y - bounding_box.min.y ||
          test_bb.max.z - test_bb.min.z > bounding_box.max.z - bounding_box.min.z) {
        bounding_box = test_bb
      }
    })

    return bounding_box
  }

  public static scale_model_on_import_if_extreme (scene_object: Scene | Group<Object3DEventMap>): void {
    let scale_factor = 1.0

    const bounding_box = this.calculate_bounding_box(scene_object)
    const height = bounding_box.max.y - bounding_box.min.y
    const width = bounding_box.max.x - bounding_box.min.x
    const depth = bounding_box.max.z - bounding_box.min.z

    const largest_dimension = Math.max(height, width, depth)

    if (largest_dimension > 0.5 && largest_dimension < 20) {
      console.log('Model a reasonable size, so no scaling applied: ', bounding_box, ' units is bounding box')
      return
    } else {
      console.log('Model is very large or small, so scaling applied: ', bounding_box, ' units is bounding box')
    }

    scale_factor = 1.5 / largest_dimension

    scene_object.traverse((child) => {
      const child_obj = child as Mesh
      if (child_obj.geometry) {
        console.log('Scaling mesh:', child_obj, ' by factor of ', scale_factor)
        child_obj.geometry.scale(scale_factor, scale_factor, scale_factor)
        child_obj.geometry.computeBoundingBox()
        child_obj.geometry.computeBoundingSphere()
      }
    })
  }

  public static move_model_to_floor (mesh_data: Scene | Group<Object3DEventMap>): void {
    let final_lowest_point = Infinity
    mesh_data.traverse((obj: Object3D) => {
      if (obj.type === 'Mesh') {
        const mesh_obj: Mesh = obj as Mesh
        const bounding_box = new Box3().setFromObject(mesh_obj)

        if (bounding_box.min.y < final_lowest_point) {
          final_lowest_point = bounding_box.min.y
        }
      }
    })

    if (!isFinite(final_lowest_point) || final_lowest_point === 0) return

    mesh_data.traverse((obj: Object3D) => {
      if (obj.type === 'Mesh') {
        const mesh_obj: Mesh = obj as Mesh

        const offset = final_lowest_point * -1
        mesh_obj.geometry.translate(0, offset, 0)
        mesh_obj.geometry.computeBoundingBox()
        mesh_obj.geometry.computeBoundingSphere()
      }
    })
  }

  public static translate_model_vertices (
    mesh_data: Scene | Group<Object3DEventMap>,
    dx: number,
    dy: number,
    dz: number
  ): void {
    mesh_data.traverse((obj: Object3D) => {
      if (obj.type === 'Mesh') {
        const mesh_obj: Mesh = obj as Mesh
        mesh_obj.geometry.translate(dx, dy, dz)
        mesh_obj.geometry.computeBoundingBox()
        mesh_obj.geometry.computeBoundingSphere()
      }
    })
  }

  /**
   * Applies each mesh's world transform to its vertices, then clears every
   * transform in the hierarchy.
   *
   * The skinning process works from raw geometry and ignores object transforms,
   * so it needs those transforms to be identity. Baking gets us that without
   * throwing away the orientation, placement, and scale the model was authored
   * with, which is what happens if the transforms are simply reset to defaults.
   * @param model_data root of the hierarchy to flatten transforms on
   */
  public static bake_transforms_into_geometry (model_data: Object3D): void {
    model_data.updateMatrixWorld(true)

    // capture the world matrices up front, since clearing transforms below invalidates them
    const meshes_to_bake: Array<{ mesh: Mesh, world_matrix: Matrix4 }> = []
    model_data.traverse((child: Object3D) => {
      if (child.type === 'Mesh' || child.type === 'SkinnedMesh') {
        meshes_to_bake.push({ mesh: child as Mesh, world_matrix: child.matrixWorld.clone() })
      }
    })

    meshes_to_bake.forEach(({ mesh, world_matrix }) => {
      if (mesh.geometry === undefined || mesh.geometry === null) {
        return
      }

      // geometry can be shared between meshes that have different transforms,
      // so each mesh needs its own copy before we bake anything into it
      const baked_geometry: BufferGeometry = mesh.geometry.clone()
      baked_geometry.name = mesh.geometry.name
      baked_geometry.applyMatrix4(world_matrix)

      // a mirrored transform reverses triangle winding, which renders the mesh
      // inside out unless we put the winding back
      if (world_matrix.determinant() < 0) {
        this.flip_face_winding(baked_geometry)
      }

      baked_geometry.computeBoundingBox()
      baked_geometry.computeBoundingSphere()
      mesh.geometry = baked_geometry
    })

    // every transform is part of the geometry now, so none of them should apply twice
    model_data.traverse((child: Object3D) => {
      child.position.set(0, 0, 0)
      child.quaternion.identity()
      child.scale.set(1, 1, 1)
      child.updateMatrix()
    })

    model_data.updateMatrixWorld(true)
  }

  /** Reverses the vertex order of every triangle so faces point the other way. */
  private static flip_face_winding (geometry: BufferGeometry): void {
    const index = geometry.getIndex()

    if (index !== null) {
      for (let triangle_start = 0; triangle_start + 2 < index.count; triangle_start += 3) {
        const first_vertex: number = index.getX(triangle_start)
        index.setX(triangle_start, index.getX(triangle_start + 2))
        index.setX(triangle_start + 2, first_vertex)
      }
      index.needsUpdate = true
      return
    }

    // non-indexed geometry stores each triangle inline, so the outer vertices of
    // every triangle have to be swapped across every attribute to stay in sync
    Object.values(geometry.attributes).forEach((attribute) => {
      for (let triangle_start = 0; triangle_start + 2 < attribute.count; triangle_start += 3) {
        for (let component = 0; component < attribute.itemSize; component++) {
          const first_value: number = attribute.getComponent(triangle_start, component)
          attribute.setComponent(triangle_start, component, attribute.getComponent(triangle_start + 2, component))
          attribute.setComponent(triangle_start + 2, component, first_value)
        }
      }
      attribute.needsUpdate = true
    })
  }

  public static strip_out_all_unecessary_model_data (model_data: Scene, model_display_name: string, debug_model_loading: boolean): Scene {
    const new_scene = new Scene()
    new_scene.name = model_display_name

    model_data.traverse((child) => {
      let new_mesh: Mesh

      if (child.type === 'SkinnedMesh') {
        new_mesh = new Mesh((child as SkinnedMesh).geometry, (child as SkinnedMesh).material)
        new_mesh.name = child.name
        new_scene.add(new_mesh)
      } else if (child.type === 'Mesh') {
        // clone without children, otherwise a mesh nested under another mesh gets
        // added once as part of its parent's clone and again when traverse reaches it
        new_mesh = (child as Mesh).clone(false)
        new_mesh.name = child.name
        new_scene.add(new_mesh)
      }

      let material_to_use: MeshPhongMaterial
      if (debug_model_loading && new_mesh !== undefined) {
        material_to_use = new MeshPhongMaterial()
        material_to_use.side = FrontSide
        material_to_use.color.set(0x00aaee)
        new_mesh.material = material_to_use
      }
    })

    return new_scene
  }


  // NOT USED FOR NOW
  /**
   * We need to keep parents of skinned meshes and bones for retargeting
   * This is because the hierarchy is important for retargeting to work properly
   * @param model_data Scene or Group containing the model
   * @returns Scene with everything needed for retargeting (SkinnedMesh, Bones, and their parents)
   */
  public static strip_out_retargeting_model_data (model_data: Scene): Scene {
    // Create a new Scene to hold only the objects we want to keep
    const filtered_scene = new Scene()
    filtered_scene.name = 'Filtered Retargeting Data'

    // Find SkinnedMesh objects and preserve their complete bone hierarchy
    const skinned_meshes: SkinnedMesh[] = []
    model_data.traverse((child) => {
      if (child.type === 'SkinnedMesh') {
        skinned_meshes.push(child as SkinnedMesh)
      }
    })

    // For each SkinnedMesh, clone it along with its skeleton to preserve bone hierarchy
    skinned_meshes.forEach((skinned_mesh) => {
      // Clone the SkinnedMesh to avoid modifying the original
      const cloned_skinned_mesh = skinned_mesh.clone()

      // The clone should preserve the skeleton with proper bone hierarchy
      // Since we're cloning, the skeleton hierarchy should remain intact
      filtered_scene.add(cloned_skinned_mesh)
    })

    return filtered_scene
  }
}
