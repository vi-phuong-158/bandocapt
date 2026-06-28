import * as React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual style. @default 'primary' */
  variant?: 'primary' | 'secondary' | 'ghost' | 'amber' | 'soft';
  /** @default 'md' */
  size?: 'sm' | 'md' | 'lg';
  /** Material Symbols icon name shown before the label. */
  icon?: string;
  /** Material Symbols icon name shown after the label. */
  iconRight?: string;
  /** Stretch to container width. @default false */
  fullWidth?: boolean;
  disabled?: boolean;
  children?: React.ReactNode;
}

/**
 * Pill-shaped action button in the public-security blue brand.
 *
 * @startingPoint section="Buttons" subtitle="Primary pill action + variants" viewport="700x150"
 */
export function Button(props: ButtonProps): React.ReactElement;
