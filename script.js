const username = "clevsoncoelho";
const state = { repos: [], filter: "all", query: "" };
const syncInterval = 5 * 60 * 1000;
let syncInFlight = false;
let lastSyncAt = 0;
const fallbackProfile = { public_repos: 8, followers: 0, following: 1 };

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
const formatNumber = (value) => new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(value || 0);

function updateStats(profile, repos) {
  const avatar = document.querySelector("#profile-avatar");
  if (profile.avatar_url) avatar.src = profile.avatar_url;
  document.querySelector("#repo-count").textContent = formatNumber(profile.public_repos);
  document.querySelector("#followers-count").textContent = formatNumber(profile.followers);
  document.querySelector("#following-count").textContent = formatNumber(profile.following);
  document.querySelector("#language-count").textContent = new Set(repos.map((repo) => repo.language).filter(Boolean)).size;
}

function updateSyncStatus(message, isError = false) {
  const status = document.querySelector("#sync-status");
  status.innerHTML = `<i></i> ${message}`;
  status.classList.toggle("is-error", isError);
}

document.addEventListener("pointermove", (event) => {
  document.querySelector(".cursor-glow").style.left = `${event.clientX}px`;
  document.querySelector(".cursor-glow").style.top = `${event.clientY}px`;
});
document.addEventListener("scroll", () => {
  const progress = window.scrollY / (document.documentElement.scrollHeight - window.innerHeight);
  document.querySelector("#scroll-progress").style.width = `${Math.min(progress * 100, 100)}%`;
}, { passive: true });

function renderFilters() {
  const languages = [...new Set(state.repos.map((repo) => repo.language).filter(Boolean))].sort();
  document.querySelector("#filter-buttons").innerHTML = ["all", ...languages].map((language) => `<button class="filter ${state.filter === language ? "active" : ""}" data-filter="${escapeHtml(language)}">${language === "all" ? "Todos" : escapeHtml(language)}</button>`).join("");
  document.querySelectorAll(".filter").forEach((button) => button.addEventListener("click", () => { state.filter = button.dataset.filter; renderFilters(); renderProjects(); }));
}

function renderProjects() {
  const filtered = state.repos.filter((repo) => {
    const matchesFilter = state.filter === "all" || repo.language === state.filter;
    const text = `${repo.name} ${repo.description || ""}`.toLowerCase();
    return matchesFilter && text.includes(state.query.toLowerCase());
  });
  const grid = document.querySelector("#project-grid");
  if (!filtered.length) { grid.innerHTML = `<div class="loading">Nenhum projeto encontrado.</div>`; return; }
  grid.innerHTML = filtered.map((repo, index) => `<article class="project"><div class="project-top"><span>${String(index + 1).padStart(2, "0")} / ${repo.language || "projeto"}</span><span class="project-star">★ ${formatNumber(repo.stargazers_count)}</span></div><h3>${escapeHtml(repo.name.replaceAll("-", " "))}</h3><p>${escapeHtml(repo.description || "Projeto em construção e aprendizado contínuo.")}</p><div class="project-bottom"><span>⑂ ${formatNumber(repo.forks_count)} forks</span><a href="${repo.html_url}" target="_blank" rel="noreferrer" aria-label="Abrir ${escapeHtml(repo.name)} no GitHub">↗</a></div></article>`).join("");
}

async function loadGitHubData() {
  if (syncInFlight || Date.now() - lastSyncAt < 30000) return;
  syncInFlight = true;
  try {
    updateSyncStatus("sincronizando GitHub...");
    const [profileResponse, reposResponse] = await Promise.all([
      fetch(`https://api.github.com/users/${username}`, { cache: "no-store" }),
      fetch(`https://api.github.com/users/${username}/repos?per_page=100&sort=updated`, { cache: "no-store" })
    ]);
    if (!profileResponse.ok || !reposResponse.ok) throw new Error("GitHub API indisponível");
    const [profile, repos] = await Promise.all([profileResponse.json(), reposResponse.json()]);
    state.repos = repos.filter((repo) => !repo.fork);
    localStorage.setItem("github-portfolio-cache", JSON.stringify({ profile, repos: state.repos, syncedAt: Date.now() }));
    updateStats(profile, state.repos);
    renderFilters();
    renderProjects();
    updateSyncStatus(`atualizado às ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`);
    lastSyncAt = Date.now();
  } catch (error) {
    const cached = localStorage.getItem("github-portfolio-cache");
    if (!state.repos.length && cached) {
      const saved = JSON.parse(cached);
      state.repos = saved.repos || [];
      updateStats({ ...fallbackProfile, ...(saved.profile || {}) }, state.repos);
      renderFilters();
      renderProjects();
      updateSyncStatus("exibindo última sincronização disponível", true);
    } else if (!state.repos.length) {
      updateStats(fallbackProfile, []);
      document.querySelector("#project-grid").innerHTML = "";
      document.querySelector("#project-error").hidden = false;
      updateSyncStatus("dados exibidos do último snapshot", true);
    }
    console.error("Não foi possível carregar dados do GitHub:", error);
  } finally {
    syncInFlight = false;
  }
}

document.querySelector("#project-search").addEventListener("input", (event) => { state.query = event.target.value; renderProjects(); });
document.querySelector("#year").textContent = new Date().getFullYear();
loadGitHubData();
setInterval(() => { if (!document.hidden) loadGitHubData(); }, syncInterval);
window.addEventListener("focus", loadGitHubData);
document.addEventListener("visibilitychange", () => { if (!document.hidden) loadGitHubData(); });
