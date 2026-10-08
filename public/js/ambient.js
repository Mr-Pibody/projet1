// Décor animé léger conservé, limité aux grands écrans et désactivé si l’utilisateur préfère réduire les mouvements.
(function ambientModule() {
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion || window.innerWidth < 700) return;

  const layer = document.createElement('div');
  layer.id = 'ambient-layer';
  Object.assign(layer.style, {
    position: 'fixed',
    inset: '0',
    pointerEvents: 'none',
    zIndex: '5',
    overflow: 'hidden'
  });
  document.body.appendChild(layer);

  const marginSafe = Math.min(84, Math.max(42, Math.round(window.innerWidth * 0.1)));
  let dropTimer = null;
  let particleTimer = null;

  function randomEdgeX() {
    const isLeft = Math.random() < 0.5;
    const offset = Math.random() * marginSafe;
    return isLeft ? offset : Math.max(0, window.innerWidth - offset - 8);
  }

  function spawnDrop() {
    if (document.hidden || layer.childElementCount > 24) return;
    const drop = document.createElement('span');
    Object.assign(drop.style, {
      position: 'absolute',
      left: `${randomEdgeX()}px`,
      top: '-20px',
      width: '2px',
      height: '12px',
      borderRadius: '50%',
      background: 'linear-gradient(180deg, transparent, var(--accent))',
      opacity: '0.32',
      transition: `top ${5 + Math.random() * 2}s linear, opacity 1s ease`
    });
    layer.appendChild(drop);
    requestAnimationFrame(() => { drop.style.top = `${window.innerHeight + 24}px`; });
    window.setTimeout(() => { drop.style.opacity = '0'; }, 5000);
    window.setTimeout(() => drop.remove(), 7600);
  }

  function spawnRing() {
    if (document.hidden || layer.childElementCount > 24) return;
    const cx = randomEdgeX();
    const cy = Math.random() * window.innerHeight;
    const count = 5;
    const radius = 18;
    for (let index = 0; index < count; index++) {
      const angle = (index / count) * Math.PI * 2;
      const dot = document.createElement('span');
      Object.assign(dot.style, {
        position: 'absolute',
        left: `${cx + Math.cos(angle) * radius}px`,
        top: `${cy + Math.sin(angle) * radius}px`,
        width: '4px',
        height: '4px',
        borderRadius: '50%',
        background: 'var(--accent-2)',
        opacity: '0',
        transition: 'opacity 0.9s ease, transform 0.9s ease',
        transform: 'scale(0.4)'
      });
      layer.appendChild(dot);
      requestAnimationFrame(() => {
        window.setTimeout(() => { dot.style.opacity = '0.42'; dot.style.transform = 'scale(1)'; }, index * 70);
      });
      window.setTimeout(() => { dot.style.opacity = '0'; dot.style.transform = 'scale(0.4)'; }, 1900 + index * 70);
      window.setTimeout(() => dot.remove(), 3200 + index * 70);
    }
  }

  function start() {
    if (dropTimer || document.hidden) return;
    dropTimer = window.setInterval(spawnDrop, 3600);
    particleTimer = window.setInterval(spawnRing, 6200);
  }

  function stop() {
    if (dropTimer) window.clearInterval(dropTimer);
    if (particleTimer) window.clearInterval(particleTimer);
    dropTimer = null;
    particleTimer = null;
  }

  start();
  window.setTimeout(spawnDrop, 1400);
  window.setTimeout(spawnRing, 2800);
  document.addEventListener('visibilitychange', () => document.hidden ? stop() : start());
})();
