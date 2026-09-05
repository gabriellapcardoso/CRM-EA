/* nav-toggle.js — único JS do pacote: oculta/mostra o menu lateral.
   O estado fica em localStorage pra não voltar sozinho ao navegar entre telas. */
(function () {
  var KEY = 'crm-nav-collapsed';
  var app = document.querySelector('.app');
  var btn = document.querySelector('.nav-toggle');
  if (!app) return;
  if (localStorage.getItem(KEY) === '1') app.classList.add('app--nav-collapsed');
  if (!btn) return;
  var sync = function () {
    var off = app.classList.contains('app--nav-collapsed');
    btn.setAttribute('aria-expanded', off ? 'false' : 'true');
  };
  sync();
  btn.addEventListener('click', function () {
    var off = app.classList.toggle('app--nav-collapsed');
    localStorage.setItem(KEY, off ? '1' : '0');
    sync();
  });
})();
