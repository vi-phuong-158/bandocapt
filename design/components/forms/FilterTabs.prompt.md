Segmented multi-select pill toggles inside a sunken track — the map's category filter. Active pill lifts to a white chip with the option's accent color.

```jsx
<FilterTabs
  selected={['police','cccd']}
  onToggle={id => toggle(id)}
  options={[
    { id:'police', label:'Công an', icon:'local_police' },
    { id:'cccd', label:'Điểm CCCD', icon:'badge', color:'var(--color-cccd)' },
    { id:'nearby', label:'Gần tôi', icon:'near_me', color:'var(--color-nearby)' },
  ]}
/>
```

Multi-select by default (each pill toggles independently). Give each option a distinct `color` to match its marker.
