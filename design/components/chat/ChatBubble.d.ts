import * as React from 'react';

export interface ChatBubbleProps {
  /** @default 'assistant' */
  role?: 'assistant' | 'user';
  children?: React.ReactNode;
  /** Assistant label above the message. @default 'Trợ lý hỗ trợ pháp luật' */
  label?: string;
  /** Assistant avatar image src. */
  avatar?: string;
  /** Italic footnote shown under an assistant message. */
  disclaimer?: string;
  style?: React.CSSProperties;
}

/** One AI-assistant message — white (assistant) or blue (user). */
export function ChatBubble(props: ChatBubbleProps): React.ReactElement;
