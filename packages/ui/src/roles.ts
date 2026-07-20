import type { DroneSpec } from '@opticone/shared'

/**
 * Battlefield role labels: a colored tag plus one plain sentence saying what
 * the unit is for. Damage figures mirror C-03 tuning (600 dmg per payload
 * kg for kamikazes, 1500 per guided bomb) at display level only.
 */

export type RoleTag = 'RECON' | 'STRIKE' | 'SIEGE' | 'BOMBER' | 'JET' | 'MINER' | 'CARGO'

export interface DroneRole {
  tag: RoleTag
  text: string
}

export function droneRole(spec: DroneSpec): DroneRole {
  switch (spec.id) {
    case 'mavic3':
      return { tag: 'RECON', text: 'Scout. Wide sensor sweep reveals the fog. No weapon.' }
    case 'fpv-strike':
      return { tag: 'STRIKE', text: 'Cheap kamikaze. Dives into its target for 480 damage.' }
    case 'switchblade300':
      return { tag: 'STRIKE', text: 'Precision loitering munition. 44 m/s dash, 180 damage.' }
    case 'shahed136':
      return { tag: 'SIEGE', text: 'Heavy delta wing. One hit levels any building (24k damage).' }
    case 'tb2':
      return { tag: 'BOMBER', text: 'Drops up to 6 guided bombs (1.5k damage) from 1.5 km out.' }
    case 'xq58-valkyrie':
      return { tag: 'JET', text: 'Turbofan strike wing. 247 m/s dash, drops a full bay of guided bombs.' }
    case 'flycart30':
      return { tag: 'CARGO', text: 'Hauls 30 kg ore loads from nodes to base. Unarmed.' }
    case 'ore-miner':
      return { tag: 'MINER', text: 'Harvests lithium and oil, 20 kg per trip. Your economy.' }
  }
  // Player-uploaded specs fall back by class.
  switch (spec.class) {
    case 'multirotor':
      return spec.payloadKg > 0
        ? { tag: 'STRIKE', text: `Kamikaze quad, ${Math.round(spec.payloadKg * 600)} damage on contact.` }
        : { tag: 'RECON', text: 'Scout quad. Reveals the fog, carries no weapon.' }
    case 'loitering-munition':
      return { tag: 'STRIKE', text: `Loitering munition, ${Math.round(spec.payloadKg * 600)} damage on impact.` }
    case 'fixed-wing':
      if (spec.cruiseMps > 90) {
        return { tag: 'JET', text: 'Jet-powered strike wing. Fast standoff bombing runs.' }
      }
      return spec.payloadKg > 0
        ? { tag: 'BOMBER', text: 'Fixed wing. Drops guided bombs from standoff range.' }
        : { tag: 'RECON', text: 'Long-endurance fixed-wing scout.' }
    case 'cargo':
      return { tag: 'CARGO', text: `Hauls ${spec.payloadKg} kg ore loads. Unarmed.` }
    case 'mining':
      return { tag: 'MINER', text: `Harvests resource nodes, ${spec.payloadKg} kg per trip.` }
  }
}
