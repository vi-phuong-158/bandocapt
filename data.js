let locations = [];

// Kill switch for the independent "Nhà trọ an toàn — Beta" layer. Keeping this
// false makes the browser skip both the beta module request and all beta data.
// This configuration is intentionally separate from Published_Locations.
window.ACCOMMODATION_BETA_CONFIG = Object.freeze({
  enabled: false,
  pilotLocalityCodes: [],
  records: []
});
