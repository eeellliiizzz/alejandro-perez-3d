// Filtro de proyectos de la portada. Sin JavaScript se ven todos.
(() => {
  const rejilla = document.querySelector('.rejilla');
  if (!rejilla) return;
  const tarjetas = [...rejilla.children];
  const botones = [...document.querySelectorAll('.filtros button')];
  const estado = document.getElementById('filtro-estado');
  const lang = document.documentElement.lang;

  // mismo cálculo que anchos_rejilla() en herramientas/genera.py
  const anchos = (n) => {
    const ciclo = [[7, 5], [5, 7], [6, 6], [4, 4, 4]], out = [];
    for (let i = 0; n > 0; i++) {
      let fila = ciclo[i % ciclo.length];
      if (n < fila.length) fila = n === 1 ? [12] : [6, 6];
      out.push(...fila); n -= fila.length;
    }
    return out;
  };

  const aplica = (filtro, anunciar) => {
    const visibles = tarjetas.filter((t) => filtro === 'todos' || t.dataset.filtro === filtro);
    const tam = anchos(visibles.length);
    tarjetas.forEach((t) => {
      t.hidden = !visibles.includes(t);
      t.className = t.className.replace(/\bs\d+\b/g, '').trim();
    });
    visibles.forEach((t, i) => t.classList.add('s' + tam[i]));
    botones.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.filtro === filtro)));
    const url = new URL(location.href);
    if (filtro === 'todos') url.searchParams.delete('filtro'); else url.searchParams.set('filtro', filtro);
    history.replaceState(null, '', url);
    if (anunciar && estado) {
      const n = visibles.length;
      estado.textContent = lang === 'en' ? `${n} project${n === 1 ? '' : 's'}` : `${n} proyecto${n === 1 ? '' : 's'}`;
    }
  };

  botones.forEach((b) => b.addEventListener('click', () => aplica(b.dataset.filtro, true)));
  const inicial = new URLSearchParams(location.search).get('filtro');
  if (inicial && botones.some((b) => b.dataset.filtro === inicial)) aplica(inicial, false);
})();

// Visor de imágenes de las fichas. Sin JavaScript, cada imagen abre su versión grande.
(() => {
  const visor = document.querySelector('.visor');
  if (!visor || typeof visor.showModal !== 'function') return;
  const enlaces = [...document.querySelectorAll('a[data-lb]')];
  const img = visor.querySelector('img');
  const pie = visor.querySelector('.visor-pie');
  let actual = 0, origen = null;

  const muestra = (i) => {
    actual = (i + enlaces.length) % enlaces.length;
    const a = enlaces[actual];
    const mini = a.querySelector('img');
    img.src = a.href;
    img.alt = mini ? mini.alt : '';
    const fig = a.closest('figure');
    const cap = fig && fig.querySelector('figcaption');
    pie.textContent = cap ? cap.textContent.trim() : '';
  };

  enlaces.forEach((a, i) => a.addEventListener('click', (ev) => {
    if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.button !== 0) return;
    ev.preventDefault();
    origen = a;
    muestra(i);
    visor.showModal();
    visor.querySelector('.visor-cerrar').focus();
  }));

  visor.querySelector('.visor-cerrar').addEventListener('click', () => visor.close());
  visor.querySelector('.visor-ant').addEventListener('click', () => muestra(actual - 1));
  visor.querySelector('.visor-sig').addEventListener('click', () => muestra(actual + 1));
  visor.addEventListener('keydown', (ev) => {
    if (ev.key === 'ArrowLeft') { ev.preventDefault(); muestra(actual - 1); }
    if (ev.key === 'ArrowRight') { ev.preventDefault(); muestra(actual + 1); }
  });
  visor.addEventListener('click', (ev) => { if (ev.target === visor) visor.close(); });
  visor.addEventListener('close', () => { img.removeAttribute('src'); if (origen) origen.focus(); });

  // gesto de deslizar en pantallas táctiles
  let x0 = null;
  visor.addEventListener('touchstart', (ev) => { x0 = ev.touches[0].clientX; }, { passive: true });
  visor.addEventListener('touchend', (ev) => {
    if (x0 === null) return;
    const dx = ev.changedTouches[0].clientX - x0;
    if (Math.abs(dx) > 50) muestra(actual + (dx < 0 ? 1 : -1));
    x0 = null;
  });
})();

// Pausa del carrusel de marcas (WCAG 2.2.2).
(() => {
  const b = document.querySelector('.marcas-pausa');
  const m = document.querySelector('.marquesina');
  if (!b || !m) return;
  b.addEventListener('click', () => {
    const p = m.classList.toggle('pausada');
    b.setAttribute('aria-pressed', String(p));
    b.textContent = p ? b.dataset.seguir : b.dataset.pausar;
  });
})();

// Hero: los renders se «calculan» por bloques desde el centro, como en la ventana de render.
(() => {
  const hero = document.querySelector('.hero');
  const datosEl = document.getElementById('hero-datos');
  if (!hero || !datosEl) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const datos = JSON.parse(datosEl.textContent);
  const caja = hero.querySelector('.hero-visual');
  const lienzo = hero.querySelector('.hero-lienzo');
  const cubos = hero.querySelector('.hero-cubos');
  const ctx = lienzo.getContext('2d');
  const ctc = cubos.getContext('2d');
  const pie = hero.querySelector('.hero-pie');
  const pieT = hero.querySelector('.hero-pie-t');
  const pieM = hero.querySelector('.hero-pie-m');
  const nEl = hero.querySelector('.hero-n');
  const pctEl = hero.querySelector('.hero-pct');
  const boton = hero.querySelector('.hero-pausa');
  const ESPERA = 4800, DURACION = 3200, BLOQUE_MS = 380;

  let W = 0, H = 0, dpr = 1, actual = -1, imgActual = null, anim = null, temporizador = null;
  let pausado = false, visible = true;
  const cache = new Map();

  const elegirSrc = (src) => {
    const anchos = Object.keys(src).map(Number).sort((a, b) => a - b);
    const need = caja.clientWidth * Math.min(devicePixelRatio || 1, 2);
    return src[anchos.find((a) => a >= need) || anchos[anchos.length - 1]];
  };
  const carga = (i) => {
    const url = elegirSrc(datos[i].src);
    if (!cache.has(url)) cache.set(url, new Promise((ok, mal) => { const im = new Image(); im.decoding = 'async'; im.onload = () => ok(im); im.onerror = mal; im.src = url; }));
    return cache.get(url);
  };
  const medidas = () => {
    dpr = Math.min(devicePixelRatio || 1, 2);
    W = Math.round(caja.clientWidth * dpr); H = Math.round(caja.clientHeight * dpr);
    for (const c of [lienzo, cubos]) { c.width = W; c.height = H; }
  };
  const encaje = (im) => {
    const s = Math.max(W / im.naturalWidth, H / im.naturalHeight);
    const w = im.naturalWidth * s, h = im.naturalHeight * s;
    return [(W - w) / 2, (H - h) / 2, w, h];
  };
  const pintaTodo = (im) => { ctx.drawImage(im, ...encaje(im)); };

  const bloques = () => {
    const lado = Math.round(110 * dpr);
    const cols = Math.ceil(W / lado), filas = Math.ceil(H / lado);
    const cx = (cols - 1) / 2, cy = (filas - 1) / 2, lista = [];
    for (let y = 0; y < filas; y++) for (let x = 0; x < cols; x++) {
      const dx = x - cx, dy = y - cy;
      lista.push({ x: x * lado, y: y * lado, w: lado, h: lado, anillo: Math.max(Math.abs(dx), Math.abs(dy)), ang: Math.atan2(dy, dx) });
    }
    return lista.sort((a, b) => a.anillo - b.anillo || a.ang - b.ang);
  };

  const esquinas = (b) => {
    const l = Math.min(b.w, b.h) * 0.22;
    ctc.beginPath();
    ctc.moveTo(b.x, b.y + l); ctc.lineTo(b.x, b.y); ctc.lineTo(b.x + l, b.y);
    ctc.moveTo(b.x + b.w - l, b.y); ctc.lineTo(b.x + b.w, b.y); ctc.lineTo(b.x + b.w, b.y + l);
    ctc.moveTo(b.x + b.w, b.y + b.h - l); ctc.lineTo(b.x + b.w, b.y + b.h); ctc.lineTo(b.x + b.w - l, b.y + b.h);
    ctc.moveTo(b.x + l, b.y + b.h); ctc.lineTo(b.x, b.y + b.h); ctc.lineTo(b.x, b.y + b.h - l);
    ctc.stroke();
  };

  const renderiza = (im) => new Promise((fin) => {
    const lista = bloques(), n = lista.length, paso = DURACION / n, rect = encaje(im);
    let hechos = 0, t0 = null;
    ctc.strokeStyle = 'rgba(243,241,236,.9)'; ctc.lineWidth = Math.max(1, dpr);
    const fotograma = (t) => {
      if (t0 === null) t0 = t;
      const e = t - t0;
      ctc.clearRect(0, 0, W, H);
      while (hechos < n && e >= hechos * paso + BLOQUE_MS) {
        const b = lista[hechos++];
        ctx.save(); ctx.beginPath(); ctx.rect(b.x, b.y, b.w, b.h); ctx.clip(); ctx.drawImage(im, ...rect); ctx.restore();
      }
      for (let i = hechos; i < n && e >= i * paso; i++) esquinas(lista[i]);
      pctEl.textContent = String(Math.round(hechos / n * 100));
      if (hechos < n) anim = requestAnimationFrame(fotograma); else { ctc.clearRect(0, 0, W, H); anim = null; fin(); }
    };
    anim = requestAnimationFrame(fotograma);
  });

  const muestraPie = (i) => {
    const d = datos[i];
    pie.href = d.href; pieT.textContent = d.titulo; pieM.textContent = d.meta;
    nEl.textContent = String(i + 1).padStart(2, '0') + '/' + String(datos.length).padStart(2, '0');
  };

  const siguiente = async () => {
    temporizador = null;
    if (pausado || !visible) return;
    const i = (actual + 1) % datos.length;
    let im;
    try { im = await carga(i); } catch { return; }
    actual = i; imgActual = im;
    muestraPie(i);
    await renderiza(im);
    carga((i + 1) % datos.length).catch(() => {});
    programa();
  };
  const programa = () => { if (!temporizador && !anim && !pausado && visible) temporizador = setTimeout(siguiente, ESPERA); };
  const para = () => { clearTimeout(temporizador); temporizador = null; };

  // arranque: fondo de «ventana de render» y primer render
  medidas();
  ctx.fillStyle = '#1b1a18'; ctx.fillRect(0, 0, W, H);
  hero.classList.add('activo');
  siguiente();

  boton.addEventListener('click', () => {
    pausado = !pausado;
    boton.setAttribute('aria-pressed', String(pausado));
    boton.textContent = pausado ? boton.dataset.seguir : boton.dataset.pausar;
    if (pausado) para(); else programa();
  });
  new IntersectionObserver(([en]) => { visible = en.isIntersecting; if (visible) programa(); else para(); }).observe(caja);
  document.addEventListener('visibilitychange', () => { visible = !document.hidden; if (visible) programa(); else para(); });
  let rz;
  addEventListener('resize', () => {
    clearTimeout(rz);
    rz = setTimeout(() => {
      if (anim) { cancelAnimationFrame(anim); anim = null; }
      medidas(); ctc.clearRect(0, 0, W, H);
      if (imgActual) pintaTodo(imgActual);
      pctEl.textContent = '100';
      programa();
    }, 150);
  });
})();
