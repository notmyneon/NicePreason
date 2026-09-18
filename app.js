const state = { data: null };
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function escapeHtml(value = "") {
  return String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}

function initials(code) {
  const clean = String(code).replace(/[^a-z0-9]/gi, "").toUpperCase();
  return clean.length <= 4 ? clean : clean.slice(0, 3);
}

function badge(team, extraClass = "") {
  return `<span class="team-badge ${extraClass}" style="background:linear-gradient(145deg,${team.primary},${team.accent});color:${team.primary === "#171717" || team.primary === "#111827" ? "#fff" : "#fff"}">${escapeHtml(initials(team.teamCode || team.code))}</span>`;
}

function formatPoints(value) { return Number(value || 0).toFixed(1).replace(/\.0$/, ""); }
function formatDate(date) {
  if (!date) return "Not started";
  return new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric", timeZone: "America/Edmonton" }).format(new Date(`${date}T12:00:00Z`));
}
function formatTimestamp(timestamp) {
  return new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Edmonton", timeZoneName: "short" }).format(new Date(timestamp));
}

function renderHeader() {
  const { data } = state;
  const started = data.gamesProcessed > 0;
  const leader = started ? data.standings[0] : null;
  $("#liveStatus").innerHTML = `<span class="status-dot"></span><span>${started ? `Updated ${formatTimestamp(data.updatedAt)}` : `Begins ${formatDate(data.preseasonStart)}`}</span>`;
  $("#gamesCount").textContent = data.gamesProcessed;
  $("#gamesCaption").textContent = `${data.scheduledGames} games currently scheduled`;
  $("#playersCount").textContent = data.diagnostics.matchedPlayers;
  $("#throughDate").textContent = formatDate(data.completedThrough);
  $("#updatedCaption").textContent = `Updated ${formatTimestamp(data.updatedAt)}`;
  $("#footerUpdate").textContent = `Last updated ${formatTimestamp(data.updatedAt)}`;
  const card = $("#leaderCard");
  if (!leader) {
    card.innerHTML = `<span class="leader-label">Championship leader</span><div class="leader-badge" style="background:linear-gradient(145deg,#343a43,#1c2027)">N</div><div><strong>Preseason begins ${formatDate(data.preseasonStart)}</strong><small>All teams start at zero</small></div>`;
    return;
  }
  card.style.background = `linear-gradient(145deg, color-mix(in srgb, ${leader.primary} 44%, #20252d), #111419 72%)`;
  card.innerHTML = `<span class="leader-label">Championship leader</span><span class="leader-badge" style="background:linear-gradient(145deg,${leader.primary},${leader.accent})">${escapeHtml(initials(leader.teamCode))}</span><div><strong>${escapeHtml(leader.teamName)}</strong><small>${formatPoints(leader.totalPoints)} points · ${leader.playersAppeared} players dressed</small></div>`;
}

function renderStandings() {
  const started = state.data.gamesProcessed > 0;
  const top = state.data.standings.slice(0, 3);
  $("#podium").innerHTML = top.map((team, index) => `<button class="podium-card" type="button" data-team="${escapeHtml(team.teamCode)}">${badge(team)}<span><span class="podium-place">${started ? ["1st place", "2nd place", "3rd place"][index] : "Roster ready"}</span><span class="podium-name">${escapeHtml(team.teamName)}</span></span><span class="podium-points">${formatPoints(team.totalPoints)}<small>points</small></span></button>`).join("");
  $("#standingsBody").innerHTML = state.data.standings.map((team) => `<tr data-team="${escapeHtml(team.teamCode)}"><td><span class="rank-number">${started ? team.rank : "—"}</span></td><td><div class="team-cell">${badge(team)}<span><strong>${escapeHtml(team.teamName)}</strong><small>${team.rosterSize} rostered</small></span></div></td><td class="numeric points-cell">${formatPoints(team.totalPoints)}</td><td class="numeric ${team.nightPoints > 0 ? "positive" : ""}">${team.nightPoints > 0 ? "+" : ""}${formatPoints(team.nightPoints)}</td><td class="numeric">${team.playersAppeared}/${team.rosterSize}</td><td>${team.topScorer ? `${escapeHtml(team.topScorer.name)} <span class="positive">${formatPoints(team.topScorer.points)}</span>` : "—"}</td></tr>`).join("");
  $$('[data-team]').forEach((element) => element.addEventListener("click", () => openTeam(element.dataset.team)));
}

function allPlayers() {
  return Object.entries(state.data.teams).flatMap(([teamCode, team]) => team.players.map((player) => ({ ...player, teamCode, teamName: team.name, primary: team.primary, accent: team.accent })));
}

function renderPlayerLeaders() {
  const leaders = allPlayers().filter((player) => player.appeared).sort((a, b) => b.points - a.points || a.name.localeCompare(b.name)).slice(0, 30);
  if (!leaders.length) {
    $("#playerLeaders").innerHTML = `<div class="empty-state">Player leaders will appear after the first NHL preseason games.</div>`;
    return;
  }
  $("#playerLeaders").innerHTML = leaders.map((player, index) => `<article class="player-leader"><span class="player-rank">${index + 1}</span>${player.headshot ? `<img class="headshot" src="${escapeHtml(player.headshot)}" alt="" loading="lazy">` : `<span class="headshot headshot-fallback">${escapeHtml(player.name.split(" ").map((part) => part[0]).join("").slice(0, 2))}</span>`}<span><strong>${escapeHtml(player.name)}</strong><small>${escapeHtml(player.teamName)} · ${escapeHtml(player.nhlTeam || player.nhlPosition)}</small></span><span class="player-total">${formatPoints(player.points)}<small>points</small></span></article>`).join("");
}

function renderRace() {
  const { history, standings } = state.data;
  if (!history.length) {
    $("#raceChart").innerHTML = `<div class="empty-state">The race chart will begin after the first night of preseason games.</div>`;
    return;
  }
  const leaders = standings.slice(0, 6);
  const width = 900, height = 280, left = 54, right = 22, top = 20, bottom = 42;
  const plotW = width - left - right, plotH = height - top - bottom;
  const max = Math.max(10, ...history.flatMap((entry) => leaders.map((team) => entry.totals[team.teamCode] || 0)));
  const x = (index) => left + (history.length === 1 ? plotW / 2 : index * plotW / (history.length - 1));
  const y = (value) => top + plotH - value / max * plotH;
  const grid = [0, .25, .5, .75, 1].map((portion) => { const value = max * portion; return `<line x1="${left}" y1="${y(value)}" x2="${width-right}" y2="${y(value)}" stroke="#2c323b"/><text x="${left-10}" y="${y(value)+4}" fill="#7f8894" font-size="11" text-anchor="end">${Math.round(value)}</text>`; }).join("");
  const lines = leaders.map((team) => {
    const points = history.map((entry, index) => `${x(index)},${y(entry.totals[team.teamCode] || 0)}`).join(" ");
    const last = history.at(-1).totals[team.teamCode] || 0;
    return `<polyline points="${points}" fill="none" stroke="${team.accent}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><circle cx="${x(history.length-1)}" cy="${y(last)}" r="4" fill="${team.accent}"/>`;
  }).join("");
  const labels = history.map((entry, index) => `<text x="${x(index)}" y="${height-13}" fill="#7f8894" font-size="11" text-anchor="middle">${formatDate(entry.date)}</text>`).join("");
  $("#raceChart").innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Cumulative points for the top six NiceHL teams">${grid}${lines}${labels}</svg><div class="chart-legend">${leaders.map((team) => `<span class="legend-item"><span class="legend-dot" style="background:${team.accent}"></span>${escapeHtml(team.teamName)}</span>`).join("")}</div>`;
}

function openTeam(code) {
  const team = state.data.teams[code];
  const standing = state.data.standings.find((entry) => entry.teamCode === code);
  if (!team || !standing) return;
  $("#dialogTeamHeading").innerHTML = `<div class="dialog-team">${badge({ ...team, teamCode: code })}<div><h2>${escapeHtml(team.name)}</h2><p>${standing.rosterSize} rostered players · ${standing.playersAppeared} have appeared</p></div></div>`;
  $("#teamSummary").innerHTML = `<div class="mini-stat"><span>Rank</span><strong>${state.data.gamesProcessed ? `#${standing.rank}` : "—"}</strong></div><div class="mini-stat"><span>Total points</span><strong>${formatPoints(standing.totalPoints)}</strong></div><div class="mini-stat"><span>Last night</span><strong>${standing.nightPoints > 0 ? "+" : ""}${formatPoints(standing.nightPoints)}</strong></div>`;
  $("#teamPlayers").innerHTML = team.players.map((player) => {
    const s = player.stats;
    return `<tr class="${player.appeared ? "" : "did-not-play"}"><td class="player-name"><strong>${escapeHtml(player.name)}</strong><small>${player.appeared ? escapeHtml(player.nhlTeam || "NHL preseason") : "Has not appeared"}</small></td><td>${escapeHtml(player.rosterPosition)}</td><td class="numeric">${s.games}</td><td class="numeric">${s.goals}</td><td class="numeric">${s.assists}</td><td class="numeric">${s.blocks}</td><td class="numeric">${s.powerPlayPoints}</td><td class="numeric">${s.shorthandedPoints}</td><td class="numeric">${s.hatTricks}</td><td class="numeric">${s.wins}</td><td class="numeric">${s.starts}</td><td class="numeric">${s.goalsAgainst}</td><td class="numeric">${s.losses}</td><td class="numeric">${s.otLosses}</td><td class="numeric">${s.shutouts}</td><td class="numeric">${s.otWins}</td><td class="numeric points-cell">${formatPoints(player.points)}</td></tr>`;
  }).join("");
  $("#teamDialog").showModal();
}

function activateTabs() {
  $$(".tab").forEach((button) => button.addEventListener("click", () => {
    $$(".tab").forEach((tab) => tab.classList.toggle("is-active", tab === button));
    $$(".view-panel").forEach((panel) => panel.classList.toggle("is-active", panel.dataset.panel === button.dataset.view));
  }));
}

async function init() {
  activateTabs();
  $("#closeDialog").addEventListener("click", () => $("#teamDialog").close());
  $("#teamDialog").addEventListener("click", (event) => { if (event.target === $("#teamDialog")) $("#teamDialog").close(); });
  try {
    const response = await fetch(`data/current.json?v=${Date.now()}`);
    if (!response.ok) throw new Error(`Data request failed (${response.status})`);
    state.data = await response.json();
    renderHeader(); renderStandings(); renderPlayerLeaders(); renderRace();
  } catch (error) {
    console.error(error);
    $("#liveStatus").innerHTML = `<span class="status-dot" style="background:#df6b65"></span><span>Standings unavailable</span>`;
    $("#standingsBody").innerHTML = `<tr><td colspan="6" class="empty-state">The standings could not be loaded. Try refreshing the page.</td></tr>`;
  }
}

init();
