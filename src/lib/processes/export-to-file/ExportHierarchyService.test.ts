import { describe, it, expect } from 'vitest'
import { BoxGeometry, Bone, Float32BufferAttribute, Group, MeshBasicMaterial, Scene, Skeleton, SkinnedMesh, Uint16BufferAttribute } from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { ExportHierarchyService } from './ExportHierarchyService'

interface TestRig {
  scene: Scene
  skinned_mesh: SkinnedMesh
  hips: Bone
  spine: Bone
}

function make_skinned_mesh (bones: Bone[]): SkinnedMesh {
  const geometry = new BoxGeometry(1, 1, 1)
  const vertex_count = geometry.attributes.position.count

  geometry.setAttribute('skinIndex', new Uint16BufferAttribute(new Uint16Array(vertex_count * 4), 4))
  geometry.setAttribute('skinWeight', new Float32BufferAttribute(
    Float32Array.from({ length: vertex_count * 4 }, (_, index) => (index % 4 === 0 ? 1 : 0)), 4))

  const skinned_mesh = new SkinnedMesh(geometry, new MeshBasicMaterial())
  skinned_mesh.name = 'Body'
  skinned_mesh.bind(new Skeleton(bones))
  return skinned_mesh
}

/** How an imported FBX rig is laid out: the bones are siblings of the mesh. */
function make_imported_rig (): TestRig {
  const scene = new Scene()
  const model_root = new Group()
  model_root.name = 'FBX Root'
  scene.add(model_root)

  const hips = new Bone()
  hips.name = 'Hips'
  const spine = new Bone()
  spine.name = 'Spine'
  hips.add(spine)
  model_root.add(hips)

  const skinned_mesh = make_skinned_mesh([hips, spine])
  model_root.add(skinned_mesh)

  return { scene, skinned_mesh, hips, spine }
}

/** How a mesh rigged in Mesh2Motion is laid out: the root bone is a child of the mesh. */
function make_mesh2motion_rig (): TestRig {
  const scene = new Scene()

  const hips = new Bone()
  hips.name = 'Hips'
  const spine = new Bone()
  spine.name = 'Spine'
  hips.add(spine)

  const skinned_mesh = make_skinned_mesh([hips, spine])
  skinned_mesh.add(hips)
  scene.add(skinned_mesh)

  return { scene, skinned_mesh, hips, spine }
}

interface ExportedGltf {
  skins: Array<{ joints: Array<number | null> }>
}

async function export_gltf (scene: Scene): Promise<ExportedGltf> {
  const gltf = await new GLTFExporter().parseAsync(scene, { binary: false, onlyVisible: false })
  return gltf as unknown as ExportedGltf
}

describe('ExportHierarchyService.collect_objects_to_export', () => {
  it('keeps an imported rig together with its bones', () => {
    const { scene, skinned_mesh } = make_imported_rig()

    const objects = ExportHierarchyService.collect_objects_to_export([skinned_mesh], false)

    // the mesh and the bones share a parent, so the whole subtree moves as one object
    expect(objects).toEqual([scene.children[0]])
  })

  it('moves only the meshes when the bones already hang off them', () => {
    const { skinned_mesh } = make_mesh2motion_rig()

    const objects = ExportHierarchyService.collect_objects_to_export([skinned_mesh], false)

    expect(objects).toEqual([skinned_mesh])
  })

  it('leaves the mesh behind for a skeleton-only export', () => {
    const { skinned_mesh, hips } = make_imported_rig()

    const objects = ExportHierarchyService.collect_objects_to_export([skinned_mesh], true)

    expect(objects).toEqual([hips])
  })

  it('finds the root bone when the bone list is not in hierarchical order', () => {
    const { skinned_mesh, hips, spine } = make_imported_rig()
    skinned_mesh.bind(new Skeleton([spine, hips]))

    expect(ExportHierarchyService.collect_objects_to_export([skinned_mesh], true)).toEqual([hips])
  })
})

describe('exported glTF skins', () => {
  it('writes a joint for every bone of an imported rig', async () => {
    const { skinned_mesh } = make_imported_rig()
    const export_scene = new Scene()

    ExportHierarchyService.collect_objects_to_export([skinned_mesh], false)
      .forEach((object) => export_scene.add(object))

    const gltf = await export_gltf(export_scene)

    // a null joint here is what makes viewers reject the file with
    // "/skins/0/joints/null: failed to find index (null)"
    expect(gltf.skins[0].joints).toHaveLength(2)
    expect(gltf.skins[0].joints.some((joint) => joint === null || joint === undefined)).toBe(false)
  })
})
