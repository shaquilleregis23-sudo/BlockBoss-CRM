// Feature 1b: Fat-Finger Dispositions — fixed bar shown when a lead sheet is open
(function () {
  const BTNS = [
    { disp: 'not_home',   ico: '🚶', label: 'Not Home',   cls: 'f-nh'  },
    { disp: 'callback',   ico: '📞', label: 'Callback',   cls: 'f-cb'  },
    { disp: 'interested', ico: '⚡', label: 'Interested', cls: 'f-int' },
    { disp: 'set',        ico: '✅', label: 'Set Appt',   cls: 'f-set' },
  ];

  function build() {
    if (document.getElementById('fatDisp')) return;
    const bar = document.createElement('div');
    bar.id = 'fatDisp';
    bar.className = 'fat-disp';
    bar.setAttribute('aria-label', 'Quick disposition bar');
    bar.innerHTML = '<div class="fat-disp-row">' +
      BTNS.map(function (b) {
        return '<button class="fat-btn ' + b.cls + '" data-disp="' + b.disp + '" aria-label="' + b.label + '">' +
          '<span class="fat-ico">' + b.ico + '</span>' +
          '<span>' + b.label + '</span></button>';
      }).join('') +
      '</div>';

    bar.addEventListener('click', function (e) {
      const btn = e.target.closest('[data-disp]');
      if (!btn) return;
      bar.querySelectorAll('.fat-btn').forEach(function (b) { b.classList.remove('f-tapped'); });
      btn.classList.add('f-tapped');
      setTimeout(function () { btn.classList.remove('f-tapped'); }, 380);
      if (typeof parseAction === 'function') parseAction(e);
    });

    document.body.appendChild(bar);
  }

  function syncBar() {
    const sheet = document.getElementById('sheet');
    const bar = document.getElementById('fatDisp');
    if (!sheet || !bar) return;
    const open = sheet.classList.contains('open');
    bar.classList.toggle('visible', open);
    // Shift the bottom-nav so it doesn't overlap
    const nav = document.querySelector('.bottom-nav');
    if (nav) nav.style.paddingBottom = open ? '80px' : '';
  }

  document.addEventListener('DOMContentLoaded', function () {
    build();
    const sheet = document.getElementById('sheet');
    if (!sheet) return;
    new MutationObserver(syncBar).observe(sheet, { attributes: true, attributeFilter: ['class'] });
  });
})();
