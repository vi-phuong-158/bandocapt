import * as React from 'react';

export interface ChatLauncherProps {
  /** Main label. @default 'Hỏi đáp AI' */
  label?: string;
  /** Smaller second line. @default 'Trợ lý pháp luật · 24/7' */
  sublabel?: string;
  /** Avatar image src (e.g. the mascot icon.png). Falls back to `icon`. */
  avatar?: string;
  /** Material Symbols icon used when no avatar. @default 'chat_bubble' */
  icon?: string;
  /** Show the pulsing attention ring. @default true */
  pulse?: boolean;
  onClick?: () => void;
  style?: React.CSSProperties;
}

/** Prominent floating launcher that opens the AI assistant. */
export function ChatLauncher(props: ChatLauncherProps): React.ReactElement;
