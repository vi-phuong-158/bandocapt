import * as React from 'react';

export interface InfoRowProps {
  /** Material Symbols icon name (shown in a round medallion). */
  icon: string;
  /** Small muted label, e.g. "Địa chỉ". */
  label: string;
  /** Main value. */
  value: React.ReactNode;
  /** Makes the row a link (e.g. tel:) and bolds the value. */
  href?: string;
  style?: React.CSSProperties;
}

/** Labelled detail line with a round icon medallion. */
export function InfoRow(props: InfoRowProps): React.ReactElement;
