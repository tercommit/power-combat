/**
 * Simulation du combat. Pure et déterministe : stepSim(état, intentions) donne
 * toujours le même résultat, sans dépendre du temps réel ni du rendu.
 */
import { CHARACTERS } from '../characters';
import type { CharacterId, FighterState, Intent, MoveData, SimState } from './types';

/** Demi-largeur jouable de l'arène (murs invisibles). */
export const ARENA_HALF_WIDTH = 6;
export const MAX_HP = 1000;
export const MAX_GUARD = 100;
export const ROUND_FRAMES = 99 * 60;
export const WINS_NEEDED = 2;

const START_X = 1.5;
/** Distance minimale entre les centres (pushbox). */
const MIN_DISTANCE = 0.75;
const FRICTION = 0.8;
const GUARD_REGEN_DELAY = 60;
const GUARD_BROKEN_FRAMES = 60;
const MIN_DAMAGE_SCALE = 0.3;

const INTRO_FRAMES = 100;
const FIGHT_ANNOUNCE_FRAME = 60;
const ROUND_END_FRAMES = 160;
const MATCH_END_FRAMES = 240;

/** Hauteur d'impact (pour les effets visuels). */
const IMPACT_Y = { high: 1.55, mid: 1.15, low: 0.35 };

function createFighter(character: CharacterId, x: number, wins = 0): FighterState {
  return {
    character,
    x,
    y: 0,
    vx: 0,
    facing: x < 0 ? 1 : -1,
    hp: MAX_HP,
    guard: MAX_GUARD,
    guardRegenDelay: 0,
    action: 'idle',
    actionFrame: 0,
    stun: 0,
    move: null,
    moveHit: false,
    blockHeight: 'high',
    hitHeight: 'mid',
    walkDir: 0,
    comboTaken: 0,
    flash: 0,
    wins,
  };
}

export function createInitialState(match = 0): SimState {
  return {
    frame: 0,
    match,
    round: 1,
    phase: 'intro',
    phaseFrame: 0,
    timer: ROUND_FRAMES,
    hitstop: 0,
    roundWinner: null,
    fighters: [createFighter('kai', -START_X), createFighter('brick', START_X)],
    events: [],
  };
}

export function moveOf(f: FighterState): MoveData | null {
  return f.move ? CHARACTERS[f.character].moves[f.move] : null;
}

function isActionable(f: FighterState): boolean {
  return f.action === 'idle' || f.action === 'walk' || f.action === 'block';
}

function startAttack(f: FighterState, move: Intent['attack']): void {
  f.action = 'attack';
  f.move = move;
  f.actionFrame = 0;
  f.moveHit = false;
  f.walkDir = 0;
}

/** Un coup léger qui a touché peut être annulé par un coup lourd (enchaînement). */
function canChain(f: FighterState, next: Intent['attack']): boolean {
  const move = moveOf(f);
  return (
    f.action === 'attack' &&
    f.moveHit &&
    move !== null &&
    (f.move === 'lp' || f.move === 'lk') &&
    (next === 'hp' || next === 'hk') &&
    f.actionFrame >= move.startup
  );
}

function updateFighter(f: FighterState, intent: Intent, canAct: boolean): void {
  if (f.flash > 0) f.flash--;
  if (f.guardRegenDelay > 0) f.guardRegenDelay--;
  else if (f.action !== 'guardBroken') f.guard = Math.min(MAX_GUARD, f.guard + 1);

  switch (f.action) {
    case 'attack': {
      const move = moveOf(f)!;
      if (canAct && intent.attack && canChain(f, intent.attack)) {
        startAttack(f, intent.attack);
        break;
      }
      f.actionFrame++;
      if (f.actionFrame >= move.startup + move.active + move.recovery) toIdle(f);
      break;
    }
    case 'hitstun':
    case 'blockstun':
    case 'guardBroken':
      f.actionFrame++;
      if (f.actionFrame >= f.stun) {
        if (f.action === 'guardBroken') f.guard = MAX_GUARD;
        toIdle(f);
      }
      break;
    case 'ko':
    case 'victory':
      f.actionFrame++;
      break;
    default:
      if (!canAct) {
        toIdle(f);
      } else if (intent.attack) {
        startAttack(f, intent.attack);
      } else if (intent.block !== 'none') {
        f.action = 'block';
        f.blockHeight = intent.block;
        f.walkDir = 0;
      } else if (intent.move !== 0) {
        f.action = 'walk';
        f.walkDir = intent.move;
        const speed =
          intent.move === 1 ? CHARACTERS[f.character].walkSpeed : CHARACTERS[f.character].backSpeed;
        f.x += speed * intent.move * f.facing;
      } else {
        toIdle(f);
      }
  }

  f.x += f.vx;
  f.vx *= FRICTION;
  if (Math.abs(f.vx) < 0.001) f.vx = 0;
}

function toIdle(f: FighterState): void {
  if (f.action === 'hitstun') f.comboTaken = 0;
  f.action = 'idle';
  f.actionFrame = 0;
  f.move = null;
  f.walkDir = 0;
}

function clampToArena(x: number): number {
  return Math.min(Math.max(x, -ARENA_HALF_WIDTH), ARENA_HALF_WIDTH);
}

/** Empêche les combattants de se traverser et de sortir de l'arène. */
function resolvePositions(s: SimState): void {
  const [a, b] = s.fighters;
  const overlap = MIN_DISTANCE - Math.abs(b.x - a.x);
  if (overlap > 0) {
    const dir = b.x >= a.x ? 1 : -1;
    a.x -= (overlap / 2) * dir;
    b.x += (overlap / 2) * dir;
  }
  for (const f of s.fighters) f.x = clampToArena(f.x);
  // Si l'un est collé au mur, c'est l'autre qui recule.
  const gap = MIN_DISTANCE - Math.abs(b.x - a.x);
  if (gap > 0) {
    const dir = b.x >= a.x ? 1 : -1;
    if (Math.abs(a.x) >= ARENA_HALF_WIDTH) b.x += gap * dir;
    else a.x -= gap * dir;
  }
  for (const f of s.fighters) {
    if (isActionable(f)) f.facing = f === a ? (a.x <= b.x ? 1 : -1) : b.x < a.x ? 1 : -1;
  }
}

function blocks(defender: FighterState, move: MoveData): boolean {
  if (defender.action !== 'block' && defender.action !== 'blockstun') return false;
  if (move.height === 'mid') return true;
  return (move.height === 'low') === (defender.blockHeight === 'low');
}

/**
 * Teste si le coup de `attacker` touche `defender` pendant cette frame.
 * L'attaquant est lu dans `before` (état avant impacts) pour que l'ordre de test
 * ne favorise aucun joueur.
 */
function checkHit(s: SimState, before: SimState['fighters'], attackerIdx: 0 | 1): void {
  const attacker = before[attackerIdx];
  const defender = s.fighters[attackerIdx === 0 ? 1 : 0];
  const move = moveOf(attacker);
  if (attacker.action !== 'attack' || !move || attacker.moveHit) return;
  if (attacker.actionFrame < move.startup || attacker.actionFrame >= move.startup + move.active)
    return;
  if (defender.action === 'ko') return;
  const dx = (defender.x - attacker.x) * attacker.facing;
  if (dx < 0 || dx > move.reach) return;

  s.fighters[attackerIdx].moveHit = true;
  const impact = {
    attacker: attackerIdx,
    x: attacker.x + attacker.facing * Math.min(dx, move.reach) * 0.7,
    y: IMPACT_Y[move.height],
  };

  if (blocks(defender, move)) {
    defender.action = 'blockstun';
    defender.actionFrame = 0;
    defender.stun = move.blockstun;
    defender.vx = attacker.facing * move.knockback * 0.6;
    defender.guard -= move.guardCost;
    defender.guardRegenDelay = GUARD_REGEN_DELAY;
    s.hitstop = Math.max(s.hitstop, Math.round(move.hitstop * 0.6));
    if (defender.guard <= 0) {
      defender.guard = 0;
      defender.action = 'guardBroken';
      defender.stun = GUARD_BROKEN_FRAMES;
      s.events.push({ type: 'guardBreak', ...impact, strength: 1, combo: 0 });
    } else {
      s.events.push({ type: 'block', ...impact, strength: move.hitstop / 15, combo: 0 });
    }
    return;
  }

  const scale = Math.max(MIN_DAMAGE_SCALE, 1 - 0.1 * defender.comboTaken);
  const defenderMove = moveOf(defender);
  if (
    defender.action === 'attack' &&
    defenderMove?.armor &&
    defender.actionFrame < defenderMove.startup
  ) {
    // Armure : le coup est encaissé à moitié, le défenseur continue son attaque.
    defender.hp = Math.max(0, defender.hp - Math.round(move.damage * scale * 0.5));
    defender.flash = 4;
    s.hitstop = Math.max(s.hitstop, move.hitstop);
    s.events.push({ type: 'hit', ...impact, strength: move.hitstop / 15, combo: 0 });
    return;
  }
  defender.hp = Math.max(0, defender.hp - Math.round(move.damage * scale));
  defender.comboTaken++;
  defender.hitHeight = move.height;
  defender.action = 'hitstun';
  defender.actionFrame = 0;
  defender.stun = move.hitstun;
  defender.move = null;
  defender.walkDir = 0;
  defender.vx = attacker.facing * move.knockback;
  defender.flash = 4;
  s.hitstop = Math.max(s.hitstop, move.hitstop);
  s.events.push({
    type: 'hit',
    ...impact,
    strength: move.hitstop / 15,
    combo: defender.comboTaken,
  });
}

function endRound(s: SimState, winner: 0 | 1 | null, reason: 'ko' | 'timeup'): void {
  s.phase = reason;
  s.phaseFrame = 0;
  s.roundWinner = winner;
  if (winner !== null) s.fighters[winner].wins++;
  if (reason === 'ko') s.events.push({ type: 'ko', winner });
  else s.events.push({ type: 'timeup', winner });
}

function startRound(s: SimState): void {
  const [a, b] = s.fighters;
  s.fighters = [
    createFighter(a.character, -START_X, a.wins),
    createFighter(b.character, START_X, b.wins),
  ];
  s.round++;
  s.phase = 'intro';
  s.phaseFrame = 0;
  s.timer = ROUND_FRAMES;
  s.roundWinner = null;
}

export function stepSim(prev: SimState, intents: [Intent, Intent]): SimState {
  const s: SimState = structuredClone(prev);
  s.frame++;
  s.events = [];

  if (s.hitstop > 0) {
    s.hitstop--;
    return s;
  }

  s.phaseFrame++;
  switch (s.phase) {
    case 'intro':
      if (s.phaseFrame === 1) s.events.push({ type: 'roundStart', round: s.round });
      if (s.phaseFrame === FIGHT_ANNOUNCE_FRAME) s.events.push({ type: 'fight' });
      if (s.phaseFrame >= INTRO_FRAMES) {
        s.phase = 'fight';
        s.phaseFrame = 0;
      }
      break;
    case 'ko':
    case 'timeup':
      if (s.phaseFrame === 50 && s.roundWinner !== null) {
        const winner = s.fighters[s.roundWinner];
        if (winner.action !== 'ko') {
          winner.action = 'victory';
          winner.actionFrame = 0;
        }
      }
      if (s.phaseFrame >= ROUND_END_FRAMES) {
        const champion = s.fighters.findIndex((f) => f.wins >= WINS_NEEDED);
        if (champion >= 0) {
          s.phase = 'matchEnd';
          s.phaseFrame = 0;
          s.events.push({ type: 'matchEnd', winner: champion as 0 | 1 });
        } else {
          startRound(s);
        }
      }
      break;
    case 'matchEnd':
      if (s.phaseFrame >= MATCH_END_FRAMES) return createInitialState(s.match + 1);
      break;
  }

  const fighting = s.phase === 'fight';
  if (fighting) s.timer--;
  s.fighters.forEach((f, i) => updateFighter(f, intents[i], fighting));
  resolvePositions(s);

  if (fighting) {
    // Les deux coups sont testés avant de vérifier le KO : les échanges simultanés sont possibles.
    const before = structuredClone(s.fighters);
    checkHit(s, before, 0);
    checkHit(s, before, 1);
    const [a, b] = s.fighters;
    if (a.hp <= 0 || b.hp <= 0) {
      for (const f of s.fighters) {
        if (f.hp <= 0) {
          f.action = 'ko';
          f.actionFrame = 0;
          f.move = null;
        }
      }
      endRound(s, a.hp <= 0 && b.hp <= 0 ? null : a.hp <= 0 ? 1 : 0, 'ko');
    } else if (s.timer <= 0) {
      endRound(s, a.hp === b.hp ? null : a.hp > b.hp ? 0 : 1, 'timeup');
    }
  }
  return s;
}
