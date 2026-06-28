import * as React from 'react';

export interface BadgeProps {
  children?: React.ReactNode;
  /** @default 'primary' */
  tone?: 'primary' | 'amber' | 'nearby' | 'neutral';
  /** Soft tinted fill instead of solid. @default false */
  soft?: boolean;
  /** Optional leading Material Symbols icon. */
  icon?: string;
  style?: React.CSSProperties;
}

/** Small category / status label. Square-ish radius. */
export function Badge(props: BadgeProps): React.ReactElement;
