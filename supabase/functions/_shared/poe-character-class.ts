import { normalizePoeGame, type PoeGame } from './poe-game.ts'

const POE1_ASCENDANCY_NAME_TO_BASE: Record<
  string,
  { className: string; ascendancyClass: number }
> = {
  Juggernaut: { className: 'Marauder', ascendancyClass: 1 },
  Berserker: { className: 'Marauder', ascendancyClass: 2 },
  Chieftain: { className: 'Marauder', ascendancyClass: 3 },
  Raider: { className: 'Ranger', ascendancyClass: 1 },
  Deadeye: { className: 'Ranger', ascendancyClass: 2 },
  Pathfinder: { className: 'Ranger', ascendancyClass: 3 },
  Necromancer: { className: 'Witch', ascendancyClass: 1 },
  Occultist: { className: 'Witch', ascendancyClass: 2 },
  Elementalist: { className: 'Witch', ascendancyClass: 3 },
  Slayer: { className: 'Duelist', ascendancyClass: 1 },
  Gladiator: { className: 'Duelist', ascendancyClass: 2 },
  Champion: { className: 'Duelist', ascendancyClass: 3 },
  Inquisitor: { className: 'Templar', ascendancyClass: 1 },
  Hierophant: { className: 'Templar', ascendancyClass: 2 },
  Guardian: { className: 'Templar', ascendancyClass: 3 },
  Assassin: { className: 'Shadow', ascendancyClass: 1 },
  Saboteur: { className: 'Shadow', ascendancyClass: 2 },
  Trickster: { className: 'Shadow', ascendancyClass: 3 },
  Ascendant: { className: 'Scion', ascendancyClass: 1 },
}

export function normalizeCharacterClassInfo(
  gameOrClassName: PoeGame | string | null | undefined,
  classNameOrAscendancyClass: string | number | null | undefined,
  maybeAscendancyClass?: number | null | undefined,
): {
  className: string | null
  ascendancyClass: number
} {
  const hasExplicitGame = gameOrClassName === 'poe1' || gameOrClassName === 'poe2'
  const game = normalizePoeGame(hasExplicitGame ? gameOrClassName : 'poe1')
  const className = hasExplicitGame ? classNameOrAscendancyClass : gameOrClassName
  const ascendancyClass = hasExplicitGame ? maybeAscendancyClass : classNameOrAscendancyClass

  const normalizedClassName =
    typeof className === 'string' && className.trim() ? className.trim() : null
  const normalizedAscendancy =
    typeof ascendancyClass === 'number' && Number.isFinite(ascendancyClass) ? ascendancyClass : 0

  if (!normalizedClassName) {
    return {
      className: null,
      ascendancyClass: normalizedAscendancy,
    }
  }

  if (game !== 'poe1') {
    return {
      className: normalizedClassName,
      ascendancyClass: normalizedAscendancy,
    }
  }

  const ascendancyMatch = POE1_ASCENDANCY_NAME_TO_BASE[normalizedClassName]
  if (!ascendancyMatch) {
    return {
      className: normalizedClassName,
      ascendancyClass: normalizedAscendancy,
    }
  }

  return {
    className: ascendancyMatch.className,
    ascendancyClass:
      normalizedAscendancy > 0 ? normalizedAscendancy : ascendancyMatch.ascendancyClass,
  }
}
