import { type Object3D, type Texture } from 'three'

interface TextureExportState {
  flip_y: boolean
  repeat_y: number
  offset_y: number
}

function is_texture (value: unknown): value is Texture {
  return typeof value === 'object' && value !== null && (value as Texture).isTexture === true
}

function collect_materials (node: Object3D): Array<Record<string, unknown>> {
  const mesh_like = node as Object3D & { material?: unknown }
  if (mesh_like.material == null) {
    return []
  }

  if (Array.isArray(mesh_like.material)) {
    return mesh_like.material.filter((material): material is Record<string, unknown> => typeof material === 'object' && material !== null)
  }

  if (typeof mesh_like.material === 'object') {
    return [mesh_like.material as Record<string, unknown>]
  }

  return []
}

export class FbxTextureCompatibilityService {
  // FBX importers in three.js commonly assume textures are uploaded with flipY=true.
  // glTF textures are typically flipY=false, so we convert UV transform values for
  // FBX export and restore the original texture settings afterward.
  public static apply_flip_y_compatibility_for_fbx (root: Object3D): () => void {
    const textures_to_restore = new Map<Texture, TextureExportState>()

    root.traverse((node) => {
      const material_list = collect_materials(node)
      material_list.forEach((material) => {
        Object.values(material).forEach((value) => {
          if (!is_texture(value)) {
            return
          }

          const texture = value
          if (texture.flipY !== false) {
            return
          }

          const has_complex_uv_transform =
            texture.rotation !== 0 ||
            texture.center.x !== 0 ||
            texture.center.y !== 0 ||
            texture.matrixAutoUpdate === false

          if (has_complex_uv_transform) {
            return
          }

          if (!textures_to_restore.has(texture)) {
            textures_to_restore.set(texture, {
              flip_y: texture.flipY,
              repeat_y: texture.repeat.y,
              offset_y: texture.offset.y
            })
          }

          texture.repeat.y = -texture.repeat.y
          texture.offset.y = 1 - texture.offset.y
          texture.flipY = true
          texture.needsUpdate = true
        })
      })
    })

    return () => {
      textures_to_restore.forEach((state, texture) => {
        texture.flipY = state.flip_y
        texture.repeat.y = state.repeat_y
        texture.offset.y = state.offset_y
        texture.needsUpdate = true
      })
    }
  }
}
