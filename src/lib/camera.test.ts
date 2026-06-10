import { describe, expect, it } from 'vitest';
import {
  applyCameraAction,
  clampPitch,
  DEFAULT_CAMERA_POSE,
  getEffectiveFov,
  normalizeYaw,
} from './camera';

describe('camera controls', () => {
  it('normalizes yaw into a stable degree range', () => {
    expect(normalizeYaw(190)).toBe(-170);
    expect(normalizeYaw(-190)).toBe(170);
    expect(normalizeYaw(540)).toBe(180);
  });

  it('clamps pitch to prevent flipping over the panorama', () => {
    expect(clampPitch(120)).toBe(85);
    expect(clampPitch(-120)).toBe(-85);
  });

  it('applies yaw and pitch control actions', () => {
    const afterLeft = applyCameraAction(DEFAULT_CAMERA_POSE, 'yawLeft10');
    expect(afterLeft).toMatchObject({ yaw: -10, pitch: 0 });

    const afterRight = applyCameraAction(afterLeft, 'yawRight30');
    expect(afterRight).toMatchObject({ yaw: 20, pitch: 0 });

    const afterPitch = applyCameraAction(afterRight, 'pitchUp20');
    expect(afterPitch).toMatchObject({ yaw: 20, pitch: 20 });
  });

  it('applies forward/backward dolly and reset actions', () => {
    const forward = applyCameraAction(DEFAULT_CAMERA_POSE, 'forward');
    expect(forward.dolly).toBeCloseTo(0.2);

    const backward = applyCameraAction(forward, 'backward');
    expect(backward.dolly).toBeCloseTo(0);

    expect(applyCameraAction(backward, 'reset')).toEqual(DEFAULT_CAMERA_POSE);
  });

  it('maps dolly changes to visible field-of-view zoom', () => {
    expect(getEffectiveFov(75, 0)).toBe(75);
    expect(getEffectiveFov(75, 0.2)).toBeLessThan(75);
    expect(getEffectiveFov(75, -0.2)).toBeGreaterThan(75);
  });
});
