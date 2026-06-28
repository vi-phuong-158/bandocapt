The prominent floating launcher that opens the AI assistant — mascot avatar, two-line label, online dot, and a pulsing attention ring with a strong brand glow. Fixed bottom-right (or bottom-center on mobile).

```jsx
<ChatLauncher avatar="assets/icon.png" onClick={() => setChatOpen(true)} />
```

Pass the mascot `avatar` (icon.png) so the assistant has a face. Set `pulse={false}` to calm it once the user has engaged. Keep the green online dot — it signals "available now".
