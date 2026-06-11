import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type PointerEvent,
  type WheelEvent,
} from 'react';
import { Center, Loader, Text } from '@mantine/core';
import {
  BackSide,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  OrthographicCamera,
  PlaneGeometry,
  PerspectiveCamera,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  WebGLRenderer,
  WebGLRenderTarget,
  Euler,
  Vector3,
  BufferAttribute,
} from 'three';
import { getLensById, type LensId } from '../lib/lens';
import {
  applyDollyDelta,
  clampPitch,
  getEffectiveFov,
  normalizeYaw,
  type CameraPose,
} from '../lib/camera';

type PanoViewerProps = {
  imageUrl: string;
  lensId: LensId;
  pose: CameraPose;
  isMirrored: boolean;
  isDistortionCorrectionEnabled: boolean;
  distortionCorrectionAmount: number;
  isDepthDollyEnabled: boolean;
  depthMapUrl: string | null;
  onPoseChange: (pose: CameraPose) => void;
};

export type PanoViewerHandle = {
  capture: () => Promise<Blob | null>;
};

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

type DragState = {
  pointerId: number;
  startX: number;
  startY: number;
  startPose: CameraPose;
};

type CorrectionUniforms = {
  renderedFrame: { value: Texture | null };
  fov: { value: number };
  aspect: { value: number };
  correctionStrength: { value: number };
};

type DepthSample = {
  width: number;
  height: number;
  data: Uint8ClampedArray;
};

const DEPTH_DOLLY_SCALE = 72;
const DEPTH_PROXY_STRENGTH = 0.42;

const correctionVertexShader = `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const correctionFragmentShader = `
  precision highp float;

  uniform sampler2D renderedFrame;
  uniform float fov;
  uniform float aspect;
  uniform float correctionStrength;
  varying vec2 vUv;

  void main() {
    vec2 centered = vUv * 2.0 - 1.0;
    float verticalHalfFov = radians(fov) * 0.5;
    float horizontalHalfFov = atan(tan(verticalHalfFov) * aspect);
    float cylindricalX = tan(centered.x * horizontalHalfFov) / tan(horizontalHalfFov);
    vec2 cylindricalUv = vec2(cylindricalX, centered.y) * 0.5 + 0.5;
    vec2 sampleUv = mix(vUv, cylindricalUv, correctionStrength);

    gl_FragColor = texture2D(renderedFrame, sampleUv);
    #include <colorspace_fragment>
  }
`;

function shouldUseCorrection(
  enabled: boolean,
  lens: ReturnType<typeof getLensById>,
  pose: CameraPose,
) {
  return enabled && ((lens.focalLength ?? 0) >= 50 || pose.dolly > 0.4);
}

function getCorrectionStrength(lens: ReturnType<typeof getLensById>, pose: CameraPose, fov: number) {
  const focalBoost = (lens.focalLength ?? 0) >= 50 ? 0.1 : 0;
  const zoomOutBoost = pose.dolly < 0 ? Math.min(0.1, Math.abs(pose.dolly) * 0.05) : 0;
  const wideFovBoost = Math.min(0.16, Math.max(0, (fov - 35) / 75) * 0.16);
  return Math.min(0.36, focalBoost + zoomOutBoost + wideFovBoost);
}

function getFallbackDepth(u: number, v: number) {
  const verticalDistance = Math.abs(v - 0.5) * 2;
  const horizonDepth = 1.18;
  const floorCeilingDepth = 0.82;
  const verticalDepth = horizonDepth + (floorCeilingDepth - horizonDepth) * verticalDistance;
  const wallVariation = Math.sin(u * Math.PI * 8) * 0.04;
  return verticalDepth + wallVariation;
}

function getDepthMapValue(depthSample: DepthSample, u: number, v: number) {
  const x = Math.min(depthSample.width - 1, Math.max(0, Math.round(u * (depthSample.width - 1))));
  const y = Math.min(depthSample.height - 1, Math.max(0, Math.round(v * (depthSample.height - 1))));
  const index = (y * depthSample.width + x) * 4;
  return depthSample.data[index] / 255;
}

function applyDepthProxy(
  geometry: SphereGeometry,
  basePositions: Float32Array,
  depthSample: DepthSample | null,
) {
  const position = geometry.attributes.position as BufferAttribute;
  const uv = geometry.attributes.uv as BufferAttribute;

  for (let index = 0; index < position.count; index += 1) {
    const x = basePositions[index * 3];
    const y = basePositions[index * 3 + 1];
    const z = basePositions[index * 3 + 2];
    const radius = Math.hypot(x, y, z);
    const u = uv.getX(index);
    const v = uv.getY(index);
    const depth = depthSample
      ? 0.68 + getDepthMapValue(depthSample, u, v) * 0.72
      : getFallbackDepth(u, v);
    const scaledRadius = radius * (1 + (depth - 1) * DEPTH_PROXY_STRENGTH);
    const scale = scaledRadius / radius;

    position.setXYZ(index, x * scale, y * scale, z * scale);
  }

  position.needsUpdate = true;
  geometry.computeVertexNormals();
}

function loadDepthSample(depthMapUrl: string) {
  return new Promise<DepthSample>((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d');

      if (!context) {
        reject(new Error('无法读取深度图'));
        return;
      }

      context.drawImage(image, 0, 0);
      const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
      resolve({ width: canvas.width, height: canvas.height, data: imageData.data });
    };
    image.onerror = () => reject(new Error('深度图加载失败'));
    image.src = depthMapUrl;
  });
}

export const PanoViewer = forwardRef<PanoViewerHandle, PanoViewerProps>(function PanoViewer(
  {
    imageUrl,
    lensId,
    pose,
    isMirrored,
    isDistortionCorrectionEnabled,
    distortionCorrectionAmount,
    isDepthDollyEnabled,
    depthMapUrl,
    onPoseChange,
  },
  ref,
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<WebGLRenderer | null>(null);
  const cameraRef = useRef<PerspectiveCamera | null>(null);
  const correctionCameraRef = useRef<OrthographicCamera | null>(null);
  const correctionSceneRef = useRef<Scene | null>(null);
  const correctionMaterialRef = useRef<ShaderMaterial | null>(null);
  const correctionTargetRef = useRef<WebGLRenderTarget | null>(null);
  const materialRef = useRef<MeshBasicMaterial | null>(null);
  const depthMaterialRef = useRef<MeshBasicMaterial | null>(null);
  const sphereRef = useRef<Mesh | null>(null);
  const depthSphereRef = useRef<Mesh | null>(null);
  const depthGeometryRef = useRef<SphereGeometry | null>(null);
  const baseDepthPositionsRef = useRef<Float32Array | null>(null);
  const correctionPlaneRef = useRef<Mesh | null>(null);
  const frameRef = useRef<number | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const latestPoseRef = useRef(pose);
  const latestLensRef = useRef(lensId);
  const latestMirrorRef = useRef(isMirrored);
  const latestCorrectionRef = useRef(isDistortionCorrectionEnabled);
  const latestCorrectionAmountRef = useRef(distortionCorrectionAmount);
  const latestDepthDollyRef = useRef(isDepthDollyEnabled);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  latestPoseRef.current = pose;
  latestLensRef.current = lensId;
  latestMirrorRef.current = isMirrored;
  latestCorrectionRef.current = isDistortionCorrectionEnabled;
  latestCorrectionAmountRef.current = distortionCorrectionAmount;
  latestDepthDollyRef.current = isDepthDollyEnabled;

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
    const correctionScene = new Scene();
    const camera = new PerspectiveCamera(getLensById(lensId).fov, 16 / 9, 0.1, 1000);
    const correctionCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 2);
    correctionCamera.position.z = 1;
    const renderer = new WebGLRenderer({
      antialias: true,
      preserveDrawingBuffer: true,
      alpha: false,
    });

    renderer.outputColorSpace = SRGBColorSpace;
    renderer.setClearColor(0x050505);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const geometry = new SphereGeometry(500, 80, 48);
    const depthGeometry = new SphereGeometry(500, 160, 96);
    const material = new MeshBasicMaterial({ side: BackSide });
    const depthMaterial = new MeshBasicMaterial({ side: BackSide });
    const sphere = new Mesh(geometry, material);
    const depthSphere = new Mesh(depthGeometry, depthMaterial);
    sphere.scale.x = -1;
    depthSphere.scale.x = -1;
    depthSphere.visible = false;
    scene.add(sphere);
    scene.add(depthSphere);

    const baseDepthPositions = new Float32Array(
      (depthGeometry.attributes.position as BufferAttribute).array,
    );
    applyDepthProxy(depthGeometry, baseDepthPositions, null);

    const correctionTarget = new WebGLRenderTarget(1, 1, {
      minFilter: LinearFilter,
      magFilter: LinearFilter,
    });
    correctionTarget.texture.colorSpace = SRGBColorSpace;
    const correctionUniforms: CorrectionUniforms = {
      renderedFrame: { value: correctionTarget.texture },
      fov: { value: getLensById(lensId).fov },
      aspect: { value: 16 / 9 },
      correctionStrength: { value: 0 },
    };
    const correctionMaterial = new ShaderMaterial({
      uniforms: correctionUniforms,
      vertexShader: correctionVertexShader,
      fragmentShader: correctionFragmentShader,
      depthTest: false,
      depthWrite: false,
    });
    const correctionPlane = new Mesh(new PlaneGeometry(2, 2), correctionMaterial);
    correctionScene.add(correctionPlane);

    container.appendChild(renderer.domElement);

    cameraRef.current = camera;
    correctionCameraRef.current = correctionCamera;
    correctionSceneRef.current = correctionScene;
    correctionMaterialRef.current = correctionMaterial;
    correctionTargetRef.current = correctionTarget;
    rendererRef.current = renderer;
    materialRef.current = material;
    depthMaterialRef.current = depthMaterial;
    sphereRef.current = sphere;
    depthSphereRef.current = depthSphere;
    depthGeometryRef.current = depthGeometry;
    baseDepthPositionsRef.current = baseDepthPositions;
    correctionPlaneRef.current = correctionPlane;

    const resize = () => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      correctionUniforms.aspect.value = width / height;
      correctionTarget.setSize(width, height);
      renderer.setSize(width, height, false);
    };

    const render = () => {
      const activePose = latestPoseRef.current;
      const activeLens = getLensById(latestLensRef.current);
      const yaw = toRadians(activePose.yaw);
      const pitch = toRadians(activePose.pitch);
      const useDepthDolly = latestDepthDollyRef.current;
      const effectiveFov = useDepthDolly
        ? activeLens.fov
        : getEffectiveFov(activeLens.fov, activePose.dolly);
      const correctionAmount = latestCorrectionAmountRef.current / 100;
      const useCorrection =
        correctionAmount !== 0 &&
        shouldUseCorrection(latestCorrectionRef.current, activeLens, activePose);

      sphere.scale.x = latestMirrorRef.current ? 1 : -1;
      depthSphere.scale.x = latestMirrorRef.current ? 1 : -1;
      sphere.visible = !useDepthDolly;
      depthSphere.visible = useDepthDolly;
      camera.fov = effectiveFov;
      camera.rotation.set(pitch, yaw, 0, 'YXZ');
      if (useDepthDolly) {
        const forward = new Vector3(0, 0, -1).applyEuler(new Euler(pitch, yaw, 0, 'YXZ'));
        camera.position.copy(forward.multiplyScalar(activePose.dolly * DEPTH_DOLLY_SCALE));
      } else {
        camera.position.set(0, 0, 0);
      }
      camera.updateProjectionMatrix();

      if (useCorrection) {
        correctionUniforms.fov.value = effectiveFov;
        correctionUniforms.correctionStrength.value =
          getCorrectionStrength(activeLens, activePose, effectiveFov) * correctionAmount;
        renderer.setRenderTarget(correctionTarget);
        renderer.render(scene, camera);
        renderer.setRenderTarget(null);
        renderer.render(correctionScene, correctionCamera);
      } else {
        renderer.render(scene, camera);
      }
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
      depthMaterial.dispose();
      geometry.dispose();
      depthGeometry.dispose();
      correctionMaterial.dispose();
      correctionTarget.dispose();
      correctionPlane.geometry.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      cameraRef.current = null;
      correctionCameraRef.current = null;
      correctionSceneRef.current = null;
      correctionMaterialRef.current = null;
      correctionTargetRef.current = null;
      rendererRef.current = null;
      materialRef.current = null;
      depthMaterialRef.current = null;
      sphereRef.current = null;
      depthSphereRef.current = null;
      depthGeometryRef.current = null;
      baseDepthPositionsRef.current = null;
      correctionPlaneRef.current = null;
    };
  }, []);

  useEffect(() => {
    const material = materialRef.current;
    const depthMaterial = depthMaterialRef.current;
    if (!material || !depthMaterial) {
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
        depthMaterial.map = texture;
        material.needsUpdate = true;
        depthMaterial.needsUpdate = true;
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

  useEffect(() => {
    const depthGeometry = depthGeometryRef.current;
    const baseDepthPositions = baseDepthPositionsRef.current;
    if (!depthGeometry || !baseDepthPositions) {
      return undefined;
    }

    let cancelled = false;

    if (!depthMapUrl) {
      applyDepthProxy(depthGeometry, baseDepthPositions, null);
      return undefined;
    }

    loadDepthSample(depthMapUrl)
      .then((depthSample) => {
        if (!cancelled) {
          applyDepthProxy(depthGeometry, baseDepthPositions, depthSample);
        }
      })
      .catch(() => {
        if (!cancelled) {
          applyDepthProxy(depthGeometry, baseDepthPositions, null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [depthMapUrl]);

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startPose: latestPoseRef.current,
    };
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    const sensitivity = 0.12;
    onPoseChange({
      ...drag.startPose,
      yaw: normalizeYaw(drag.startPose.yaw + deltaX * sensitivity),
      pitch: clampPitch(drag.startPose.pitch + deltaY * sensitivity),
    });
  };

  const handlePointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragRef.current = null;
  };

  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const delta = Math.min(0.25, Math.max(-0.25, -event.deltaY * 0.002));
    onPoseChange(applyDollyDelta(latestPoseRef.current, delta));
  };

  return (
    <div
      className="pano-viewer"
      ref={containerRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onWheel={handleWheel}
    >
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
