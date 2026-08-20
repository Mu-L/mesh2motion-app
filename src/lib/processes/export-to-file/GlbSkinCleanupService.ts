/**
 * Fixes up the skins in a GLB produced by three's GLTFExporter.
 *
 * The exporter writes `skeleton.bones[0]` into each skin's optional `skeleton`
 * property, assuming the first bone is the root of the hierarchy. Rigs imported
 * from FBX list their bones in whatever order the skin clusters appear in the
 * file, so the first bone is usually some joint in the middle of the tree.
 * Validators then reject the file with "SKIN_SKELETON_INVALID: Skeleton node is
 * not a common root". The property is only a hint (viewers skin entirely from
 * `joints` + `inverseBindMatrices`), so the safe fix is to drop it.
 */
export class GlbSkinCleanupService {
  private static readonly GLB_HEADER_BYTES = 12
  private static readonly CHUNK_HEADER_BYTES = 8
  private static readonly GLB_MAGIC = 0x46546C67 // 'glTF'
  private static readonly JSON_CHUNK_TYPE = 0x4E4F534A // 'JSON'

  /**
   * @param glb a binary glTF file as produced by GLTFExporter
   * @returns a new GLB with every skin's `skeleton` property removed, or the
   * original buffer untouched when there is nothing to remove
   */
  public static remove_skin_skeleton_properties (glb: ArrayBuffer): ArrayBuffer {
    const min_length = this.GLB_HEADER_BYTES + this.CHUNK_HEADER_BYTES
    if (glb.byteLength < min_length) {
      return glb
    }

    const view = new DataView(glb)
    if (view.getUint32(0, true) !== this.GLB_MAGIC) {
      return glb
    }

    // the JSON chunk is required to be first in a GLB
    const json_chunk_length = view.getUint32(this.GLB_HEADER_BYTES, true)
    const json_chunk_type = view.getUint32(this.GLB_HEADER_BYTES + 4, true)
    const json_start = min_length

    if (json_chunk_type !== this.JSON_CHUNK_TYPE || json_start + json_chunk_length > glb.byteLength) {
      return glb
    }

    const json_bytes = new Uint8Array(glb, json_start, json_chunk_length)
    const gltf = JSON.parse(new TextDecoder().decode(json_bytes)) as { skins?: Array<Record<string, unknown>> }

    const skins = gltf.skins
    if (!Array.isArray(skins) || !skins.some((skin) => 'skeleton' in skin)) {
      return glb
    }

    skins.forEach((skin) => {
      delete skin.skeleton
    })

    return this.replace_json_chunk(glb, view, json_start, json_chunk_length, gltf)
  }

  private static replace_json_chunk (
    glb: ArrayBuffer,
    view: DataView,
    json_start: number,
    json_chunk_length: number,
    gltf: object
  ): ArrayBuffer {
    const encoded_json = new TextEncoder().encode(JSON.stringify(gltf))

    // the spec requires the JSON chunk to be padded to 4 bytes with spaces
    const padded_length = Math.ceil(encoded_json.byteLength / 4) * 4
    const padded_json = new Uint8Array(padded_length).fill(0x20)
    padded_json.set(encoded_json)

    // everything after the JSON chunk (the BIN chunk) is carried over verbatim
    const remaining_chunks = new Uint8Array(glb, json_start + json_chunk_length)
    const total_length = json_start + padded_length + remaining_chunks.byteLength

    const output = new ArrayBuffer(total_length)
    const output_bytes = new Uint8Array(output)
    const output_view = new DataView(output)

    output_view.setUint32(0, this.GLB_MAGIC, true)
    output_view.setUint32(4, view.getUint32(4, true), true) // glTF version
    output_view.setUint32(8, total_length, true)
    output_view.setUint32(this.GLB_HEADER_BYTES, padded_length, true)
    output_view.setUint32(this.GLB_HEADER_BYTES + 4, this.JSON_CHUNK_TYPE, true)
    output_bytes.set(padded_json, json_start)
    output_bytes.set(remaining_chunks, json_start + padded_length)

    return output
  }
}
