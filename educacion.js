/* Apartado Educación (clientes y asesores).
 * Tres pantallas: 1) tarjetas de cursos (imagen, % de avance, total de módulos) -> 2) módulos del curso elegido -> 3) reproductor.
 * Lee los cursos del servidor (POST edu-estado) y reporta avance (POST edu-evento). Toda la validación (orden secuencial,
 * tiempo visto, URL del video solo si el módulo está desbloqueado) la hace el servidor; esto es solo la interfaz.
 * Cada página lo inicia con EDU.init({ api, getToken, irA, toast, onVencida }); "Volver" regresa a la pantalla desde donde se abrió.
 * Los cursos se agregan cargando un catálogo JSON en el servidor (scripts/educacion_publicar.js): sin tocar este código. */
const EDU = (function () {
  let cfg = null, origen = null, estado = null, cursoAct = null, modAct = null, iniciado = false, finEnviado = false, ultimoFin = 0, timer = null, enviando = Promise.resolve();
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const mmss = s => { s = Math.max(0, Math.round(Number(s) || 0)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  const urlImg = u => (/^(https:\/\/|\/[^/])/i.test(String(u || '')) ? String(u) : ''); // https o ruta del mismo sitio
  const SVG = {
    atras: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>',
    play: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>',
    check: '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    lock: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/></svg>',
    libro: '<svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2V5z"/><path d="M19 19v2H6"/></svg>',
  };

  async function api(ruta, cuerpo) {
    const token = cfg.getToken && cfg.getToken();
    const r = await fetch(cfg.api + '/' + ruta, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({}, cuerpo, { token })) });
    const t = await r.text(); let j = {}; try { j = t ? JSON.parse(t) : {}; } catch (e) {}
    if (r.status === 401 && cfg.onVencida) cfg.onVencida();
    return { status: r.status, j };
  }
  async function cargar() {
    try { const { status, j } = await api('edu-estado', {}); if (status === 200 && j && j.ok) { estado = j; return true; } } catch (e) {}
    return false;
  }
  const curso = id => (estado ? estado.cursos : []).find(c => c.curso === id);
  const modsDe = c => c.niveles.flatMap(n => n.modulos);
  const buscar = (cid, id) => { const c = curso(cid); const m = c && modsDe(c).find(x => x.id === id); return m ? Object.assign({ cursoId: cid }, m) : null; };
  function actualDelCurso(cid) { const c = curso(cid); if (!c) return null; const ms = modsDe(c); return ms.find(m => m.estado === 'en_curso') || ms.find(m => m.estado === 'disponible') || null; }
  function proximoDelCurso(cid, idActual) { // el siguiente módulo dentro del MISMO curso, si ya está desbloqueado
    const c = curso(cid); if (!c) return null; const ms = modsDe(c), i = ms.findIndex(x => x.id === idActual), s = ms[i + 1];
    return s && s.estado !== 'bloqueado' ? Object.assign({ cursoId: cid }, s) : null;
  }

  /* ---------- pantallas ---------- */
  function cabecera(idVolver, idTitulo, idSub, titulo, sub, logo) {
    return '<header class="app-header"><button class="edu-back" id="' + idVolver + '" aria-label="Volver">' + SVG.atras + '</button>' +
      '<div class="header-info"><h1 id="' + idTitulo + '">' + esc(titulo) + '</h1><p id="' + idSub + '">' + esc(sub) + '</p></div><img src="' + esc(logo) + '" alt="" class="header-logo"></header>';
  }
  function construir() {
    if ($('screenEducacion')) return;
    const l = document.querySelector('.header-logo'); const logo = l && l.getAttribute('src') ? l.getAttribute('src') : 'logo-color.png';
    const wrap = document.createElement('div');
    wrap.innerHTML =
      '<div class="screen" id="screenEducacion">' + cabecera('eduVolver', 'eduH', 'eduSub', 'Educación', 'Elige un curso', logo) + '<div class="scroll" id="eduScroll"></div></div>' +
      '<div class="screen" id="screenCurso">' + cabecera('eduVolverCurso', 'eduCursoH', 'eduCursoSub', 'Curso', '', logo) + '<div class="scroll" id="eduCursoScroll"></div></div>' +
      '<div class="screen" id="screenReproductor">' + cabecera('eduVolver2', 'eduPlayerH', 'eduPlayerSub', 'Módulo', '', logo) +
      '<div class="scroll" id="eduPlayerScroll">' +
      '<div class="edu-video-wrap"><video id="eduVideo" controls playsinline preload="metadata" controlsList="nodownload" disablePictureInPicture></video><div class="edu-video-msg" id="eduVideoMsg" role="status"></div></div>' +
      '<div class="card"><div class="card-title" id="eduModNivel"></div><div class="edu-titulo" id="eduModTitulo"></div><p class="edu-resumen" id="eduModResumen"></p>' +
      '<div class="edu-estado" id="eduModEstado"></div></div>' +
      '<button class="btn btn-primary" id="eduSiguiente" style="display:none">Siguiente módulo →</button></div></div>';
    while (wrap.firstChild) document.body.appendChild(wrap.firstChild);
    $('eduVolver').onclick = () => cfg.irA(origen || 'screenDashboard');
    $('eduVolverCurso').onclick = () => { pintarCursos(); cfg.irA('screenEducacion'); };
    $('eduVolver2').onclick = () => { pulso(); iniciado = false; cerrarReproductor(); volverAlCurso(); }; // guarda el avance ya: el evento 'pause' llega tarde
    $('eduSiguiente').onclick = () => { const s = modAct && proximoDelCurso(cursoAct, modAct.id); if (s) abrirModulo(s.cursoId, s.id); };
    const v = $('eduVideo');
    v.addEventListener('loadedmetadata', () => { const m = modAct; if (m && m.posicion > 0 && m.estado !== 'completado' && v.duration && m.posicion < v.duration - 3) v.currentTime = m.posicion; });
    v.addEventListener('play', () => { empezar(); if (!timer) timer = setInterval(() => pulso(), 10000); });
    v.addEventListener('pause', () => { detenerTimer(); pulso(); });
    v.addEventListener('timeupdate', () => { if (v.duration && v.currentTime >= v.duration * 0.93) intentarFin(); });
    v.addEventListener('ended', () => { detenerTimer(); intentarFin(true); });
    v.addEventListener('error', () => mensaje('No se pudo cargar el video. Revisa tu conexión e inténtalo de nuevo.'));
    document.addEventListener('visibilitychange', () => { if (document.hidden && modAct) pulso(); });
  }
  const detenerTimer = () => { if (timer) { clearInterval(timer); timer = null; } };
  function mensaje(t) { const m = $('eduVideoMsg'); if (!m) return; m.textContent = t || ''; m.classList.toggle('on', !!t); }

  /* ---------- 1) tarjetas de cursos ---------- */
  function pintarCursos() {
    const cont = $('eduScroll');
    if (!estado || !estado.cursos.length) { cont.innerHTML = '<p class="edu-vacio">Todavía no hay cursos disponibles para ti.</p>'; return; }
    let html = '';
    for (const c of estado.cursos) {
      const img = urlImg(c.imagen), fin = c.porcentaje >= 100, ini = c.completados > 0;
      html += '<button class="edu-card" data-c="' + esc(c.curso) + '" aria-label="' + esc(c.titulo) + '">' +
        '<span class="edu-card-img"><span class="edu-card-ph">' + SVG.libro + '</span>' + (img ? '<img src="' + esc(img) + '" alt="" loading="lazy" onerror="this.remove()">' : '') +
        (fin ? '<span class="edu-badge">✓ Completado</span>' : '') + '</span>' +
        '<span class="edu-card-body"><span class="edu-card-t">' + esc(c.titulo) + '</span>' +
        (c.descripcion ? '<span class="edu-card-d">' + esc(c.descripcion) + '</span>' : '') +
        '<span class="edu-bar' + (fin ? ' edu-verde' : '') + '"><i style="width:' + c.porcentaje + '%"></i></span>' +
        '<span class="edu-card-m"><span>' + c.completados + ' de ' + c.total + ' módulos</span><b>' + c.porcentaje + '%</b></span>' +
        '<span class="edu-card-cta">' + (fin ? 'Repasar curso' : ini ? 'Continuar' : 'Empezar') + ' →</span></span></button>';
    }
    cont.innerHTML = html;
    cont.querySelectorAll('.edu-card').forEach(b => { b.onclick = () => abrirCurso(b.dataset.c); });
    const n = estado.cursos.length; $('eduSub').textContent = n === 1 ? '1 curso disponible' : n + ' cursos disponibles';
    cont.scrollTop = 0;
  }

  /* ---------- 2) módulos del curso elegido ---------- */
  function pintarCurso(cid) {
    const c = curso(cid); if (!c) return;
    $('eduCursoH').textContent = c.titulo; $('eduCursoSub').textContent = c.completados + ' de ' + c.total + ' módulos completados';
    const act = actualDelCurso(cid), fin = c.porcentaje >= 100;
    let html = '<div class="card edu-resumen-curso"><div class="edu-curso-head"><h2>Tu avance</h2><span>' + c.porcentaje + '%</span></div>' +
      '<div class="edu-bar' + (fin ? ' edu-verde' : '') + '"><i style="width:' + c.porcentaje + '%"></i></div>' +
      (c.descripcion ? '<p class="edu-resumen" style="margin-top:8px;">' + esc(c.descripcion) + '</p>' : '') + '</div>';
    if (act) html += '<button class="btn btn-primary edu-continuar" id="eduContinuar">' + (act.estado === 'en_curso' ? 'Continuar: ' : 'Empezar: ') + esc(act.titulo) + '</button>';
    for (const n of c.niveles) {
      html += '<div class="edu-nivel">Nivel ' + esc(n.nivel) + '<small>' + esc(n.nombre) + '</small></div>';
      for (const m of n.modulos) {
        const actual = !!act && act.id === m.id;
        const ico = m.estado === 'completado' ? SVG.check : m.estado === 'bloqueado' ? SVG.lock : SVG.play;
        const sub = m.estado === 'completado' ? 'Completado · ' + mmss(m.segundos) : m.estado === 'bloqueado' ? 'Se desbloquea al terminar el anterior' :
          m.estado === 'en_curso' ? 'En curso' + (m.segundos ? ' · ' + Math.min(99, Math.round(m.posicion / m.segundos * 100)) + '%' : '') : mmss(m.segundos);
        html += '<button class="edu-mod edu-' + esc(m.estado) + (actual ? ' edu-actual' : '') + '" data-m="' + esc(m.id) + '"' + (m.estado === 'bloqueado' ? ' aria-disabled="true"' : '') + '>' +
          '<span class="edu-ico">' + ico + '</span><span class="edu-body"><span class="edu-t">' + esc(m.titulo) + '</span><span class="edu-m">' + esc(sub) + '</span></span>' +
          '<span class="edu-chev" aria-hidden="true">›</span></button>';
      }
    }
    const cont = $('eduCursoScroll'); cont.innerHTML = html;
    cont.querySelectorAll('.edu-mod').forEach(b => { b.onclick = () => abrirModulo(cid, b.dataset.m); });
    const bc = $('eduContinuar'); if (bc && act) bc.onclick = () => abrirModulo(cid, act.id);
    cont.scrollTop = 0;
  }
  function abrirCurso(cid) { pintarCurso(cid); cfg.irA('screenCurso'); }
  async function volverAlCurso() { await enviando; await cargar(); if (curso(cursoAct)) abrirCurso(cursoAct); else { pintarCursos(); cfg.irA('screenEducacion'); } }

  /* ---------- 3) reproductor ---------- */
  function abrirModulo(cid, id) {
    const m = buscar(cid, id); if (!m) return;
    if (m.estado === 'bloqueado') { cfg.toast('Termina el módulo anterior para desbloquear este.'); return; }
    modAct = m; cursoAct = cid; iniciado = false; finEnviado = false; ultimoFin = 0; mensaje('');
    const c = curso(cid), niv = c.niveles.find(n => n.modulos.some(x => x.id === id));
    $('eduPlayerH').textContent = c.titulo; $('eduPlayerSub').textContent = 'Nivel ' + niv.nivel + ' · ' + niv.nombre;
    $('eduModNivel').textContent = 'Módulo ' + (modsDe(c).findIndex(x => x.id === id) + 1) + ' de ' + c.total;
    $('eduModTitulo').textContent = m.titulo; $('eduModResumen').textContent = m.resumen || '';
    pintarEstadoModulo(); $('eduSiguiente').style.display = m.estado === 'completado' && proximoDelCurso(cid, id) ? '' : 'none';
    const v = $('eduVideo'); v.pause();
    if (!m.url) { v.removeAttribute('src'); v.load(); mensaje('Este video estará disponible muy pronto.'); }
    else { v.src = m.url; v.load(); }
    cfg.irA('screenReproductor');
  }
  function pintarEstadoModulo() {
    const m = modAct, el = $('eduModEstado'); if (!m) return;
    el.className = 'edu-estado' + (m.estado === 'completado' ? ' ok' : '');
    el.textContent = m.estado === 'completado' ? '✓ Módulo completado' : 'Mira el video completo para desbloquear el siguiente módulo.';
  }
  function cerrarReproductor() { const v = $('eduVideo'); if (v) v.pause(); detenerTimer(); }
  function enviar(accion) {
    const v = $('eduVideo'), m = modAct; if (!m) return Promise.resolve({ status: 0, j: {} });
    const cuerpo = { curso: cursoAct, modulo: m.id, accion, posicion: Math.floor(v.currentTime || 0) };
    enviando = enviando.then(() => api('edu-evento', cuerpo)).catch(() => ({ status: 0, j: {} }));
    return enviando;
  }
  function empezar() { if (iniciado || !modAct || modAct.estado === 'completado') return; iniciado = true; enviar('inicio'); }
  function pulso() { if (!iniciado || !modAct || modAct.estado === 'completado' || finEnviado) return; enviar('pulso'); }
  async function intentarFin(porFinal) {
    const m = modAct; if (!m || m.estado === 'completado' || finEnviado) return;
    if (Date.now() - ultimoFin < 15000 && !porFinal) return; ultimoFin = Date.now(); finEnviado = true;
    if (!iniciado) { iniciado = true; await enviar('inicio'); }
    const r = await enviar('fin');
    if (r.status === 200 && r.j && r.j.completado) {
      m.estado = 'completado'; await cargar(); modAct = buscar(cursoAct, m.id) || m; pintarEstadoModulo();
      mensaje(''); cfg.toast('¡Módulo completado!'); const s = proximoDelCurso(cursoAct, m.id); $('eduSiguiente').style.display = s ? '' : 'none';
      if (!s) cfg.toast('¡Terminaste este curso! 🎉', 4000);
    } else {
      finEnviado = false; // permite reintentar más adelante (p. ej. si sigue viendo)
      mensaje(r.status === 0 ? 'Sin conexión: no pudimos guardar tu avance. Se reintentará.' : (r.j && r.j.error) || 'No se pudo guardar tu avance.');
    }
  }

  /* ---------- API pública ---------- */
  async function abrir() {
    const act = document.querySelector('.screen.active');
    if (act && !['screenEducacion', 'screenCurso', 'screenReproductor'].includes(act.id)) origen = act.id;
    construir(); await enviando; /* que el último avance llegue al servidor antes de leer el estado */
    const ok = await cargar(); if (!ok) { cfg.toast('No pudimos cargar los cursos. Inténtalo de nuevo.'); return; }
    pintarCursos(); cfg.irA('screenEducacion');
  }
  async function refrescarEntrada() {
    const tarjetas = document.querySelectorAll('[data-edu-entrada]'); if (!tarjetas.length || !cfg || !(cfg.getToken && cfg.getToken())) return;
    const ok = await cargar(); const hay = ok && estado.cursos.length;
    tarjetas.forEach(t => { t.style.display = hay ? '' : 'none'; });
    if (!hay) return;
    const tot = estado.cursos.reduce((a, c) => a + c.total, 0), hec = estado.cursos.reduce((a, c) => a + c.completados, 0), pct = tot ? Math.round(hec / tot * 100) : 0;
    document.querySelectorAll('[data-edu-bar]').forEach(e => { e.style.width = pct + '%'; });
    document.querySelectorAll('[data-edu-txt]').forEach(e => { e.textContent = (estado.cursos.length === 1 ? '1 curso' : estado.cursos.length + ' cursos') + ' · ' + hec + ' de ' + tot + ' módulos completados'; });
  }
  function init(c) { cfg = c; }
  return { init, abrir, refrescarEntrada, _estado: () => estado };
})();
