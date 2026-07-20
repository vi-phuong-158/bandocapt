import React from 'react';
import { Composition } from 'remotion';
import { RagSlideAnimation } from './RagSlideAnimation';
import { DURATION_IN_FRAMES, FPS, VIDEO_HEIGHT, VIDEO_WIDTH } from './geometry';

export const Root: React.FC = () => {
  return (
    <>
      <Composition
        id="RagSlideAnimation"
        component={RagSlideAnimation}
        durationInFrames={DURATION_IN_FRAMES}
        fps={FPS}
        width={VIDEO_WIDTH}
        height={VIDEO_HEIGHT}
      />
    </>
  );
};
