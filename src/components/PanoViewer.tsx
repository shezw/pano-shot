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
  panorama: { value: Texture | null };
  yaw: { value: number };
  pitch: { value: number };
  fov: { value: number };
  aspect: { value: number };
  mirror: { value: number };
};

const correctionVertexShader = `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const correctionFragmentShader = `
  precision highp float;

  uniform sampler2D panorama;
  uniform float yaw;
  uniform float pitch;
  uniform float fov;
  uniform float aspect;
  uniform float mirror;
  varying vec2 vUv;

  const float PI = 3.1415926535897932384626433832795;

  vec3 rotateX(vec3 value, float angle) {
    float s = sin(angle);
    float c = cos(angle);
    return vec3(value.x, c * value.y - s * value.z, s * value.y + c * value.z);
  }

  vec3 rotateY(vec3 value, float angle) {
    float s = sin(angle);
    float c = cos(angle);
    return vec3(c * value.x + s * value.z, value.y, -s * value.x + c * value.z);
  }

  void main() {
    vec2 screen = vec2(vUv.x, 1.0 - vUv.y) * 2.0 - 1.0;
    screen.x *= aspect;

    float scale = tan(radians(fov) * 0.5);
    vec3 direction = normalize(vec3(screen.x * scale, screen.y * scale, -1.0));
    direction = rotateY(rotateX(direction, pitch), yaw);

    float longitude = atan(direction.x, -direction.z);
    float latitude = asin(clamp(direction.y, -1.0, 1.0));
    float u = longitude / (2.0 * PI) + 0.75;
    float v = 0.5 - latitude / PI;

    if (mirror > 0.5) {
      u = 1.0 - u;
    }

    gl_FragColor = texture2D(panorama, vec2(fract(u), clamp(v, 0.0, 1.0)));
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

export const PanoViewer = forwardRef<PanoViewerHandle, PanoViewerProps>(function PanoViewer(
  { imageUrl, lensId, pose, isMirrored, isDistortionCorrectionEnabled, onPoseChange },
  ref,
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<WebGLRenderer | null>(null);
  const cameraRef = useRef<PerspectiveCamera | null>(null);
  const correctionCameraRef = useRef<OrthographicCamera | null>(null);
  const correctionSceneRef = useRef<Scene | null>(null);
  const correctionMaterialRef = useRef<ShaderMaterial | null>(null);
  const materialRef = useRef<MeshBasicMaterial | null>(null);
  const sphereRef = useRef<Mesh | null>(null);
  const correctionPlaneRef = useRef<Mesh | null>(null);
  const frameRef = useRef<number | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const latestPoseRef = useRef(pose);
  const latestLensRef = useRef(lensId);
  const latestMirrorRef = useRef(isMirrored);
  const latestCorrectionRef = useRef(isDistortionCorrectionEnabled);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  latestPoseRef.current = pose;
  latestLensRef.current = lensId;
  latestMirrorRef.current = isMirrored;
  latestCorrectionRef.current = isDistortionCorrectionEnabled;

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
    const material = new MeshBasicMaterial({ side: BackSide });
    const sphere = new Mesh(geometry, material);
    sphere.scale.x = -1;
    scene.add(sphere);

    const correctionUniforms: CorrectionUniforms = {
      panorama: { value: null },
      yaw: { value: 0 },
      pitch: { value: 0 },
      fov: { value: getLensById(lensId).fov },
      aspect: { value: 16 / 9 },
      mirror: { value: 0 },
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
    rendererRef.current = renderer;
    materialRef.current = material;
    sphereRef.current = sphere;
    correctionPlaneRef.current = correctionPlane;

    const resize = () => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      correctionUniforms.aspect.value = width / height;
      renderer.setSize(width, height, false);
    };

    const render = () => {
      const activePose = latestPoseRef.current;
      const activeLens = getLensById(latestLensRef.current);
      const yaw = toRadians(activePose.yaw);
      const pitch = toRadians(activePose.pitch);
      const effectiveFov = getEffectiveFov(activeLens.fov, activePose.dolly);
      const useCorrection = shouldUseCorrection(latestCorrectionRef.current, activeLens, activePose);

      sphere.scale.x = latestMirrorRef.current ? 1 : -1;
      if (useCorrection && correctionUniforms.panorama.value) {
        correctionUniforms.yaw.value = yaw;
        correctionUniforms.pitch.value = pitch;
        correctionUniforms.fov.value = effectiveFov;
        correctionUniforms.mirror.value = latestMirrorRef.current ? 1 : 0;
        renderer.render(correctionScene, correctionCamera);
      } else {
        camera.fov = effectiveFov;
        camera.position.set(0, 0, 0);
        camera.rotation.set(pitch, yaw, 0, 'YXZ');
        camera.updateProjectionMatrix();
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
      geometry.dispose();
      correctionMaterial.dispose();
      correctionPlane.geometry.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      cameraRef.current = null;
      correctionCameraRef.current = null;
      correctionSceneRef.current = null;
      correctionMaterialRef.current = null;
      rendererRef.current = null;
      materialRef.current = null;
      sphereRef.current = null;
      correctionPlaneRef.current = null;
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
        const correctionMaterial = correctionMaterialRef.current;
        if (correctionMaterial) {
          (correctionMaterial.uniforms as CorrectionUniforms).panorama.value = texture;
        }
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
