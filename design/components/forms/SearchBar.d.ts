import * as React from 'react';

export interface SearchBarProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'style'> {
  placeholder?: string;
  /** Leading Material Symbols icon. @default 'search' */
  icon?: string;
  style?: React.CSSProperties;
}

/** Rounded-full search input with leading icon and brand focus ring. */
export function SearchBar(props: SearchBarProps): React.ReactElement;
