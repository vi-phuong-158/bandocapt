Circular, icon-only control. `fab` is the round blue map button ("my location"); `glass` and `scrim` are frosted buttons that float over the map or detail image.

```jsx
<IconButton variant="fab" icon="my_location" fill label="Tìm vị trí của tôi" size="lg" />
<IconButton variant="glass" icon="add" label="Phóng to" size="lg" />
<IconButton variant="scrim" icon="arrow_back" label="Quay lại" />
```

Variants: `fab` (solid blue + glow), `glass` (frosted white), `scrim` (dark frosted, for over imagery), `soft`, `ghost`. `label` is required for a11y.
