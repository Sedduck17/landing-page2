/* =========================================================
 * UangKu Landing Page — app.js (refactored, logika identik)
 * Sumber: <script> inline di file asli (dipindah byte-identik + komentar).
 * Bagian: 1) Navigasi deck 2) Parallax desktop 3) Simulator
 *         4) Download dialog / PWA install 5) Init
 * Tidak ada perubahan logika, ID, class, atau angka — hanya komentar
 * dan pengelompokan agar mudah dirawat. Layout/visual tidak berubah.
 * ========================================================= */


/* ---------- 1. Navigasi deck (state + dots + snap) ---------- */
const deck = document.getElementById('deck');
const slides = [...document.querySelectorAll('.slide')];
const dots = [...document.querySelectorAll('.rail-dot')];
const slideStatus = document.getElementById('slideStatus');
const themeColorMeta = document.querySelector('meta[name="theme-color"]');
let current = 0;
let locked = false;
let wheelCarry = 0;
let touchStartY = null;
let touchStartX = null;
let touchpadGestureActive = false;
let touchpadGestureTimer = null;

const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
const isMobileNav = () => matchMedia('(max-width: 900px)').matches || matchMedia('(pointer: coarse)').matches;

function setActive(index) {
  current = clamp(index, 0, slides.length - 1);
  slides.forEach((s, i) => s.classList.toggle('is-active', i === current));
  dots.forEach((d, i) => {
    const active = i === current;
    d.classList.toggle('active', active);
    d.setAttribute('aria-current', active ? 'step' : 'false');
  });

  // The mobile hero also uses a dark background, so the fixed wordmark needs
  // the same high-contrast treatment as the solution and finale sections.
  const isDark = current === 0 || current === 2 || current === 5;
  if (isMobileNav()) {
    document.body.classList.toggle('mobile-dark-section', isDark);
  } else {
    document.body.classList.remove('mobile-dark-section');
  }

  if (themeColorMeta) {
    const activeSlide = slides[current];
    const color =
      activeSlide.classList.contains('solution') || activeSlide.classList.contains('finale') ? '#06382d' :
      activeSlide.classList.contains('simulator') ? '#e4f4eb' :
      '#f7f4ea';
    themeColorMeta.setAttribute('content', color);
  }

  if (slideStatus) {
    const label = slides[current].dataset.label || `Bagian ${current + 1}`;
    slideStatus.textContent = `Bagian ${current + 1} dari ${slides.length}: ${label}`;
  }
}

let wheelIdleTimer = null;
let wheelLockRelease = null;
// Precision touchpads emit much smaller deltas than a mouse wheel. Keep the
// threshold low enough for a single two-finger gesture, while the lock below
// still absorbs its remaining momentum so it cannot skip multiple sections.
const WHEEL_THRESHOLD = 24;
const WHEEL_IDLE_MS = 150;
const WHEEL_SMOOTH_LOCK_MS = 600;
const WHEEL_LOCK_EXTEND_MS = 120;
const WHEEL_CARRY_RESET_MS = 200;
let lastWheelAt = 0;

function normalizeWheelDelta(e) {
  let d = e.deltaY;
  if (e.deltaMode === 1) d *= 16;
  else if (e.deltaMode === 2) d *= window.innerHeight;
  return d;
}

function scheduleUnlockAfterIdle(minDelay) {
  clearTimeout(wheelLockRelease);
  clearTimeout(wheelIdleTimer);
  wheelLockRelease = setTimeout(() => {
    clearTimeout(wheelIdleTimer);
    wheelIdleTimer = setTimeout(() => {
      locked = false;
      wheelCarry = 0;
    }, WHEEL_IDLE_MS);
  }, minDelay);
}

function goTo(index, behavior = 'smooth') {
  const next = clamp(index, 0, slides.length - 1);
  if (next === current && behavior === 'smooth') return;

  // Mobile uses native scroll snapping for touch gestures. For button/dot jumps,
  // use an immediate aligned scroll so it never fights Android's momentum scroll.
  if (isMobileNav()) {
    deck.scrollTo({
      top: slides[next].offsetTop,
      behavior: behavior === 'auto' ? 'auto' : 'smooth'
    });
    wheelCarry = 0;
    return;
  }

  locked = true;
  wheelCarry = 0;
  // OPSI-2: scroll dalam container deck saja (lebih andal dari scrollIntoView
  // yang bisa mengincar window). Untuk REVERT: pakai scrollIntoView lagi.
  deck.scrollTo({ top: slides[next].offsetTop, behavior });
  setActive(next);
  scheduleUnlockAfterIdle(behavior === 'smooth' ? WHEEL_SMOOTH_LOCK_MS : 60);
}

document.querySelectorAll('[data-go]').forEach(el => {
  el.addEventListener('click', () => goTo(Number(el.dataset.go)));
});

// Desktop: satu gesture wheel/trackpad = satu section.
// Trackpad mengirim banyak event kecil + momentum yang berlanjut,
// jadi lock diperpanjang selama wheel masih bergerak (idle debounce).
// Listener di window (capture) agar wheel tetap jalan walau kursor
// sedang di atas overlay fixed di luar deck (rail/topbar) — sebelumnya
// deck-only membuat scroll terasa macet sampai kursor digeser.
window.addEventListener('wheel', (e) => {
  if (window.innerWidth <= 900) return; // mobile/trackpad narrow: native snap feels better
  const sheet = document.getElementById('downloadSheet');
  if (sheet && sheet.classList.contains('show')) return;
  // OPSI-2: jangan blokir wheel hanya karena hover slider/select.
  // Slider range horizontal + select tertutup tidak memakai wheel vertikal,
  // jadi memblokirnya justru memaksa user geser cursor (bug yang dilaporkan).
  // Blokir hanya textarea / contenteditable / form yang sedang fokus mengetik.
  // Untuk REVERT: kembalikan ke 'input,select,textarea,[contenteditable="true"]'.
  const t = e.target && e.target.closest ? e.target.closest('textarea,[contenteditable="true"]') : null;
  const ae = document.activeElement;
  const typing = ae && (ae.tagName === 'TEXTAREA' || ae.isContentEditable);
  if (t || typing) return;
  // OPSI-3 trackpad: pinch-zoom (ctrlKey) biarkan browser yang handle,
  // jangan dibajak jadi pindah slide. Untuk REVERT: hapus 2 baris ini.
  if (e.ctrlKey || e.metaKey) return;
  // OPSI-3 trackpad: abaikan swipe yang dominan horizontal (deltaX > deltaY).
  // Tanpa ini, usapan trackpad yang sedikit diagonal di atas scene 3D
  // terakumulasi lambat di sumbu Y dan terasa macet di area itu saja.
  // Untuk REVERT: hapus blok dx ini.
  let dx = e.deltaX;
  if (e.deltaMode === 1) dx *= 16;
  else if (e.deltaMode === 2) dx *= window.innerHeight;
  const dyRaw = normalizeWheelDelta(e);
  if (Math.abs(dx) > Math.abs(dyRaw)) return;
  e.preventDefault();
  const d = dyRaw;
  if (Math.abs(d) < 2) return;

  // A precision touchpad sends many events for one two-finger swipe. Treat the
  // whole stream as one gesture so momentum cannot jump across several slides.
  // Touchpads report pixel deltas (deltaMode 0), including fast swipes whose
  // delta is larger than a single mouse-wheel notch.
  if (e.deltaMode === 0) {
    if (!touchpadGestureActive) {
      const next = clamp(current + (d > 0 ? 1 : -1), 0, slides.length - 1);
      if (next !== current) {
        // A touchpad gesture already has a clear start/end. Jump directly to
        // the next snap point so it cannot queue overlapping smooth-scroll
        // animations when users scroll again quickly.
        deck.scrollTo({ top: slides[next].offsetTop, behavior: 'auto' });
        setActive(next);
      }
      touchpadGestureActive = true;
    }
    clearTimeout(touchpadGestureTimer);
    touchpadGestureTimer = setTimeout(() => {
      touchpadGestureActive = false;
    }, 180);
    wheelCarry = 0;
    return;
  }

  if (locked) {
    wheelCarry = 0;
    // Revisi trackpad: telan semua momentum selama lock agar 1 gesture = 1 slide.
    // Tanpa ini, momentum yang masih jalan setelah unlock kebaca sebagai scroll baru
    // dan loncat 2-3 halaman. Untuk REVERT ke opsi-2 awal: hanya extend jika |d| > 50.
    scheduleUnlockAfterIdle(WHEEL_LOCK_EXTEND_MS);
    return;
  }
  const now = performance.now();
  // Reset akumulasi jika jeda antar event terlalu lama (gesture baru, bukan lanjutan).
  if (now - lastWheelAt > WHEEL_CARRY_RESET_MS) wheelCarry = 0;
  lastWheelAt = now;
  if (wheelCarry !== 0 && Math.sign(d) !== Math.sign(wheelCarry)) {
    wheelCarry = 0;
  }
  wheelCarry += d;
  if (Math.abs(wheelCarry) < WHEEL_THRESHOLD) return;
  const dir = wheelCarry > 0 ? 1 : -1;
  wheelCarry = 0;
  goTo(current + dir);
}, { passive: false, capture: true });

// Mobile touch navigation intentionally uses the browser's native momentum + CSS scroll snap.
// Do not programmatically call goTo() on touchend: doing both causes double movement/jank on Android.

// Keyboard navigation.
window.addEventListener('keydown', (e) => {
  const active = document.activeElement;
  if (active && active.closest('input, select, textarea, button, a, [contenteditable="true"]')) return;
  if (['ArrowDown','PageDown',' '].includes(e.key)) { e.preventDefault(); goTo(current + 1); }
  if (['ArrowUp','PageUp'].includes(e.key)) { e.preventDefault(); goTo(current - 1); }
  if (e.key === 'Home') goTo(0);
  if (e.key === 'End') goTo(slides.length - 1);
});

// Keep dots correct if browser/native swipe settles on a section.
const sectionObserver = new IntersectionObserver((entries) => {
  const visible = entries.filter(e => e.isIntersecting).sort((a,b) => b.intersectionRatio - a.intersectionRatio)[0];
  if (!visible) return;
  const idx = slides.indexOf(visible.target);
  if (idx >= 0 && visible.intersectionRatio > .55) setActive(idx);
}, { root: deck, threshold: [.55,.7,.9] });
slides.forEach(s => sectionObserver.observe(s));

/* ---------- 2. Parallax desktop (compositor-only, rAF-throttled) ---------- */
// Desktop parallax: compositor-only and throttled to one update per animation frame.
let parallaxFrame = 0;
let parallaxX = 0;
let parallaxY = 0;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
window.addEventListener('pointermove', (e) => {
  if (window.innerWidth <= 900 || reducedMotion.matches) return;
  // OPSI-3: jangan putar scene parallax di tengah animasi pindah slide.
  // Transform tiap frame saat deck sedang smooth-scroll bikin jank,
  // paling terasa di area animasi (sign/compare). Untuk REVERT: hapus baris ini.
  if (locked) return;
  parallaxX = e.clientX;
  parallaxY = e.clientY;
  if (parallaxFrame) return;
  parallaxFrame = requestAnimationFrame(() => {
    parallaxFrame = 0;
    const active = slides[current];
    const scene = active.querySelector('[data-parallax]');
    if (!scene) return;
    const power = Number(scene.dataset.parallax || 12);
    const rx = (parallaxY / innerHeight - .5) * -power * .45;
    const ry = (parallaxX / innerWidth - .5) * power * .55;
    scene.style.transform = `perspective(1200px) rotateX(${rx}deg) rotateY(${ry}deg)`;
  });
}, { passive: true });
window.addEventListener('pointerleave', () => {
  if (parallaxFrame) cancelAnimationFrame(parallaxFrame);
  parallaxFrame = 0;
  const active = slides[current];
  active?.querySelector('[data-parallax]')?.style.removeProperty('transform');
}, { passive: true });

/* ---------- 3. Simulator pembelian (slider + metode + chart) ---------- */
// Simulator
const price = document.getElementById('price');
const priceOut = document.getElementById('priceOut');
const method = document.getElementById('method');
const cashBar = document.getElementById('cashBar');
const liquidBar = document.getElementById('liquidBar');
const goalBar = document.getElementById('goalBar');
const impactChart = document.getElementById('impactChart');
const simA11y = document.getElementById('simA11y');
const priceButtons = [...document.querySelectorAll('[data-price]')];
const rupiah = n => 'Rp ' + Math.round(n).toLocaleString('id-ID');

const methodProfile = {
  cash:      { months: 1,  fee: 0,     reserve: 0,   label: 'Tunai' },
  bank:      { months: 1,  fee: 2500,  reserve: 0,   label: 'Online Banking' },
  debit:     { months: 1,  fee: 0,     reserve: 0,   label: 'Kartu Debit' },
  ewallet:   { months: 1,  fee: .005,  reserve: 0,   label: 'E-Wallet' },
  credit3:   { months: 3,  fee: .025,  reserve: .76, label: 'Kartu Kredit 3 bulan' },
  install6:  { months: 6,  fee: .04,   reserve: .82, label: 'Cicilan 6 bulan' },
  install12: { months: 12, fee: .07,   reserve: .88, label: 'Cicilan 12 bulan' }
};

let simAnnounceTimer = null;
const scorePct = value => clamp(value, 12, 96);
const setScoreBar = (el, score) => {
  const pct = scorePct(score);
  el.style.transform = `scaleY(${(pct / 100).toFixed(3)})`;
  el.dataset.score = String(Math.round(pct));
};
const qualitative = n => n >= 76 ? 'relatif kuat' : n >= 56 ? 'cukup terjaga' : n >= 36 ? 'tertekan' : 'sangat tertekan';

function updateSim({ announce = false } = {}) {
  const p = Number(price.value);
  const profile = methodProfile[method.value] || methodProfile.cash;
  priceOut.textContent = rupiah(p);
  price.setAttribute('aria-valuetext', `${rupiah(p)}, ${profile.label}`);

  const ratio = clamp(p / 30000000, .12, 1);
  let cashScore, liquidScore, goalScore;
  if (profile.months === 1) {
    const feeDrag = typeof profile.fee === 'number' && profile.fee < 1 ? profile.fee * 180 : 0;
    cashScore = 94 - ratio * 70 - feeDrag;
    liquidScore = 90 - ratio * 77 - feeDrag * .4;
    goalScore = 92 - ratio * 58;
  } else {
    const total = p * (1 + profile.fee);
    const monthly = total / profile.months;
    const burden = clamp(monthly / 5000000, .08, 1);
    cashScore = 94 - burden * 58;
    liquidScore = 90 * profile.reserve - ratio * 8;
    goalScore = 92 - burden * 42 - profile.fee * 90;
  }

  setScoreBar(cashBar, cashScore);
  setScoreBar(liquidBar, liquidScore);
  setScoreBar(goalBar, goalScore);

  const min = Number(price.min), max = Number(price.max);
  const fill = ((p - min) / (max - min)) * 100;
  price.style.setProperty('--range-fill', `${fill}%`);

  priceButtons.forEach(b => {
    const selected = Number(b.dataset.price) === p;
    b.classList.toggle('chosen', selected);
    b.setAttribute('aria-pressed', selected ? 'true' : 'false');
  });

  const summary = `${rupiah(p)}, metode ${profile.label}. Cashflow ${qualitative(cashScore)}, dana likuid ${qualitative(liquidScore)}, dan target ${qualitative(goalScore)}.`;
  impactChart.setAttribute('aria-label', `Grafik dampak ilustratif. ${summary}`);
  if (announce && simA11y) {
    clearTimeout(simAnnounceTimer);
    simAnnounceTimer = setTimeout(() => { simA11y.textContent = summary; }, 180);
  }
}

let simFrame = 0;
price.addEventListener('input', () => {
  if (simFrame) return;
  simFrame = requestAnimationFrame(() => {
    simFrame = 0;
    updateSim();
  });
});
price.addEventListener('change', () => updateSim({ announce: true }));
method.addEventListener('change', () => updateSim({ announce: true }));
priceButtons.forEach(b => b.addEventListener('click', () => {
  price.value = b.dataset.price;
  updateSim({ announce: true });
  price.focus({ preventScroll: true });
}));

// While the horizontal range is being dragged, temporarily relax page snap so
// Android does not fight the control gesture. Native snap is restored on release.
const beginRangeDrag = () => deck.classList.add('sim-dragging');
const endRangeDrag = () => deck.classList.remove('sim-dragging');
price.addEventListener('pointerdown', beginRangeDrag);
window.addEventListener('pointerup', endRangeDrag, { passive: true });
window.addEventListener('pointercancel', endRangeDrag, { passive: true });


/* ---------- 4. Download dialog + PWA install prompt ---------- */
// Final slide -> install/download choices.
const downloadSheet = document.getElementById('downloadSheet');
const downloadCard = downloadSheet?.querySelector('.download-card');
const openDownload = document.getElementById('openDownload');
const closeDownload = document.getElementById('closeDownload');
const closeDownloadBackdrop = document.getElementById('closeDownloadBackdrop');
const installDevice = document.getElementById('installDevice');
const installStatus = document.getElementById('installStatus');
const backgroundRegions = [
  document.querySelector('.topbar'),
  document.querySelector('.rail'),
  deck
].filter(Boolean);
let deferredInstallPrompt = null;
let dialogReturnFocus = null;

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredInstallPrompt = e;
  installStatus.textContent = 'Perangkat ini mendukung instalasi langsung. Tekan “Install di perangkat”.';
});

const dialogFocusable = () => downloadCard
  ? [...downloadCard.querySelectorAll(
      'button:not([disabled]), a[href], select:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )].filter(el => !el.hidden && el.offsetParent !== null)
  : [];

function showDownload(){
  dialogReturnFocus = document.activeElement;
  downloadSheet.classList.add('show');
  downloadSheet.setAttribute('aria-hidden','false');
  backgroundRegions.forEach(el => { el.inert = true; });
  document.body.classList.add('dialog-open');
  requestAnimationFrame(() => {
    const first = dialogFocusable()[0] || downloadCard;
    first?.focus({ preventScroll:true });
  });
}

function hideDownload(){
  downloadSheet.classList.remove('show');
  downloadSheet.setAttribute('aria-hidden','true');
  backgroundRegions.forEach(el => { el.inert = false; });
  document.body.classList.remove('dialog-open');
  const target = dialogReturnFocus && document.contains(dialogReturnFocus) ? dialogReturnFocus : openDownload;
  target?.focus({ preventScroll:true });
  dialogReturnFocus = null;
}

openDownload.addEventListener('click', showDownload);
closeDownload.addEventListener('click', hideDownload);
closeDownloadBackdrop.addEventListener('click', hideDownload);

window.addEventListener('keydown', e => {
  if (!downloadSheet.classList.contains('show')) return;

  if (e.key === 'Escape') {
    e.preventDefault();
    hideDownload();
    return;
  }

  if (e.key === 'Tab') {
    const focusable = dialogFocusable();
    if (!focusable.length) {
      e.preventDefault();
      downloadCard?.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
});

installDevice.addEventListener('click', async () => {
  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    const choice = await deferredInstallPrompt.userChoice;
    installStatus.textContent = choice.outcome === 'accepted'
      ? 'Permintaan instalasi dikirim ke perangkat.'
      : 'Instalasi dibatalkan. Kamu tetap bisa menggunakan pilihan store di bawah.';
    deferredInstallPrompt = null;
  } else {
    installStatus.textContent = 'Instalasi langsung belum tersedia dari demo ini. Gunakan Google Play atau App Store di bawah.';
  }
});

/* ---------- 5. Init ---------- */
setActive(0); updateSim();

