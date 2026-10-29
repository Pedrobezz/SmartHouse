// aplica o tema antes de desenhar a página (evita "piscar")
(function () {
  function resolve() {
    var t = 'system';
    try { t = localStorage.getItem('theme') || 'system'; } catch (e) {}
    if (t === 'system') t = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    return t;
  }
  function apply() { document.documentElement.setAttribute('data-theme', resolve()); }
  apply();
  window.__applyTheme = apply;
  window.__resolveTheme = resolve;
  try { window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', function () { apply(); window.dispatchEvent(new Event('themechange')); }); } catch (e) {}
  window.addEventListener('storage', function (e) { if (e.key === 'theme') { apply(); window.dispatchEvent(new Event('themechange')); } });
})();
