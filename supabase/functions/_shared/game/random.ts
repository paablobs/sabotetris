/** sfc32, specified uint32 operations. Never use cosmetic randomness here. */
export function seededRandom(seed: string): () => number {
  if (!/^[a-f0-9]{32}$/.test(seed)) throw new Error('invalid_seed');
  let a = parseInt(seed.slice(0, 8), 16) | 0;
  let b = parseInt(seed.slice(8, 16), 16) | 0;
  let c = parseInt(seed.slice(16, 24), 16) | 0;
  let d = parseInt(seed.slice(24, 32), 16) | 0;
  return () => {
    const t = ((a + b | 0) + d) | 0;
    d = d + 1 | 0;
    a = b ^ b >>> 9;
    b = c + (c << 3) | 0;
    c = (c << 21 | c >>> 11) + t | 0;
    return (t >>> 0) / 4294967296;
  };
}
