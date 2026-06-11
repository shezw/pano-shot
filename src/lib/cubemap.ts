export type CubemapFaceId = 'front' | 'right' | 'back' | 'left' | 'up' | 'down';

export type CubemapFace = {
  id: CubemapFaceId;
  label: string;
  dataUrl: string;
  size: number;
};

type Direction = {
  x: number;
  y: number;
  z: number;
};

type FaceDefinition = {
  id: CubemapFaceId;
  label: string;
  getDirection: (u: number, v: number) => Direction;
};

const FACE_DEFINITIONS: FaceDefinition[] = [
  { id: 'front', label: '前', getDirection: (u, v) => ({ x: -u, y: -v, z: -1 }) },
  { id: 'right', label: '右', getDirection: (u, v) => ({ x: 1, y: -v, z: -u }) },
  { id: 'back', label: '后', getDirection: (u, v) => ({ x: u, y: -v, z: 1 }) },
  { id: 'left', label: '左', getDirection: (u, v) => ({ x: -1, y: -v, z: u }) },
  { id: 'up', label: '上', getDirection: (u, v) => ({ x: u, y: 1, z: v }) },
  { id: 'down', label: '下', getDirection: (u, v) => ({ x: u, y: -1, z: -v }) },
];

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Cubemap source image failed to load'));
    image.src = src;
  });
}

export function directionToEquirectangularUv(direction: Direction) {
  const length = Math.hypot(direction.x, direction.y, direction.z);
  const x = direction.x / length;
  const y = direction.y / length;
  const z = direction.z / length;
  const longitude = Math.atan2(z, x);
  const latitude = Math.asin(y);

  return {
    u: longitude / (Math.PI * 2) + 0.5,
    v: 0.5 - latitude / Math.PI,
  };
}

export function getCubemapFaceDirection(faceId: CubemapFaceId, u: number, v: number) {
  const definition = FACE_DEFINITIONS.find((face) => face.id === faceId);
  if (!definition) {
    throw new Error(`Unknown cubemap face: ${faceId}`);
  }

  return definition.getDirection(u, v);
}

function sampleSourcePixel(source: ImageData, u: number, v: number) {
  const wrappedU = ((u % 1) + 1) % 1;
  const clampedV = Math.min(1, Math.max(0, v));
  const x = Math.min(source.width - 1, Math.max(0, Math.round(wrappedU * (source.width - 1))));
  const y = Math.min(source.height - 1, Math.max(0, Math.round(clampedV * (source.height - 1))));
  const index = (y * source.width + x) * 4;

  return [
    source.data[index],
    source.data[index + 1],
    source.data[index + 2],
    source.data[index + 3],
  ] as const;
}

function createCanvas(width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

export async function generateCubemapFaces(imageUrl: string, faceSize = 512) {
  const image = await loadImage(imageUrl);
  const sourceCanvas = createCanvas(image.naturalWidth, image.naturalHeight);
  const sourceContext = sourceCanvas.getContext('2d');

  if (!sourceContext) {
    throw new Error('Canvas is not available');
  }

  sourceContext.drawImage(image, 0, 0);
  const source = sourceContext.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);

  return FACE_DEFINITIONS.map((face) => {
    const faceCanvas = createCanvas(faceSize, faceSize);
    const faceContext = faceCanvas.getContext('2d');

    if (!faceContext) {
      throw new Error('Canvas is not available');
    }

    const output = faceContext.createImageData(faceSize, faceSize);

    for (let y = 0; y < faceSize; y += 1) {
      const faceV = (y + 0.5) / faceSize * 2 - 1;

      for (let x = 0; x < faceSize; x += 1) {
        const faceU = (x + 0.5) / faceSize * 2 - 1;
        const direction = face.getDirection(faceU, faceV);
        const uv = directionToEquirectangularUv(direction);
        const pixel = sampleSourcePixel(source, uv.u, uv.v);
        const outputIndex = (y * faceSize + x) * 4;

        output.data[outputIndex] = pixel[0];
        output.data[outputIndex + 1] = pixel[1];
        output.data[outputIndex + 2] = pixel[2];
        output.data[outputIndex + 3] = pixel[3];
      }
    }

    faceContext.putImageData(output, 0, 0);

    return {
      id: face.id,
      label: face.label,
      dataUrl: faceCanvas.toDataURL('image/png'),
      size: faceSize,
    };
  });
}
