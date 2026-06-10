/* Veil — 상단 네비 드롭다운 (모든 페이지 공용, 자족형) */
(function () {
  var items = document.querySelectorAll('.nav-item');
  if (!items.length) return;
  function closeAll(except) {
    items.forEach(function (it) {
      if (it !== except) {
        it.classList.remove('open');
        var b = it.querySelector('.nav-top');
        if (b) b.setAttribute('aria-expanded', 'false');
      }
    });
  }
  items.forEach(function (it) {
    var btn = it.querySelector('.nav-top');
    if (!btn) return;
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      var isOpen = it.classList.contains('open');
      closeAll(it);
      it.classList.toggle('open', !isOpen);
      btn.setAttribute('aria-expanded', String(!isOpen));
    });
  });
  document.addEventListener('click', function (e) {
    if (!e.target.closest('.nav-item')) closeAll(null);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeAll(null);
  });
})();
