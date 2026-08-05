import { type Object3D, type Texture } from 'three'

interface TextureExportState {
  flip_y: boolean
  repeat_y: number
  offset_y: number
}

/**
 * FBX exporters in three.js commonly assume textures are uploaded with flipY=true.
 * glTF textures are typically flipY=false, so this service converts UV transform
 * values for FBX export in the constructor and restores original values with restore().
 */
export class FbxTextureCompatibilityService {
  private readonly textures_to_restore = new Map<Texture, TextureExportState>()

  constructor (root: Object3D) {
    root.traverse((node) => {
      const material_list = this.collect_materials(node)
      material_list.forEach((material) => {
        Object.values(material).forEach((value) => {
          if (!this.is_texture(value)) {
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

          if (!this.textures_to_restore.has(texture)) {
            // Save original values only once per texture so shared textures
            // can be mutated for export and restored exactly once.
            this.textures_to_restore.set(texture, {
              flip_y: texture.flipY,
              repeat_y: texture.repeat.y,
              offset_y: texture.offset.y
            })
          }

          // flipY conversion for FBX path:
          // if v' = 1 - v, then `repeat.y` is negated and `offset.y` is shifted
          // so the final sampled UVs match the original visual output.
          texture.repeat.y = -texture.repeat.y
          texture.offset.y = 1 - texture.offset.y
          texture.flipY = true
          texture.needsUpdate = true
        })
      })
    })
  }

  /**
   * Restores the original texture values for all textures that were modified for FBX export.
   */
  public restore (): void {
    this.textures_to_restore.forEach((state, texture) => {
      texture.flipY = state.flip_y
      texture.repeat.y = state.repeat_y
      texture.offset.y = state.offset_y
      texture.needsUpdate = true
    })
  }

  /**
   * Determines whether the given value is a Texture object.
   * @param value an unknown value that comes in that we will verify if the object is a texture
   * @returns true if the value is a Texture object, false otherwise
   */
  private is_texture (value: unknown): value is Texture {
    return typeof value === 'object' && value !== null && (value as Texture).isTexture === true
  }

  /**
   *  Collects all materials from the given node and its descendants.
   * @param node the Object3D node to collect materials from
   * @returns an array of material objects found on the node and its descendants
   */
  private collect_materials (node: Object3D): Array<Record<string, unknown>> {
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
}
