A single message in the AI legal-procedures assistant. Assistant messages are white with a blue label, avatar, and optional italic disclaimer; user messages are solid blue, right-aligned.

```jsx
<ChatBubble role="assistant" avatar="assets/icon.png"
  disclaimer="Nội dung tổng hợp bằng AI nên có thể có sai sót, vui lòng kiểm chứng lại.">
  Xin chào! Tôi có thể giúp gì cho bạn hôm nay?
</ChatBubble>
<ChatBubble role="user">Thủ tục làm CCCD cần giấy tờ gì?</ChatBubble>
```

The "tail" corner (5px radius) points toward the speaker. Both bubbles fade-and-rise in on mount in the real app.
