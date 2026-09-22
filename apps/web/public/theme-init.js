// Applies the saved theme before first paint to avoid a flash. Loaded as a blocking
// external script (not inline) so it works under the API's `script-src 'self'` CSP.
(function () {
  var pref = 'system';
  try {
    pref = localStorage.getItem('leados-theme') || 'system';
  } catch (e) {}
  var dark =
    pref === 'dark' ||
    (pref === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  if (dark) document.documentElement.classList.add('dark');
})();
