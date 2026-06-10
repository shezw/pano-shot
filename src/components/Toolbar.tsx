import {
  ActionIcon,
  Button,
  FileButton,
  Group,
  SegmentedControl,
  Tooltip,
} from '@mantine/core';
import {
  IconArrowBackUp,
  IconArrowDown,
  IconArrowLeft,
  IconArrowRight,
  IconArrowUp,
  IconCamera,
  IconChevronLeft,
  IconChevronRight,
  IconFlipHorizontal,
  IconRotateClockwise2,
  IconUpload,
  IconZoomIn,
  IconZoomOut,
} from '@tabler/icons-react';
import { CAMERA_CONTROLS, type CameraAction } from '../lib/camera';
import { LENS_OPTIONS, type LensId } from '../lib/lens';

type ToolbarProps = {
  lensId: LensId;
  isMirrored: boolean;
  onLensChange: (lensId: LensId) => void;
  onToggleMirror: () => void;
  onCameraAction: (action: CameraAction) => void;
  onFileSelected: (file: File | null) => void;
  onCapture: () => void;
  isCapturing: boolean;
};

const controlIcons: Record<CameraAction, typeof IconRotateClockwise2> = {
  reset: IconArrowBackUp,
  forward: IconZoomIn,
  backward: IconZoomOut,
  yawLeft10: IconChevronLeft,
  yawRight10: IconChevronRight,
  yawLeft30: IconArrowLeft,
  yawRight30: IconArrowRight,
  pitchUp10: IconArrowUp,
  pitchDown10: IconArrowDown,
  pitchUp20: IconArrowUp,
  pitchDown20: IconArrowDown,
};

export function Toolbar({
  lensId,
  isMirrored,
  onLensChange,
  onToggleMirror,
  onCameraAction,
  onFileSelected,
  onCapture,
  isCapturing,
}: ToolbarProps) {
  return (
    <header className="toolbar">
      <Group gap="xs" wrap="nowrap" className="toolbar-row">
        <FileButton onChange={onFileSelected} accept="image/png,image/jpeg,image/webp">
          {(props) => (
            <Button
              {...props}
              className="toolbar-button"
              leftSection={<IconUpload size={16} />}
              variant="filled"
              color="gray"
            >
              选择图片
            </Button>
          )}
        </FileButton>

        <Tooltip label="镜像" openDelay={250}>
          <ActionIcon
            aria-label="镜像"
            variant={isMirrored ? 'filled' : 'subtle'}
            color={isMirrored ? 'blue' : 'gray'}
            size="lg"
            onClick={onToggleMirror}
          >
            <IconFlipHorizontal size={18} />
          </ActionIcon>
        </Tooltip>

        <SegmentedControl
          aria-label="镜头选择"
          className="lens-control"
          value={lensId}
          onChange={(value) => onLensChange(value as LensId)}
          data={LENS_OPTIONS.map((lens) => ({ value: lens.id, label: lens.label }))}
        />

        <Group gap={4} wrap="nowrap" className="camera-controls" aria-label="镜头控制">
          {CAMERA_CONTROLS.map((control) => {
            const Icon = controlIcons[control.action];
            return (
              <Tooltip key={control.action} label={control.label} openDelay={250}>
                <ActionIcon
                  aria-label={control.label}
                  variant="subtle"
                  color="gray"
                  size="lg"
                  onClick={() => onCameraAction(control.action)}
                >
                  <Icon size={18} />
                </ActionIcon>
              </Tooltip>
            );
          })}
        </Group>

        <Button
          className="toolbar-button"
          leftSection={<IconCamera size={16} />}
          color="red"
          onClick={onCapture}
          loading={isCapturing}
        >
          拍照
        </Button>
      </Group>
    </header>
  );
}
