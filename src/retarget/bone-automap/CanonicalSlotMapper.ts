import { type BoneMetadata, BoneSlot } from './BoneTypes'
import { is_proportional_chain_slot } from './BoneSlotVocabulary'

/**
 * CanonicalSlotMapper - matches two skeletons by canonical joint slot rather than
 * by bone name.
 *
 * Once BoneChainResolver has reduced every bone to (slot, side, ordinal), mapping
 * is a join on that key. Chains of unequal length - a 4-bone spine against
 * Mesh2Motion's 3, or a 3-segment finger against its 4 - are paired instead of
 * dropped, which is what stops an entire torso going unmapped over an off-by-one.
 */
export class CanonicalSlotMapper {
  /**
   * @param source_bones - Mesh2Motion skeleton metadata
   * @param target_bones - uploaded skeleton metadata
   * @param existing_mappings - mappings already made; bones used on either side are
   *                            left out of the chain pairing entirely, so a chain of
   *                            three with one bone already spoken for is paired as a
   *                            chain of two rather than being double-assigned
   * @returns Map of target bone name -> source bone name, including the existing ones
   */
  static map_bones (
    source_bones: BoneMetadata[],
    target_bones: BoneMetadata[],
    existing_mappings: Map<string, string> = new Map()
  ): Map<string, string> {
    const mappings = new Map<string, string>(existing_mappings)
    const used_source_names = new Set<string>(mappings.values())

    const source_groups = CanonicalSlotMapper.group_by_slot(
      source_bones.filter(bone => !used_source_names.has(bone.name))
    )
    const target_groups = CanonicalSlotMapper.group_by_slot(
      target_bones.filter(bone => !mappings.has(bone.name))
    )

    for (const [group_key, target_group] of target_groups) {
      const source_group: BoneMetadata[] | undefined = source_groups.get(group_key)
      if (source_group === undefined || source_group.length === 0) continue

      const pairs: Array<[number, number]> = CanonicalSlotMapper.pair_chains(
        source_group.length, target_group.length, target_group[0].slot
      )

      for (const [source_index, target_index] of pairs) {
        mappings.set(target_group[target_index].name, source_group[source_index].name)
      }
    }

    return mappings
  }

  /**
   * Bucket bones by "slot|side" and order each bucket from the root outward.
   * Unknown slots are dropped - an unrecognised, twist or IK bone is left unmapped
   * on purpose rather than guessed at.
   */
  private static group_by_slot (bones: BoneMetadata[]): Map<string, BoneMetadata[]> {
    const groups = new Map<string, BoneMetadata[]>()

    for (const bone of bones) {
      if (bone.slot === BoneSlot.Unknown) continue
      const key = `${bone.slot}|${bone.side}`
      const group: BoneMetadata[] = groups.get(key) ?? []
      group.push(bone)
      groups.set(key, group)
    }

    for (const group of groups.values()) {
      group.sort((a, b) => a.slot_ordinal - b.slot_ordinal)
    }

    return groups
  }

  /**
   * Decide which source chain link drives which target chain link.
   * Returns [source_index, target_index] pairs, each index used at most once.
   *
   * Spine/tail/wing chains are spread evenly, because a 5-segment tail driven by a
   * 3-segment one should bend along its whole length. Limbs and fingers align from
   * the root instead: the first knuckle is the first knuckle regardless of how many
   * segments follow it, and any extra tip segments are simply left unmapped.
   */
  private static pair_chains (
    source_count: number, target_count: number, slot: BoneSlot
  ): Array<[number, number]> {
    const pair_count: number = Math.min(source_count, target_count)
    const pairs: Array<[number, number]> = []

    if (pair_count === 0) return pairs

    if (pair_count === 1) {
      return [[0, 0]]
    }

    if (is_proportional_chain_slot(slot)) {
      for (let k = 0; k < pair_count; k++) {
        const ratio: number = k / (pair_count - 1)
        pairs.push([
          Math.round(ratio * (source_count - 1)),
          Math.round(ratio * (target_count - 1))
        ])
      }
      return pairs
    }

    for (let k = 0; k < pair_count; k++) {
      pairs.push([k, k])
    }

    return pairs
  }
}
