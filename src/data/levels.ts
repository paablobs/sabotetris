import type { LevelDef } from '../types';

/**
 * Level definitions for all 10 levels.
 * Each level modifies:
 *  - speed: gravity interval in ms (lower = faster)
 *  - chaosInterval: how often sabotage triggers in ms
 *  - scoreMultiplier: scoring multiplier
 *  - backgroundColor: matte/desaturated color for the level
 */
export const LEVELS: LevelDef[] = [
  { level: 1,  speed: 1000, chaosInterval: 5000, scoreMultiplier: 1,  backgroundColor: '#556270' },
  { level: 2,  speed: 900,  chaosInterval: 4500, scoreMultiplier: 2,  backgroundColor: '#6C7A89' },
  { level: 3,  speed: 800,  chaosInterval: 4000, scoreMultiplier: 3,  backgroundColor: '#7B8D8E' },
  { level: 4,  speed: 700,  chaosInterval: 3500, scoreMultiplier: 4,  backgroundColor: '#8E8D8A' },
  { level: 5,  speed: 600,  chaosInterval: 3000, scoreMultiplier: 5,  backgroundColor: '#7D6B57' },
  { level: 6,  speed: 500,  chaosInterval: 2500, scoreMultiplier: 6,  backgroundColor: '#6B705C' },
  { level: 7,  speed: 400,  chaosInterval: 2000, scoreMultiplier: 7,  backgroundColor: '#5C677D' },
  { level: 8,  speed: 300,  chaosInterval: 1500, scoreMultiplier: 8,  backgroundColor: '#4F5D75' },
  { level: 9,  speed: 250,  chaosInterval: 1000, scoreMultiplier: 9,  backgroundColor: '#5E6472' },
  { level: 10, speed: 200,  chaosInterval: 800,  scoreMultiplier: 10, backgroundColor: '#3C3C3C' },
];

export const MAX_LEVEL = 10;
export const LINES_PER_LEVEL = 10;
