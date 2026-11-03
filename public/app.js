const API = "/api";

let episodes = [];
let currentUser = null;
let favorites = new Set();
let authMode = "login";

const $ = (id) => document.getElementById(id);

async function api(path, options = {}) {
  const response = await fetch(API + path, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "Une erreur est survenue.");
  }

  return data;
}

function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric"
  });
}

function episodeCard(episode) {
  const isFavorite = favorites.has(episode.id);

  return `
    <article class="episode-card">
      <img
        src="${escapeHTML(episode.image || "")}"
        alt=""
        loading="lazy"
        onerror="this.style.visibility='hidden'"
      >
      <div class="episode-content">
        <h3>${escapeHTML(episode.title)}</h3>
        <div class="episode-date">${escapeHTML(formatDate(episode.date))}</div>
        <p>${escapeHTML(episode.description || "Aucune description.")}</p>
        <div class="episode-actions">
          <button data-play="${escapeHTML(episode.id)}">▶ Écouter</button>
          <button data-favorite="${escapeHTML(episode.id)}">
            ${isFavorite ? "♥" : "♡"} Favori
          </button>
        </div>
      </div>
    </article>
  `;
}

function renderEpisodes(list = episodes) {
  $("episodes").innerHTML = list.length
    ? list.map(episodeCard).join("")
    : "<p>Aucun épisode trouvé.</p>";

  $("episodeCount").textContent =
    `${list.length} épisode${list.length > 1 ? "s" : ""}`;
}

function renderFavorites() {
  const list = episodes.filter((episode) => favorites.has(episode.id));

  $("favorites").innerHTML = currentUser
    ? (list.length
      ? list.map(episodeCard).join("")
      : "<p>Tu n'as pas encore de favoris.</p>")
    : "<p>Connecte-toi pour retrouver tes favoris.</p>";
}

function renderRanking() {
  const sorted = [...episodes].sort(
    (a, b) => (b.plays || 0) - (a.plays || 0)
  );

  $("ranking").innerHTML = sorted.length
    ? sorted.slice(0, 5).map((episode, index) => `
      <article class="episode-card">
        <div class="episode-content">
          <p class="eyebrow">N° ${index + 1}</p>
          <h3>${escapeHTML(episode.title)}</h3>
          <p>${episode.plays || 0} écoute(s) lancée(s)</p>
          <div class="episode-actions">
            <button data-play="${escapeHTML(episode.id)}">▶ Écouter</button>
          </div>
        </div>
      </article>
    `).join("")
    : "<p>Le classement sera bientôt disponible.</p>";
}

async function loadEpisodes() {
  $("episodes").innerHTML = "<p>Chargement des épisodes…</p>";

  try {
    const data = await api("/episodes");
    episodes = data.episodes || [];
    renderEpisodes();
    renderFavorites();
    renderRanking();
  } catch (error) {
    $("episodes").innerHTML =
      `<p>Impossible de charger les épisodes : ${escapeHTML(error.message)}</p>`;
  }
}

async function loadMe() {
  try {
    const data = await api("/me");
    currentUser = data.user || null;
    favorites = new Set(data.favorites || []);
  } catch {
    currentUser = null;
    favorites = new Set();
  }

  updateAccount();
  renderFavorites();
  renderEpisodes();
}

function updateAccount() {
  $("loginButton").hidden = Boolean(currentUser);
  $("registerButton").hidden = Boolean(currentUser);
  $("logoutButton").hidden = !currentUser;

  $("accountPanel").hidden = !currentUser;

  if (currentUser) {
    $("accountTitle").textContent = `Bienvenue, ${currentUser.username} !`;
    $("accountMessage").textContent =
      "Tes favoris sont associés à ton compte.";
  }
}

function openAuth(mode) {
  authMode = mode;
  $("authTitle").textContent =
    mode === "login" ? "Connexion" : "Créer un compte";
  $("authEyebrow").textContent =
    mode === "login" ? "TON ESPACE" : "INSCRIPTION";
  $("authSubmit").textContent =
    mode === "login" ? "Se connecter" : "Créer mon compte";
  $("authError").textContent = "";
  $("password").value = "";
  $("password").autocomplete =
    mode === "login" ? "current-password" : "new-password";

  $("authDialog").showModal();
}

async function submitAuth(event) {
  event.preventDefault();
  $("authError").textContent = "";

  try {
    const data = await api(
      authMode === "login" ? "/auth/login" : "/auth/register",
      {
        method: "POST",
        body: JSON.stringify({
          username: $("username").value.trim(),
          password: $("password").value
        })
      }
    );

    currentUser = data.user;
    favorites = new Set(data.favorites || []);

    $("authDialog").close();
    $("authForm").reset();

    updateAccount();
    renderFavorites();
    renderEpisodes();
  } catch (error) {
    $("authError").textContent = error.message;
  }
}

async function logout() {
  try {
    await api("/auth/logout", { method: "POST" });
  } catch (error) {
    alert(error.message);
  }

  currentUser = null;
  favorites = new Set();
  updateAccount();
  renderFavorites();
  renderEpisodes();
}

async function playEpisode(id) {
  const episode = episodes.find((item) => item.id === id);
  if (!episode || !episode.audio) return;

  $("player").hidden = false;
  $("playerTitle").textContent = episode.title;
  $("playerStatus").textContent = "Chargement…";

  const audio = $("audioPlayer");
  audio.src = episode.audio;

  try {
    await audio.play();
    $("playerStatus").textContent = "Lecture en cours";

    await api("/episodes", {
      method: "POST",
      body: JSON.stringify({ episodeId: id })
    });

    const data = await api("/episodes");
    episodes = data.episodes || [];
    renderRanking();
  } catch (error) {
    $("playerStatus").textContent =
      "Appuie sur lecture pour démarrer.";
  }
}

async function toggleFavorite(id) {
  if (!currentUser) {
    openAuth("login");
    return;
  }

  const wasFavorite = favorites.has(id);

  try {
    await api("/favorites", {
      method: "POST",
      body: JSON.stringify({
        episodeId: id,
        favorite: !wasFavorite
      })
    });

    if (wasFavorite) favorites.delete(id);
    else favorites.add(id);

    renderEpisodes();
    renderFavorites();
  } catch (error) {
    alert(error.message);
  }
}

$("episodes").addEventListener("click", handleEpisodeClick);
$("favorites").addEventListener("click", handleEpisodeClick);
$("ranking").addEventListener("click", handleEpisodeClick);

function handleEpisodeClick(event) {
  const playButton = event.target.closest("[data-play]");
  const favoriteButton = event.target.closest("[data-favorite]");

  if (playButton) playEpisode(playButton.dataset.play);
  if (favoriteButton) toggleFavorite(favoriteButton.dataset.favorite);
}

$("searchInput").addEventListener("input", (event) => {
  const query = event.target.value.toLowerCase().trim();

  const filtered = episodes.filter((episode) =>
    `${episode.title} ${episode.description}`
      .toLowerCase()
      .includes(query)
  );

  renderEpisodes(filtered);
});

$("loginButton").addEventListener("click", () => openAuth("login"));
$("registerButton").addEventListener("click", () => openAuth("register"));
$("logoutButton").addEventListener("click", logout);
$("authForm").addEventListener("submit", submitAuth);
$("closeDialog").addEventListener("click", () => $("authDialog").close());

$("audioPlayer").addEventListener("play", () => {
  $("playerStatus").textContent = "Lecture en cours";
});

$("audioPlayer").addEventListener("pause", () => {
  $("playerStatus").textContent = "En pause";
});

$("audioPlayer").addEventListener("ended", () => {
  $("playerStatus").textContent = "Épisode terminé";
});

async function start() {
  await loadMe();
  await loadEpisodes();
}

start();
