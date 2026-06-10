export type CameraPose = {
  yaw: number;
  pitch: number;
  dolly: number;
};

export type CameraAction =
  | 'reset'
  | 'forward'
  | 'backward'
  | 'yawLeft10'
  | 'yawRight10'
  | 'yawLeft30'
  | 'yawRight30'
  | 'pitchUp10'
  | 'pitchDown10'
  | 'pitchUp20'
  | 'pitchDown20';

export type CameraControl = {
  action: CameraAction;
  label: string;
};

export const DEFAULT_CAMERA_POSE: CameraPose = {
  yaw: 0,
  pitch: 0,
  dolly: 0,
};

export const CAMERA_CONTROLS: CameraControl[] = [
  { action: 'reset', label: '复位' },
  { action: 'forward', label: '前进' },
  { action: 'backward', label: '后退' },
  { action: 'yawLeft10', label: '左10' },
  { action: 'yawRight10', label: '右10' },
  { action: 'yawLeft30', label: '左30' },
  { action: 'yawRight30', label: '右30' },
  { action: 'pitchUp10', label: '上仰10' },
  { action: 'pitchDown10', label: '下俯10' },
  { action: 'pitchUp20', label: '上仰20' },
  { action: 'pitchDown20', label: '下俯20' },
];

const MIN_PITCH = -85;
const MAX_PITCH = 85;
const MIN_DOLLY = -3;
const MAX_DOLLY = 2;
const DOLLY_STEP = 0.2;
const MIN_EFFECTIVE_FOV = 2;
const MAX_EFFECTIVE_FOV = 110;

export function normalizeYaw(value: number) {
  const normalized = ((((value + 180) % 360) + 360) % 360) - 180;
  return normalized === -180 ? 180 : normalized;
}

export function clampPitch(value: number) {
  return Math.min(MAX_PITCH, Math.max(MIN_PITCH, value));
}

export function clampDolly(value: number) {
  return Math.min(MAX_DOLLY, Math.max(MIN_DOLLY, value));
}

export function applyDollyDelta(pose: CameraPose, delta: number): CameraPose {
  return { ...pose, dolly: clampDolly(pose.dolly + delta) };
}

export function getEffectiveFov(baseFov: number, dolly: number) {
  const fov = baseFov * Math.pow(2, -dolly);
  return Math.min(MAX_EFFECTIVE_FOV, Math.max(MIN_EFFECTIVE_FOV, fov));
}

export function applyCameraAction(pose: CameraPose, action: CameraAction): CameraPose {
  switch (action) {
    case 'reset':
      return DEFAULT_CAMERA_POSE;
    case 'forward':
      return applyDollyDelta(pose, DOLLY_STEP);
    case 'backward':
      return applyDollyDelta(pose, -DOLLY_STEP);
    case 'yawLeft10':
      return { ...pose, yaw: normalizeYaw(pose.yaw - 10) };
    case 'yawRight10':
      return { ...pose, yaw: normalizeYaw(pose.yaw + 10) };
    case 'yawLeft30':
      return { ...pose, yaw: normalizeYaw(pose.yaw - 30) };
    case 'yawRight30':
      return { ...pose, yaw: normalizeYaw(pose.yaw + 30) };
    case 'pitchUp10':
      return { ...pose, pitch: clampPitch(pose.pitch + 10) };
    case 'pitchDown10':
      return { ...pose, pitch: clampPitch(pose.pitch - 10) };
    case 'pitchUp20':
      return { ...pose, pitch: clampPitch(pose.pitch + 20) };
    case 'pitchDown20':
      return { ...pose, pitch: clampPitch(pose.pitch - 20) };
  }
}
