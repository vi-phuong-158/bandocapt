import * as React from 'react';

export interface ResultCardProps {
  title: string;
  address: string;
  /** Unit type → icon + color. @default 'police' */
  type?: 'police' | 'cccd';
  /** Distance label (e.g. "1.2 km"). Renders an emerald chip when set. */
  distance?: string;
  onClick?: () => void;
  style?: React.CSSProperties;
}

/**
 * Search-result row: colored icon box + title + address + distance.
 *
 * @startingPoint section="Map" subtitle="Search result card with distance" viewport="420x110"
 */
export function ResultCard(props: ResultCardProps): React.ReactElement;
