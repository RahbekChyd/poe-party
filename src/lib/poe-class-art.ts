import type { PoeGame } from './poe-game'
import { getAscendancyLabel } from './character-profile'
export const POE_CLASS_ART_DIRECTORIES = {
  classes: '/class-art/classes',
  ascendancies: '/class-art/ascendancies',
} as const

const CLASS_IMAGE_NAMES: Record<string, string> = {
  Marauder: 'Marauder',
  Ranger: 'Ranger',
  Witch: 'Witch',
  Duelist: 'Duelist',
  Templar: 'Templar',
  Shadow: 'Shadow',
  Scion: 'Scion',
}

const ASCENDANCY_IMAGE_NAMES: Record<string, string> = {
  Juggernaut: 'Juggernaut',
  Berserker: 'Berserker',
  Chieftain: 'Chieftain',
  Raider: 'Raider',
  Deadeye: 'Deadeye',
  Pathfinder: 'Pathfinder',
  Necromancer: 'Necromancer',
  Occultist: 'Occultist',
  Elementalist: 'Elementalist',
  Slayer: 'Slayer',
  Gladiator: 'Gladiator',
  Champion: 'Champion',
  Inquisitor: 'Inquisitor',
  Hierophant: 'Hierophant',
  Guardian: 'Guardian',
  Assassin: 'Assassin',
  Saboteur: 'Saboteur',
  Trickster: 'Trickster',
  Ascendant: 'Ascendant',
}

function buildAssetPath(directory: string, fileName: string): string {
  const baseUrl = import.meta.env.BASE_URL ?? '/'
  const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl
  return `${normalizedBaseUrl}${directory}/${fileName}.png`
}

export function getPoeClassImagePath(className: string | null): string | null {
  if (!className) return null
  const fileName = CLASS_IMAGE_NAMES[className]
  return fileName ? buildAssetPath(POE_CLASS_ART_DIRECTORIES.classes, fileName) : null
}

export function getPoeAscendancyImagePath(ascendancy: string | null): string | null {
  if (!ascendancy) return null
  const fileName = ASCENDANCY_IMAGE_NAMES[ascendancy]
  return fileName ? buildAssetPath(POE_CLASS_ART_DIRECTORIES.ascendancies, fileName) : null
}

export function getPoePortraitImagePath(
  className: string | null,
  ascendancyClass: number | null,
  game: PoeGame = 'poe1',
): string | null {
  const ascendancy = getAscendancyLabel(className, ascendancyClass, game)
  return getPoeAscendancyImagePath(ascendancy) ?? getPoeClassImagePath(className)
}
