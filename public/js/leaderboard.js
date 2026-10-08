// Classements partagés et progression personnelle conservée sur l’appareil.
const ARCADE_PROGRESS_KEY = 'pibodyArcadeProgressV1';
const SCORED_ARCADE_GAMES = new Set([
  'neon-runner', 'reaction-rapide', 'memory-grid', 'memory-xl', 'pattern-breaker',
  'quick-math', 'snake', 'quiz-ia', 'mots-mele', 'mots-croises'
]);

function readLocalArcadeProgress() {
  try {
    const stored = window.localStorage.getItem(ARCADE_PROGRESS_KEY);
    if (!stored) return { version: 1, games: {} };
    const parsed = JSON.parse(stored);
    if (!parsed || parsed.version !== 1 || !parsed.games || typeof parsed.games !== 'object') return { version: 1, games: {} };
    const games = {};
    Object.entries(parsed.games).forEach(([game, entry]) => {
      if (!SCORED_ARCADE_GAMES.has(game) || !entry || typeof entry !== 'object') return;
      const plays = Number(entry.plays);
      const bestScore = Number(entry.bestScore);
      const lastScore = Number(entry.lastScore);
      if (!Number.isSafeInteger(plays) || plays < 1 || !Number.isSafeInteger(bestScore) || bestScore < 0) return;
      games[game] = {
        plays,
        bestScore,
        lastScore: Number.isSafeInteger(lastScore) && lastScore >= 0 ? lastScore : bestScore,
        lastPlayed: typeof entry.lastPlayed === 'string' ? entry.lastPlayed : ''
      };
    });
    return { version: 1, games };
  } catch (error) {
    return null;
  }
}

function recordLocalGameProgress(jeu, score) {
  if (!SCORED_ARCADE_GAMES.has(jeu) || !Number.isSafeInteger(score) || score < 0) return false;
  const progress = readLocalArcadeProgress();
  if (!progress) return false;
  const previous = progress.games[jeu] || { plays: 0, bestScore: 0, lastScore: 0, lastPlayed: '' };
  progress.games[jeu] = {
    plays: previous.plays + 1,
    bestScore: Math.max(previous.bestScore, score),
    lastScore: score,
    lastPlayed: new Date().toISOString()
  };
  try {
    window.localStorage.setItem(ARCADE_PROGRESS_KEY, JSON.stringify(progress));
    window.dispatchEvent(new CustomEvent('pibody:arcade-progress-updated'));
    return true;
  } catch (error) {
    return false;
  }
}

window.PibodyArcadeProgress = { read: readLocalArcadeProgress, record: recordLocalGameProgress };

async function submitScore(jeu, pseudo, score) {
  try {
    const response = await fetch('/projets/jeux/score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jeu, pseudo, score })
    });
    return response.ok;
  } catch (error) {
    console.warn('Score non sauvegardé.', error);
    return false;
  }
}

async function loadLeaderboard(jeu, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  try {
    const response = await fetch(`/projets/jeux/leaderboard/${encodeURIComponent(jeu)}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Classement indisponible.');

    container.replaceChildren();
    if (!Array.isArray(data.scores) || !data.scores.length) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 3;
      cell.className = 'leaderboard-empty';
      cell.textContent = 'Aucun score enregistré. Lance une partie pour inaugurer le classement.';
      row.appendChild(cell);
      container.appendChild(row);
      return;
    }

    data.scores.forEach((score, index) => {
      const row = document.createElement('tr');
      const rankCell = document.createElement('td');
      const nameCell = document.createElement('td');
      const scoreCell = document.createElement('td');
      const strong = document.createElement('strong');
      rankCell.textContent = `#${index + 1}`;
      nameCell.textContent = String(score.pseudo || 'Anonyme');
      strong.textContent = String(score.score ?? 0);
      scoreCell.appendChild(strong);
      row.append(rankCell, nameCell, scoreCell);
      container.appendChild(row);
    });
  } catch (error) {
    container.replaceChildren();
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 3;
    cell.className = 'leaderboard-empty';
    cell.textContent = 'Le classement est momentanément indisponible.';
    row.appendChild(cell);
    container.appendChild(row);
    console.warn('Leaderboard indisponible.', error);
  }
}

function readArcadePseudo() {
  try { return window.localStorage.getItem('arcadePseudo') || ''; }
  catch (error) { return ''; }
}

function askPseudoAndSubmit(jeu, score) {
  recordLocalGameProgress(jeu, score);
  const pseudo = readArcadePseudo() || 'Anonyme';
  return submitScore(jeu, pseudo, score);
}

function ensurePseudoThenStart(onReady) {
  const existing = readArcadePseudo();
  if (existing) { onReady(existing); return; }

  const previousFocus = document.activeElement;
  const overlay = document.createElement('div');
  overlay.className = 'pseudo-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'pseudoOverlayTitle');
  overlay.innerHTML = `
    <form class="pseudo-dialog">
      <p class="game-kicker">Classement de l’Arcade</p>
      <h2 id="pseudoOverlayTitle">Comment t’appelles-tu ?</h2>
      <label for="pseudoOverlayInput">Pseudo affiché avec ton score</label>
      <input type="text" id="pseudoOverlayInput" placeholder="Ton pseudo" maxlength="20" autocomplete="nickname" required>
      <button class="btn btn-primary btn-block" id="pseudoOverlayBtn" type="submit">Commencer la partie</button>
      <p class="pseudo-privacy-note">Le pseudo est enregistré sur cet appareil et apparaît au classement.</p>
    </form>
  `;
  document.body.appendChild(overlay);

  const form = overlay.querySelector('form');
  const input = overlay.querySelector('#pseudoOverlayInput');
  input.focus();
  form.addEventListener('submit', event => {
    event.preventDefault();
    const pseudo = input.value.trim().slice(0, 20);
    if (!pseudo) { input.focus(); return; }
    try { window.localStorage.setItem('arcadePseudo', pseudo); } catch (error) { /* Partie jouable sans persistance locale. */ }
    overlay.remove();
    onReady(pseudo);
  });
  function closeOnEscape(event) {
    if (event.key !== 'Escape') return;
    overlay.remove();
    document.removeEventListener('keydown', closeOnEscape);
    if (previousFocus && typeof previousFocus.focus === 'function') previousFocus.focus();
  }
  overlay.addEventListener('click', event => {
    if (event.target !== overlay) return;
    overlay.remove();
    document.removeEventListener('keydown', closeOnEscape);
    if (previousFocus && typeof previousFocus.focus === 'function') previousFocus.focus();
  });
  document.addEventListener('keydown', closeOnEscape);
}
