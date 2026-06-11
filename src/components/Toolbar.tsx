import {
  ActionIcon,
  Button,
  FileButton,
  Group,
  SegmentedControl,
  Slider,
  Switch,
  Text,
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
  IconLayersSubtract,
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
  isDistortionCorrectionEnabled: boolean;
  distortionCorrectionAmount: number;
  isDepthDollyEnabled: boolean;
  depthDollyStrength: number;
  hasDepthMap: boolean;
  onLensChange: (lensId: LensId) => void;
  onToggleMirror: () => void;
  onDistortionCorrectionChange: (enabled: boolean) => void;
  onDistortionCorrectionAmountChange: (amount: number) => void;
  onDepthDollyChange: (enabled: boolean) => void;
  onDepthDollyStrengthChange: (amount: number) => void;
  onDepthFileSelected: (file: File | null) => void;
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
  isDistortionCorrectionEnabled,
  distortionCorrectionAmount,
  isDepthDollyEnabled,
  depthDollyStrength,
  hasDepthMap,
  onLensChange,
  onToggleMirror,
  onDistortionCorrectionChange,
  onDistortionCorrectionAmountChange,
  onDepthDollyChange,
  onDepthDollyStrengthChange,
  onDepthFileSelected,
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

        <Switch
          className="toolbar-switch"
          aria-label="去畸变"
          label="去畸变"
          checked={isDistortionCorrectionEnabled}
          onChange={(event) => onDistortionCorrectionChange(event.currentTarget.checked)}
          size="sm"
        />

        <Group className="distortion-control" gap={8} wrap="nowrap">
          <Slider
            aria-label="去畸变强度"
            value={distortionCorrectionAmount}
            onChange={onDistortionCorrectionAmountChange}
            min={-50}
            max={150}
            step={5}
            disabled={!isDistortionCorrectionEnabled}
            size="xs"
            color="blue"
            label={(value) => `${value}%`}
            thumbProps={{ 'aria-label': '去畸变强度' }}
          />
          <Text className="distortion-value" size="xs" c="dimmed" aria-live="polite">
            {distortionCorrectionAmount}%
          </Text>
        </Group>

        <Switch
          className="toolbar-switch depth-switch"
          aria-label="深度后退"
          label="深度后退"
          checked={isDepthDollyEnabled}
          disabled={!hasDepthMap}
          onChange={(event) => onDepthDollyChange(event.currentTarget.checked)}
          size="sm"
        />

        <Group className="depth-control" gap={8} wrap="nowrap">
          <Slider
            aria-label="深度强度"
            value={depthDollyStrength}
            onChange={onDepthDollyStrengthChange}
            min={0}
            max={150}
            step={5}
            disabled={!hasDepthMap || !isDepthDollyEnabled}
            size="xs"
            color="teal"
            label={(value) => `${value}%`}
            thumbProps={{ 'aria-label': '深度强度' }}
          />
          <Text className="depth-value" size="xs" c="dimmed" aria-live="polite">
            {hasDepthMap ? `${depthDollyStrength}%` : '无'}
          </Text>
        </Group>

        <FileButton onChange={onDepthFileSelected} accept="image/png,image/jpeg,image/webp">
          {(props) => (
            <Tooltip
              label={hasDepthMap ? '已加载深度图' : '选择深度图'}
              openDelay={250}
            >
              <ActionIcon
                {...props}
                aria-label="选择深度图"
                variant={hasDepthMap ? 'filled' : 'subtle'}
                color={hasDepthMap ? 'blue' : 'gray'}
                size="lg"
              >
                <IconLayersSubtract size={18} />
              </ActionIcon>
            </Tooltip>
          )}
        </FileButton>

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
