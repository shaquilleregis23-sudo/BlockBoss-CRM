// Feature 4: Voice-to-Text — Hold to Talk → appends transcript to lead notes
(function () {
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return; // Silently skip on unsupported browsers

  var rec = null;
  var active = false;

  function getNotesField() {
    return document.querySelector('#sheetBody textarea');
  }

  function setBtnState(btn, listening) {
    active = listening;
    btn.classList.toggle('listening', listening);
    if (listening) {
      btn.innerHTML = '<span class="v-ico">🎙️</span><span class="voice-pulse"></span>Listening…';
    } else {
      btn.innerHTML = '<span class="v-ico">🎙️</span>Hold to Talk';
    }
  }

  function start(btn) {
    if (active) return;
    rec = new SR();
    rec.lang = 'en-US';
    rec.continuous = false;
    rec.interimResults = false;

    rec.onresult = function (e) {
      var text = e.results[0][0].transcript.trim();
      var field = getNotesField();
      if (field) {
        field.value = field.value ? field.value + ' ' + text : text;
        field.dispatchEvent(new Event('input', { bubbles: true }));
      }
      if (typeof toast === 'function') {
        toast('🎙 "' + text.slice(0, 42) + (text.length > 42 ? '…' : '') + '"');
      }
    };
    rec.onerror = function (e) {
      if (e.error !== 'aborted' && typeof toast === 'function') toast('Mic: ' + e.error);
      setBtnState(btn, false);
    };
    rec.onend = function () { setBtnState(btn, false); };

    try { rec.start(); setBtnState(btn, true); }
    catch (err) { setBtnState(btn, false); }
  }

  function stop(btn) {
    if (!active) return;
    setBtnState(btn, false);
    if (rec) { try { rec.stop(); } catch (e) {} rec = null; }
  }

  function injectButton() {
    if (document.getElementById('voiceBtn')) return;
    var sheet = document.getElementById('sheetBody');
    if (!sheet) return;
    var anchor = sheet.querySelector('.form-row');
    if (!anchor) return;

    var btn = document.createElement('button');
    btn.id = 'voiceBtn';
    btn.type = 'button';
    btn.className = 'voice-btn';
    btn.innerHTML = '<span class="v-ico">🎙️</span>Hold to Talk';

    // Mobile: touchstart / touchend
    btn.addEventListener('touchstart', function (e) { e.preventDefault(); start(btn); }, { passive: false });
    btn.addEventListener('touchend',   function (e) { e.preventDefault(); stop(btn); });
    btn.addEventListener('touchcancel',function ()  { stop(btn); });
    // Desktop: mousedown / mouseup
    btn.addEventListener('mousedown',  function () { start(btn); });
    btn.addEventListener('mouseup',    function () { stop(btn); });
    btn.addEventListener('mouseleave', function () { if (active) stop(btn); });

    // Insert after the first form-row so it sits right under notes
    anchor.after(btn);
  }

  // Re-inject each time the sheet body re-renders
  document.addEventListener('DOMContentLoaded', function () {
    var body = document.getElementById('sheetBody');
    if (!body) return;
    new MutationObserver(function () {
      var sheet = document.getElementById('sheet');
      if (sheet && sheet.classList.contains('open')) {
        setTimeout(injectButton, 80);
      }
    }).observe(body, { childList: true });
  });
})();
