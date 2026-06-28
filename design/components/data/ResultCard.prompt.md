A search-result row in the side panel: colored icon box (blue police / amber CCCD), bold title, truncated address, optional emerald distance chip. Frosted, lifts 2px on hover.

```jsx
<ResultCard
  type="police"
  title="Công an phường Việt Trì"
  address="Số 12 Đại lộ Hùng Vương, Việt Trì"
  distance="1.2 km"
  onClick={() => select(id)}
/>
```

`type` is `police` or `cccd`. Stack these in the scrollable results list.
