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
  { level: 1,  speed: 1000, chaosInterval: 5000, scoreMultiplier: 1,  backgroundColor: '#1f3a5f', maxScore: 1000  },
  { level: 2,  speed: 900,  chaosInterval: 4500, scoreMultiplier: 2,  backgroundColor: '#2d4a3e', maxScore: 2500  },
  { level: 3,  speed: 800,  chaosInterval: 4000, scoreMultiplier: 3,  backgroundColor: '#4a3a1f', maxScore: 5000  },
  { level: 4,  speed: 700,  chaosInterval: 3500, scoreMultiplier: 4,  backgroundColor: '#5a2818', maxScore: 8000  },
  { level: 5,  speed: 600,  chaosInterval: 3000, scoreMultiplier: 5,  backgroundColor: '#4a1f3a', maxScore: 12000 },
  { level: 6,  speed: 500,  chaosInterval: 2500, scoreMultiplier: 6,  backgroundColor: '#1f3a3a', maxScore: 17000 },
  { level: 7,  speed: 400,  chaosInterval: 2000, scoreMultiplier: 7,  backgroundColor: '#3a2a5f', maxScore: 23000 },
  { level: 8,  speed: 300,  chaosInterval: 1500, scoreMultiplier: 8,  backgroundColor: '#5a1f4a', maxScore: 30000 },
  { level: 9,  speed: 250,  chaosInterval: 1000, scoreMultiplier: 9,  backgroundColor: '#2f1f5a', maxScore: 40000 },
  { level: 10, speed: 200,  chaosInterval: 800,  scoreMultiplier: 10, backgroundColor: '#1a1a1a', maxScore: 50000 },
];

export const HARDCORE_LEVEL: LevelDef = {
  level: 11,
  speed: 150,
  chaosInterval: 1000,
  scoreMultiplier: 10,
  backgroundColor: '#1a0000',
  maxScore: Infinity,
};

export const MAX_LEVEL = 10;
export const LINES_PER_LEVEL = 10;
