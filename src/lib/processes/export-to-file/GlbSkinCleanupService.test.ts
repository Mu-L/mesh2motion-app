import { describe, it, expect } from 'vitest'
import { BoxGeometry, Bone, Float32BufferAttribute, MeshBasicMaterial, Mesh, Scene, Skeleton, SkinnedMesh, Uint16BufferAttribute } from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { GlbSkinCleanupService } from './GlbSkinCleanupService'

/**
 * Builds a rig the way an imported FBX file produces one: the bone list starts
 * with a joint from the middle of the hierarchy, not the root. GLTFExporter
 * writes bones[0] as the skin's `skeleton`, which is what validators reject
 * with SKIN_SKELETON_INVALID.
 */
function make_scene_with_unordered_bones (): Scene {
  const scene = new Scene()

  const hips = new Bone()
  hips.name = 'Hips'
  const spine = new Bone()
  spine.name = 'Spine'
  hips.add(spine)

  const geometry = new BoxGeometry(1, 1, 1)
  const vertex_count = geometry.attributes.position.count
  geometry.setAttribute('skinIndex', new Uint16BufferAttribute(new Uint16Array(vertex_count * 4), 4))
  geometry.setAttribute('skinWeight', new Float32BufferAttribute(
    Float32Array.from({ length: vertex_count * 4 }, (_, index) => (index % 4 === 0 ? 1 : 0)), 4))

  const skinned_mesh = new SkinnedMesh(geometry, new MeshBasicMaterial())
  skinned_mesh.name = 'Body'
  skinned_mesh.add(hips)
  skinned_mesh.bind(new Skeleton([spine, hips]))
  scene.add(skinned_mesh)

  return scene
}

async function export_glb (scene: Scene): Promise<ArrayBuffer> {
  const result = await new GLTFExporter().parseAsync(scene, { binary: true, onlyVisible: false })
  return result as ArrayBuffer
}

interface ParsedGlb {
  declared_length: number
  json: { skins?: Array<Record<string, unknown>> }
  remaining_bytes: Uint8Array
}

function parse_glb (glb: ArrayBuffer): ParsedGlb {
  const view = new DataView(glb)
  expect(view.getUint32(0, true)).toBe(0x46546C67) // 'glTF'
  expect(view.getUint32(4, true)).toBe(2)

  const json_length = view.getUint32(12, true)
  expect(view.getUint32(16, true)).toBe(0x4E4F534A) // 'JSON'

  return {
    declared_length: view.getUint32(8, true),
    json: JSON.parse(new TextDecoder().decode(new Uint8Array(glb, 20, json_length))),
    remaining_bytes: new Uint8Array(glb, 20 + json_length)
  }
}

describe('GlbSkinCleanupService.remove_skin_skeleton_properties', () => {
  it('removes the skeleton property the exporter wrote from a non-root bone', async () => {
    const exported = await export_glb(make_scene_with_unordered_bones())
    expect(parse_glb(exported).json.skins?.[0]).toHaveProperty('skeleton')

    const cleaned = parse_glb(GlbSkinCleanupService.remove_skin_skeleton_properties(exported))

    expect(cleaned.json.skins).toHaveLength(1)
    expect(cleaned.json.skins?.[0]).not.toHaveProperty('skeleton')
    expect(cleaned.json.skins?.[0].joints).toHaveLength(2)
  })

  it('keeps the file structurally valid after rewriting the JSON chunk', async () => {
    const exported = await export_glb(make_scene_with_unordered_bones())

    const cleaned_buffer = GlbSkinCleanupService.remove_skin_skeleton_properties(exported)
    const cleaned = parse_glb(cleaned_buffer)

    expect(cleaned.declared_length).toBe(cleaned_buffer.byteLength)
    expect(cleaned_buffer.byteLength % 4).toBe(0)

    // the binary chunk must be carried over byte for byte
    expect(cleaned.remaining_bytes).toEqual(parse_glb(exported).remaining_bytes)
  })

  it('returns the buffer untouched when the file has no skins', async () => {
    const scene = new Scene()
    scene.add(new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial()))
    const exported = await export_glb(scene)

    expect(GlbSkinCleanupService.remove_skin_skeleton_properties(exported)).toBe(exported)
  })

  it('returns non-GLB data untouched', () => {
    const not_a_glb = new TextEncoder().encode('{"not":"a glb file"}').buffer as ArrayBuffer

    expect(GlbSkinCleanupService.remove_skin_skeleton_properties(not_a_glb)).toBe(not_a_glb)
  })
})
