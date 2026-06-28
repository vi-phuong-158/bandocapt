import * as React from 'react';

export interface FilterOption {
  id: string;
  label: string;
  /** Material Symbols icon name. */
  icon: string;
  /** Active accent color (CSS value). @default 'var(--color-primary)' */
  color?: string;
}

export interface FilterTabsProps {
  options: FilterOption[];
  /** Active option ids (multi-select). */
  selected: string[];
  onToggle?: (id: string) => void;
  style?: React.CSSProperties;
}

/** Segmented pill toggles in a sunken track — Công an / CCCD / Gần tôi. */
export function FilterTabs(props: FilterTabsProps): React.ReactElement;
