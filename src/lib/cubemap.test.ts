import { describe, expect, it } from 'vitest';
import { directionToEquirectangularUv, getCubemapFaceDirection } from './cubemap';

describe('cubemap projection', () => {
  it('maps cardinal directions into stable equirectangular coordinates', () => {
    expect(directionToEquirectangularUv({ x: 1, y: 0, z: 0 })).toMatchObject({
      u: 0.5,
      v: 0.5,
    });
    expect(directionToEquirectangularUv({ x: 0, y: 1, z: 0 }).v).toBeCloseTo(0, 5);
    expect(directionToEquirectangularUv({ x: 0, y: -1, z: 0 }).v).toBeCloseTo(1, 5);
  });

  it('exposes the six expected face directions', () => {
    expect(getCubemapFaceDirection('front', 0, 0).z).toBe(-1);
    expect(getCubemapFaceDirection('right', 0, 0).x).toBe(1);
    expect(getCubemapFaceDirection('back', 0, 0).z).toBe(1);
    expect(getCubemapFaceDirection('left', 0, 0).x).toBe(-1);
    expect(getCubemapFaceDirection('up', 0, 0).y).toBe(1);
    expect(getCubemapFaceDirection('down', 0, 0).y).toBe(-1);
  });
});
