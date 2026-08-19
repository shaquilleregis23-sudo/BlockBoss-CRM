// Feature 1: Sun Mode — high-contrast outdoor toggle
(function () {
  const KEY = 'm2_sun_mode';

  function apply(on) {
    document.body.classList.toggle('sun-mode', on);
    const btn = document.getElementById('sunToggle');
    if (btn) {
      btn.classList.toggle('active', on);
      btn.title = on ? 'Sun Mode ON — tap to disable' : 'Enable Sun Mode';
    }
    localStorage.setItem(KEY, on ? '1' : '0');
  }

  document.addEventListener('DOMContentLoaded', function () {
    if (localStorage.getItem(KEY) === '1') apply(true);
  });

  document.addEventListener('click', function (e) {
    if (e.target.closest('#sunToggle')) {
      apply(!document.body.classList.contains('sun-mode'));
    }
  });
})();
