import type { CameraPose } from './camera';

export type LensId = 'panorama' | '10mm' | '25mm' | '35mm' | '50mm' | '85mm' | '100mm' | '135mm';

export type LensOption = {
  id: LensId;
  label: string;
  focalLength?: number;
  fov: number;
};

export const LENS_OPTIONS: LensOption[] = [
  { id: 'panorama', label: '全景预览', fov: 75 },
  { id: '10mm', label: '10', focalLength: 10, fov: 100 },
  { id: '25mm', label: '25', focalLength: 25, fov: 52 },
  { id: '35mm', label: '35', focalLength: 35, fov: 38 },
  { id: '50mm', label: '50', focalLength: 50, fov: 27 },
  { id: '85mm', label: '85', focalLength: 85, fov: 16 },
  { id: '100mm', label: '100', focalLength: 100, fov: 14 },
  { id: '135mm', label: '135', focalLength: 135, fov: 10 },
];

export function getLensById(id: LensId) {
  return LENS_OPTIONS.find((lens) => lens.id === id) ?? LENS_OPTIONS[0];
}

export function formatLocalDateTime(date = new Date()) {
  const pad = (value: number) => value.toString().padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    '-',
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join('');
}

export function buildShotFilename(lensId: LensId, pose: CameraPose, date = new Date()) {
  const yaw = Math.round(pose.yaw);
  const pitch = Math.round(pose.pitch);
  return `prono-shot-${lensId}-${yaw}_${pitch}-${formatLocalDateTime(date)}.png`;
}
