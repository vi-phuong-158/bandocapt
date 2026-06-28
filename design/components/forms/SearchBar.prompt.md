Rounded-full search field with a leading Material Symbols icon — the primary "find a unit" control in the side panel.

```jsx
<SearchBar placeholder="Nhập tên đơn vị, phường xã..." onChange={e => setQuery(e.target.value)} />
```

Frosted slate-50 fill at rest; turns white with a blue focus ring on focus. Pair with `FilterTabs` below it.
