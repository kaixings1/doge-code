/* Apply the saved theme before rendering. Light is the default. */
(() => {
  let mode = 'light';
  try { mode = localStorage.getItem('workbuddy-desktop-theme') || 'light'; } catch { /* storage unavailable */ }
  document.documentElement.dataset.theme = mode;
  const dark = mode === 'dark' || (mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
})();
