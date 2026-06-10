import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Center, Loader, Text } from '@mantine/core';
import {
  BackSide,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  WebGLRenderer,
} from 'three';
import { getLensById, type LensId } from '../lib/lens';
import type { CameraPose } from '../lib/camera';

type PanoViewerProps = {
  imageUrl: string;
  lensId: LensId;
  pose: CameraPose;
};

export type PanoViewerHandle = {
  capture: () => Promise<Blob | null>;
};

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

export const PanoViewer = forwardRef<PanoViewerHandle, PanoViewerProps>(function PanoViewer(
  { imageUrl, lensId, pose },
  ref,
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<WebGLRenderer | null>(null);
  const cameraRef = useRef<PerspectiveCamera | null>(null);
  const materialRef = useRef<MeshBasicMaterial | null>(null);
  const frameRef = useRef<number | null>(null);
  const latestPoseRef = useRef(pose);
  const latestLensRef = useRef(lensId);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  latestPoseRef.current = pose;
  latestLensRef.current = lensId;

  useImperativeHandle(ref, () => ({
    capture: () =>
      new Promise((resolve) => {
        const renderer = rendererRef.current;
        if (!renderer) {
          resolve(null);
          return;
        }

        renderer.domElement.toBlob((blob) => resolve(blob), 'image/png', 1);
      }),
  }));

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return undefined;
    }

    const scene = new Scene();
    const camera = new PerspectiveCamera(getLensById(lensId).fov, 16 / 9, 0.1, 1000);
    const renderer = new WebGLRenderer({
      antialias: true,
      preserveDrawingBuffer: true,
      alpha: false,
    });

    renderer.outputColorSpace = SRGBColorSpace;
    renderer.setClearColor(0x050505);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const geometry = new SphereGeometry(500, 80, 48);
    const material = new MeshBasicMaterial({ side: BackSide });
    const sphere = new Mesh(geometry, material);
    scene.add(sphere);
    container.appendChild(renderer.domElement);

    cameraRef.current = camera;
    rendererRef.current = renderer;
    materialRef.current = material;

    const resize = () => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };

    const render = () => {
      const activePose = latestPoseRef.current;
      const activeLens = getLensById(latestLensRef.current);
      const yaw = toRadians(activePose.yaw);
      const pitch = toRadians(activePose.pitch);

      camera.fov = activeLens.fov;
      camera.position.set(Math.sin(yaw) * activePose.dolly, 0, Math.cos(yaw) * activePose.dolly);
      camera.rotation.set(pitch, yaw, 0, 'YXZ');
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
      frameRef.current = window.requestAnimationFrame(render);
    };

    const observer = new ResizeObserver(resize);
    observer.observe(container);
    resize();
    render();

    return () => {
      if (frameRef.current) {
        window.cancelAnimationFrame(frameRef.current);
      }
      observer.disconnect();
      material.map?.dispose();
      material.dispose();
      geometry.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      cameraRef.current = null;
      rendererRef.current = null;
      materialRef.current = null;
    };
  }, []);

  useEffect(() => {
    const material = materialRef.current;
    if (!material) {
      return undefined;
    }

    let cancelled = false;
    let loadedTexture: Texture | null = null;
    setIsLoading(true);
    setError(null);

    const loader = new TextureLoader();
    loader.load(
      imageUrl,
      (texture) => {
        if (cancelled) {
          texture.dispose();
          return;
        }

        loadedTexture = texture;
        texture.colorSpace = SRGBColorSpace;
        texture.minFilter = LinearFilter;
        texture.magFilter = LinearFilter;
        material.map?.dispose();
        material.map = texture;
        material.needsUpdate = true;
        setIsLoading(false);
      },
      undefined,
      () => {
        if (!cancelled) {
          setError('图片加载失败');
          setIsLoading(false);
        }
      },
    );

    return () => {
      cancelled = true;
      loadedTexture?.dispose();
    };
  }, [imageUrl]);

  return (
    <div className="pano-viewer" ref={containerRef}>
      {isLoading && (
        <Center className="viewer-overlay">
          <Loader color="gray" />
        </Center>
      )}
      {error && (
        <Center className="viewer-overlay">
          <Text c="red" size="sm">
            {error}
          </Text>
        </Center>
      )}
    </div>
  );
});
