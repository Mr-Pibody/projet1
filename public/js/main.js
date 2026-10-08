// Comportements communs : thème, navigation, révélations, FAQ, filtres et formulaire.
(function themeModule() {
  const root = document.documentElement;
  const buttons = document.querySelectorAll('.theme-orb');
  const storageKey = 'theme';
  let transitioning = false;

  function updateButtons() {
    const isLight = root.getAttribute('data-theme') === 'light';
    buttons.forEach(button => {
      button.setAttribute('aria-pressed', String(isLight));
      button.setAttribute('aria-label', isLight ? 'Activer le thème sombre' : 'Activer le thème clair');
      button.title = isLight ? 'Activer le thème sombre' : 'Activer le thème clair';
    });
  }

  function applyTheme(next) {
    if (next === 'light') root.setAttribute('data-theme', 'light');
    else root.removeAttribute('data-theme');
    try { window.localStorage.setItem(storageKey, next); } catch (error) { /* Préférence uniquement locale. */ }
    updateButtons();
  }

  try {
    if (window.localStorage.getItem(storageKey) === 'light') root.setAttribute('data-theme', 'light');
    else root.removeAttribute('data-theme');
  } catch (error) { /* Le site fonctionne aussi si le stockage local est bloqué. */ }
  updateButtons();

  buttons.forEach(button => button.addEventListener('click', () => {
    if (transitioning) return;
    const next = root.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) { applyTheme(next); return; }

    // Conserve la transition iris/Easter egg historique du bouton de thème.
    const rect = button.getBoundingClientRect();
    let iris = document.querySelector('.theme-iris');
    if (!iris) {
      iris = document.createElement('div');
      iris.className = 'theme-iris';
      const face = document.createElement('img');
      face.src = '/images/emoji-face.jpg';
      face.alt = '';
      face.className = 'theme-iris-face';
      iris.appendChild(face);
      document.body.appendChild(iris);
    }
    iris.style.setProperty('--iris-x', `${((rect.left + rect.width / 2) / window.innerWidth) * 100}%`);
    iris.style.setProperty('--iris-y', `${((rect.top + rect.height / 2) / window.innerHeight) * 100}%`);
    iris.classList.add('active');
    transitioning = true;

    window.setTimeout(() => applyTheme(next), 280);
    window.setTimeout(() => {
      iris.classList.remove('active');
      transitioning = false;
    }, 650);
  }));
})();

(function navbarModule() {
  const burger = document.querySelector('.nav-burger');
  const navbar = document.querySelector('.navbar');
  if (!burger || !navbar) return;

  function setOpen(open) {
    navbar.classList.toggle('menu-open', open);
    burger.setAttribute('aria-expanded', String(open));
    burger.setAttribute('aria-label', open ? 'Fermer le menu' : 'Ouvrir le menu');
  }

  burger.addEventListener('click', () => setOpen(burger.getAttribute('aria-expanded') !== 'true'));
  navbar.querySelectorAll('.nav-links a').forEach(link => link.addEventListener('click', () => setOpen(false)));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') setOpen(false);
  });
  document.addEventListener('click', event => {
    if (!navbar.contains(event.target)) setOpen(false);
  });
})();

(function revealModule() {
  const targets = document.querySelectorAll('.reveal');
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!targets.length) return;
  if (reduceMotion || !('IntersectionObserver' in window)) {
    targets.forEach(target => target.classList.add('is-visible'));
    return;
  }

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -24px 0px' });
  targets.forEach(target => observer.observe(target));

  document.querySelectorAll('[data-reveal-words]').forEach(element => {
    const text = element.textContent.trim();
    if (!text) return;
    const fragment = document.createDocumentFragment();
    text.split(/\s+/).forEach((word, index) => {
      if (index) fragment.appendChild(document.createTextNode(' '));
      const span = document.createElement('span');
      span.className = 'reveal-word';
      span.textContent = word;
      fragment.appendChild(span);
    });
    element.replaceChildren(fragment);

    const wordObserver = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      element.querySelectorAll('.reveal-word').forEach((word, index) => {
        window.setTimeout(() => word.classList.add('is-visible'), Math.min(index * 35, 350));
      });
      wordObserver.disconnect();
    }, { threshold: 0.4 });
    wordObserver.observe(element);
  });
})();

(function countersModule() {
  const counters = document.querySelectorAll('[data-count]');
  if (!counters.length) return;
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion || !('IntersectionObserver' in window)) {
    counters.forEach(element => { element.textContent = element.dataset.count || '0'; });
    return;
  }
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const element = entry.target;
      const target = Number.parseInt(element.dataset.count, 10) || 0;
      const started = performance.now();
      function tick(now) {
        const progress = Math.min((now - started) / 900, 1);
        element.textContent = String(Math.floor((1 - Math.pow(1 - progress, 3)) * target));
        if (progress < 1) requestAnimationFrame(tick);
        else element.textContent = String(target);
      }
      requestAnimationFrame(tick);
      observer.unobserve(element);
    });
  }, { threshold: 0.4 });
  counters.forEach(counter => observer.observe(counter));
})();

(function faqModule() {
  document.querySelectorAll('.faq-question').forEach(button => {
    button.addEventListener('click', () => {
      const item = button.closest('.faq-item');
      if (!item) return;
      const wasOpen = item.classList.contains('open');
      item.parentElement.querySelectorAll('.faq-item').forEach(other => {
        other.classList.remove('open');
        const otherButton = other.querySelector('.faq-question');
        if (otherButton) otherButton.setAttribute('aria-expanded', 'false');
      });
      if (!wasOpen) {
        item.classList.add('open');
        button.setAttribute('aria-expanded', 'true');
      }
    });
  });
})();

(function filterModule() {
  const chips = document.querySelectorAll('.filter-chip');
  const cards = document.querySelectorAll('.project-card[data-cat]');
  if (!chips.length || !cards.length) return;
  chips.forEach(chip => chip.addEventListener('click', () => {
    chips.forEach(other => {
      const active = other === chip;
      other.classList.toggle('active', active);
      other.setAttribute('aria-pressed', String(active));
    });
    const category = chip.dataset.cat;
    cards.forEach(card => {
      card.hidden = category !== 'tous' && card.dataset.cat !== category;
    });
  }));
})();

(function particlesModule() {
  const canvas = document.getElementById('particles-canvas');
  if (!canvas || !canvas.getContext) return;
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Le réseau animé reste réservé au hero desktop ; le mobile garde le décor statique.
  if (reduceMotion || window.innerWidth < 760) return;

  const context = canvas.getContext('2d');
  if (!context) return;
  let width = 0;
  let height = 0;
  let particles = [];
  let frame = 0;
  let lastFrameAt = 0;
  const frameInterval = 1000 / 24;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    particles = Array.from({ length: 22 }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      radius: Math.random() * 1.05 + 0.4,
      vx: (Math.random() - 0.5) * 0.14,
      vy: (Math.random() - 0.5) * 0.14
    }));
  }

  function draw(now = 0) {
    if (document.hidden) return;
    if (now - lastFrameAt < frameInterval) {
      frame = requestAnimationFrame(draw);
      return;
    }
    lastFrameAt = now;
    context.clearRect(0, 0, width, height);
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#77dfbd';
    particles.forEach((particle, index) => {
      particle.x += particle.vx;
      particle.y += particle.vy;
      if (particle.x < 0 || particle.x > width) particle.vx *= -1;
      if (particle.y < 0 || particle.y > height) particle.vy *= -1;
      context.fillStyle = accent;
      context.globalAlpha = 0.38;
      context.beginPath();
      context.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
      context.fill();

      // Quelques segments fins suggèrent un réseau de neurones, sans charger l’écran.
      for (let next = index + 1; next < particles.length; next += 1) {
        const other = particles[next];
        const distance = Math.hypot(other.x - particle.x, other.y - particle.y);
        if (distance > 125) continue;
        context.globalAlpha = (1 - distance / 125) * 0.11;
        context.strokeStyle = accent;
        context.lineWidth = 0.7;
        context.beginPath();
        context.moveTo(particle.x, particle.y);
        context.lineTo(other.x, other.y);
        context.stroke();
      }
    });
    context.globalAlpha = 1;
    frame = requestAnimationFrame(draw);
  }

  resize();
  frame = requestAnimationFrame(draw);
  window.addEventListener('resize', resize, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) cancelAnimationFrame(frame);
    else { lastFrameAt = 0; frame = requestAnimationFrame(draw); }
  });
})();

(function contactFormModule() {
  const form = document.getElementById('contact-form');
  const statusBox = document.getElementById('contact-status');
  if (!form || !statusBox) return;

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const submitButton = form.querySelector('button[type="submit"]');
    if (!submitButton || submitButton.disabled) return;

    const originalText = submitButton.textContent;
    const payload = {
      nom: String(form.elements.nom.value || '').trim(),
      email: String(form.elements.email.value || '').trim(),
      message: String(form.elements.message.value || '').trim()
    };
    submitButton.disabled = true;
    submitButton.textContent = 'Envoi en cours…';
    form.setAttribute('aria-busy', 'true');
    statusBox.className = 'form-status';
    statusBox.textContent = '';

    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.error || 'L’envoi n’a pas abouti. Réessayez plus tard.');
      statusBox.className = 'form-status show success';
      statusBox.textContent = 'Message envoyé. Merci, je vous répondrai dès que possible.';
      form.reset();
    } catch (error) {
      statusBox.className = 'form-status show error';
      statusBox.textContent = error.message || 'Erreur réseau, réessayez plus tard.';
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = originalText;
      form.removeAttribute('aria-busy');
    }
  });
})();
