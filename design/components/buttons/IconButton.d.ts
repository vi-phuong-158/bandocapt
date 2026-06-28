import * as React from 'react';

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Material Symbols icon name. */
  icon: string;
  /** @default 'ghost' */
  variant?: 'ghost' | 'soft' | 'glass' | 'fab' | 'scrim';
  /** @default 'md' */
  size?: 'sm' | 'md' | 'lg';
  /** Fill the icon glyph. @default false */
  fill?: boolean;
  /** Accessible label (required — icon-only). */
  label: string;
}

/** Circular icon-only control: map FAB, zoom, close, back. */
export function IconButton(props: IconButtonProps): React.ReactElement;
