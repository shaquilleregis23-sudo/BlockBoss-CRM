// Feature 3: Hit Feed — live company activity toasts (non-blocking, top of screen)
(function () {
  var wrap = null;
  var queue = [];
  var showing = false;

  var EMOJIS = ['🔥', '⚡', '🎯', '💪', '🏆', '✅', '🌟'];

  function ensureWrap() {
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.className = 'hit-feed-wrap';
      document.body.appendChild(wrap);
    }
  }

  function drainQueue() {
    if (showing || !queue.length) return;
    var item = queue.shift();
    showing = true;

    ensureWrap();
    var el = document.createElement('div');
    el.className = 'hit-toast';
    el.innerHTML =
      '<div class="hit-avatar">' + item.ico + '</div>' +
      '<div class="hit-body">' +
        '<div class="hit-name">' + item.name + '</div>' +
        '<div class="hit-msg">' + item.msg + '</div>' +
      '</div>';

    wrap.prepend(el);
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { el.classList.add('show'); });
    });

    setTimeout(function () {
      el.classList.add('hide');
      el.classList.remove('show');
      setTimeout(function () {
        el.remove();
        showing = false;
        drainQueue();
      }, 320);
    }, 4200);
  }

  // Public API — call from anywhere (Supabase realtime, demoMode, etc.)
  window.showHit = function (msg, name, ico) {
    queue.push({
      msg:  msg  || '',
      name: name || 'Team',
      ico:  ico  || EMOJIS[Math.floor(Math.random() * EMOJIS.length)],
    });
    drainQueue();
  };

  // Demo burst — called by demoMode() in leads.js (wire it up there if desired)
  window.hitFeedDemo = function () {
    var hits = [
      ['Marcus J.',  '🔥', 'just set an appointment at 102-14 Sutphin Blvd!'],
      ['Kezia P.',   '⚡', 'marked 88-20 Hillside Ave as Interested'],
      ['Tyrese A.',  '🎯', 'knocked 12 doors in the last hour — keep it up'],
      ['Marcus J.',  '🏆', 'closed a deal on 145-22 Liberty Ave 🎉'],
    ];
    hits.forEach(function (h, i) {
      setTimeout(function () { window.showHit(h[2], h[0], h[1]); }, i * 2400 + 800);
    });
  };
})();
