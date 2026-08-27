import { type BoneMetadata, BoneSide } from './BoneTypes'

/**
 * BoneCategoryMapper - name-based matching, run either side of CanonicalSlotMapper.
 *
 * Two passes, deliberately separated:
 *   - exact: the two rigs use literally the same bone name. Runs BEFORE the slot
 *     pass, because nothing the vocabulary infers should override two rigs simply
 *     agreeing - this is what keeps the animal skeletons, which already share
 *     Mesh2Motion's naming, mapping exactly as they did before.
 *   - loose: same name modulo case, separators and prefixes. Runs AFTER the slot
 *     pass, to catch bones whose anatomy the vocabulary has no word for.
 *
 * This used to be seven near-identical per-category methods, each carrying a
 * "TODO: add category-specific matching logic here". The logic those were waiting
 * for now lives in BoneSlotVocabulary / BoneChainResolver instead.
 */
export class BoneCategoryMapper {
  /**
   * Match target bones to source bones with the exact same name.
   * @returns a new map: the existing mappings plus whatever this pass added
   */
  static match_exact_names (
    source_bones: BoneMetadata[],
    target_bones: BoneMetadata[],
    existing_mappings: Map<string, string>
  ): Map<string, string> {
    return BoneCategoryMapper.match(
      source_bones, target_bones, existing_mappings,
      (source, target) => source.name === target.name
    )
  }

  /**
   * Match remaining target bones by normalized name, but only across compatible
   * sides so a left bone is never handed a right bone's animation.
   * @returns a new map: the existing mappings plus whatever this pass added
   */
  static match_loose_names (
    source_bones: BoneMetadata[],
    target_bones: BoneMetadata[],
    existing_mappings: Map<string, string>
  ): Map<string, string> {
    return BoneCategoryMapper.match(
      source_bones, target_bones, existing_mappings,
      (source, target) =>
        source.normalized_name === target.normalized_name &&
        BoneCategoryMapper.sides_compatible(source.side, target.side)
    )
  }

  /**
   * Shared body of both passes. Skips any target already mapped and any source
   * already used, so passes compose in any order without double-assigning a bone.
   */
  private static match (
    source_bones: BoneMetadata[],
    target_bones: BoneMetadata[],
    existing_mappings: Map<string, string>,
    is_match: (source: BoneMetadata, target: BoneMetadata) => boolean
  ): Map<string, string> {
    const mappings = new Map<string, string>(existing_mappings)
    const used_source_names = new Set<string>(mappings.values())

    for (const target_bone of target_bones) {
      if (mappings.has(target_bone.name)) continue

      const match: BoneMetadata | undefined = source_bones.find(
        source_bone => !used_source_names.has(source_bone.name) && is_match(source_bone, target_bone)
      )

      if (match !== undefined) {
        mappings.set(target_bone.name, match.name)
        used_source_names.add(match.name)
      }
    }

    return mappings
  }

  private static sides_compatible (a: BoneSide, b: BoneSide): boolean {
    if (a === b) return true

    // Unknown means the name carried no side marker, so it pairs with anything
    if (a === BoneSide.Unknown || b === BoneSide.Unknown) return true

    // a midline bone must not be paired with a left or right one
    return false
  }
}
