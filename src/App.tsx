import { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Group, Text } from '@mantine/core';
import { PanoViewer, type PanoViewerHandle } from './components/PanoViewer';
import { Toolbar } from './components/Toolbar';
import { applyCameraAction, DEFAULT_CAMERA_POSE, type CameraPose } from './lib/camera';
import { buildShotFilename, type LensId } from './lib/lens';

const defaultPanoramaUrl = new URL('../assets/prono-0610-1534.png', import.meta.url).href;

export function App() {
  const viewerRef = useRef<PanoViewerHandle>(null);
  const [lensId, setLensId] = useState<LensId>('panorama');
  const [pose, setPose] = useState<CameraPose>(DEFAULT_CAMERA_POSE);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isMirrored, setIsMirrored] = useState(false);
  const [isDistortionCorrectionEnabled, setIsDistortionCorrectionEnabled] = useState(true);
  const [distortionCorrectionAmount, setDistortionCorrectionAmount] = useState(100);

  const imageUrl = uploadedUrl ?? defaultPanoramaUrl;

  useEffect(() => {
    return () => {
      if (uploadedUrl) {
        URL.revokeObjectURL(uploadedUrl);
      }
    };
  }, [uploadedUrl]);

  const cameraMeta = useMemo(() => {
    const yaw = Math.round(pose.yaw);
    const pitch = Math.round(pose.pitch);
    const zoom = Math.round(pose.dolly * 100);
    return `Yaw ${yaw} deg / Pitch ${pitch} deg / Zoom ${zoom > 0 ? '+' : ''}${zoom}`;
  }, [pose]);

  const handleFileSelected = (file: File | null) => {
    if (!file) {
      return;
    }

    setUploadedUrl((currentUrl) => {
      if (currentUrl) {
        URL.revokeObjectURL(currentUrl);
      }
      return URL.createObjectURL(file);
    });
  };

  const handleCapture = async () => {
    setIsCapturing(true);
    try {
      const blob = await viewerRef.current?.capture();
      if (!blob) {
        return;
      }

      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = buildShotFilename(lensId, pose);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 500);
    } finally {
      setIsCapturing(false);
    }
  };

  return (
    <Box className="app-shell">
      <Toolbar
        lensId={lensId}
        isMirrored={isMirrored}
        isDistortionCorrectionEnabled={isDistortionCorrectionEnabled}
        distortionCorrectionAmount={distortionCorrectionAmount}
        onLensChange={setLensId}
        onToggleMirror={() => setIsMirrored((currentValue) => !currentValue)}
        onDistortionCorrectionChange={setIsDistortionCorrectionEnabled}
        onDistortionCorrectionAmountChange={setDistortionCorrectionAmount}
        onCameraAction={(action) => setPose((currentPose) => applyCameraAction(currentPose, action))}
        onFileSelected={handleFileSelected}
        onCapture={handleCapture}
        isCapturing={isCapturing}
      />

      <main className="preview-shell">
        <section className="viewer-stage" aria-label="全景预览区">
          <PanoViewer
            ref={viewerRef}
            imageUrl={imageUrl}
            lensId={lensId}
            pose={pose}
            isMirrored={isMirrored}
            isDistortionCorrectionEnabled={isDistortionCorrectionEnabled}
            distortionCorrectionAmount={distortionCorrectionAmount}
            onPoseChange={setPose}
          />
        </section>
        <Group className="status-line" justify="space-between" wrap="nowrap">
          <Text size="xs" c="dimmed">
            {cameraMeta}
          </Text>
          <Text size="xs" c="dimmed">
            16:9
          </Text>
        </Group>
      </main>
    </Box>
  );
}
