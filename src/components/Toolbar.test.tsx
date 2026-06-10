import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Toolbar } from './Toolbar';

function renderToolbar(overrides = {}) {
  const props = {
    lensId: 'panorama' as const,
    isMirrored: false,
    isDistortionCorrectionEnabled: true,
    onLensChange: vi.fn(),
    onToggleMirror: vi.fn(),
    onDistortionCorrectionChange: vi.fn(),
    onCameraAction: vi.fn(),
    onFileSelected: vi.fn(),
    onCapture: vi.fn(),
    isCapturing: false,
    ...overrides,
  };

  render(
    <MantineProvider defaultColorScheme="dark">
      <Toolbar {...props} />
    </MantineProvider>,
  );

  return props;
}

describe('Toolbar', () => {
  it('emits lens change from the lens selector', async () => {
    const user = userEvent.setup();
    const props = renderToolbar();

    await user.click(screen.getByLabelText('50'));

    expect(props.onLensChange).toHaveBeenCalledWith('50mm');
  });

  it('emits camera control actions', async () => {
    const user = userEvent.setup();
    const props = renderToolbar();

    await user.click(screen.getByRole('button', { name: '左10' }));
    await user.click(screen.getByRole('button', { name: '上仰20' }));

    expect(props.onCameraAction).toHaveBeenNthCalledWith(1, 'yawLeft10');
    expect(props.onCameraAction).toHaveBeenNthCalledWith(2, 'pitchUp20');
  });

  it('emits capture action', async () => {
    const user = userEvent.setup();
    const props = renderToolbar();

    await user.click(screen.getByRole('button', { name: /拍照/ }));

    expect(props.onCapture).toHaveBeenCalledTimes(1);
  });

  it('emits mirror toggle action', async () => {
    const user = userEvent.setup();
    const props = renderToolbar();

    await user.click(screen.getByRole('button', { name: '镜像' }));

    expect(props.onToggleMirror).toHaveBeenCalledTimes(1);
  });

  it('emits distortion correction switch changes', async () => {
    const user = userEvent.setup();
    const props = renderToolbar();

    await user.click(screen.getByRole('switch', { name: '去畸变' }));

    expect(props.onDistortionCorrectionChange).toHaveBeenCalledWith(false);
  });
});
