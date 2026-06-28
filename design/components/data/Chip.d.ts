import * as React from 'react';

export interface ChipProps {
  children?: React.ReactNode;
  /** @default 'nearby' */
  tone?: 'nearby' | 'primary' | 'amber' | 'neutral';
  /** Frosted-glass overlay style (for over imagery). @default false */
  glass?: boolean;
  /** Optional leading Material Symbols icon. */
  icon?: string;
  style?: React.CSSProperties;
}

/** Fully-rounded pill: distance tag, source chip, glass overlay tag. */
export function Chip(props: ChipProps): React.ReactElement;
