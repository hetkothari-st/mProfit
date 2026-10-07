// Applied before first paint so a dark-theme user never sees a light flash.
// A separate file (not inline in index.html) so the Content-Security-Policy
// can forbid inline scripts entirely.
(function () {
  try {
    var t = JSON.parse(localStorage.getItem('everypaisa.theme') || localStorage.getItem('portfolioos.theme') || '{}');
    var dark = t.state ? t.state.dark !== false : true;
    if (dark) document.documentElement.classList.add('dark');
  } catch (e) {
    document.documentElement.classList.add('dark');
  }
})();
