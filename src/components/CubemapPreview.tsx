import { useState } from 'react';
import { Modal, Text } from '@mantine/core';
import type { CubemapFace } from '../lib/cubemap';

type CubemapPreviewProps = {
  faces: CubemapFace[];
};

export function CubemapPreview({ faces }: CubemapPreviewProps) {
  const [activeFace, setActiveFace] = useState<CubemapFace | null>(null);

  if (faces.length === 0) {
    return null;
  }

  return (
    <>
      <section className="cubemap-preview" aria-label="Cubemap 预览">
        {faces.map((face) => (
          <button
            className="cubemap-tile"
            key={face.id}
            type="button"
            onClick={() => setActiveFace(face)}
          >
            <img src={face.dataUrl} alt={`${face.label}面 cubemap`} />
            <Text className="cubemap-label" size="xs" c="dimmed">
              {face.label}
            </Text>
          </button>
        ))}
      </section>

      <Modal
        centered
        opened={Boolean(activeFace)}
        onClose={() => setActiveFace(null)}
        size="xl"
        title={activeFace ? `${activeFace.label}面 cubemap` : undefined}
      >
        {activeFace && (
          <img
            className="cubemap-modal-image"
            src={activeFace.dataUrl}
            alt={`${activeFace.label}面 cubemap 放大图`}
          />
        )}
      </Modal>
    </>
  );
}
