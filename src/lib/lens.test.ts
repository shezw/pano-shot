import { describe, expect, it } from 'vitest';
import { buildShotFilename, formatLocalDateTime, getLensById, LENS_OPTIONS } from './lens';

describe('lens presets', () => {
  it('narrows field of view as focal length increases', () => {
    const focalLenses = LENS_OPTIONS.filter((lens) => lens.focalLength);

    for (let index = 1; index < focalLenses.length; index += 1) {
      expect(focalLenses[index].fov).toBeLessThan(focalLenses[index - 1].fov);
    }
  });

  it('falls back to panorama lens for unknown values', () => {
    expect(getLensById('panorama').fov).toBe(75);
  });

  it('builds screenshot filenames with lens, degree, and local datetime', () => {
    const date = new Date(2026, 5, 10, 17, 8, 9);

    expect(formatLocalDateTime(date)).toBe('20260610-170809');
    expect(buildShotFilename('50mm', { yaw: 12.4, pitch: -9.6, dolly: 0 }, date)).toBe(
      'prono-shot-50mm-12_-10-20260610-170809.png',
    );
  });
});
