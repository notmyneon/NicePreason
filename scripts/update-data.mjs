import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { addStats, emptyStats, normalizeName, scoreStats, strengthForGoal, toiToSeconds } from "./scoring.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = path.join(ROOT, "data");
const CONFIG = {
  seasonId: Number(process.env.SEASON_ID || 20262027),
  seasonLabel: process.env.SEASON_LABEL || "2026–27",
  startDate: process.env.PRESEASON_START || "2026-09-19",
  endDate: process.env.PRESEASON_END || "2026-09-26",
};
const API = "https://api-web.nhle.com/v1";

function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '"' && quoted && text[i + 1] === '"') { field += '"'; i += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { row.push(field); field = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      row.push(field); field = "";
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
    } else field += char;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const headers = rows.shift().map((header) => header.replace(/^\uFEFF/, "").trim());
  return rows.map((values) => Object.fromEntries(headers.map((header, index) => [header, (values[index] || "").trim()])));
}

function dateRange(start, end) {
  const dates = [];
  const cursor = new Date(`${start}T12:00:00Z`);
  const finish = new Date(`${end}T12:00:00Z`);
  while (cursor <= finish) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

async function fetchJson(url, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "user-agent": "NiceHL-Preseason-Tracker/1.0" } });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
    }
  }
  throw new Error(`NHL request failed: ${url} (${lastError?.message || "unknown error"})`);
}

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  async function run() {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length || 1) }, run));
  return results;
}

function findStarterId(side, boxscore, pbp) {
  const teamId = boxscore[`${side}Team`].id;
  const opponentId = boxscore[side === "away" ? "homeTeam" : "awayTeam"].id;
  const firstFacedShot = pbp.plays.find((play) =>
    play.details?.goalieInNetId && play.details?.eventOwnerTeamId === opponentId
  );
  if (firstFacedShot) return firstFacedShot.details.goalieInNetId;
  const goalies = boxscore.playerByGameStats?.[`${side}Team`]?.goalies || [];
  return [...goalies].sort((a, b) => toiToSeconds(b.toi) - toiToSeconds(a.toi))[0]?.playerId || null;
}

function statsForGame(boxscore, pbp) {
  const players = new Map();
  const rosterSpots = new Map((pbp.rosterSpots || []).map((spot) => [spot.playerId, spot]));
  const upsert = (playerId, fallback = {}) => {
    if (!players.has(playerId)) {
      const spot = rosterSpots.get(playerId) || {};
      players.set(playerId, emptyStats({
        nhlId: playerId,
        name: [spot.firstName?.default, spot.lastName?.default].filter(Boolean).join(" ") || fallback.name?.default || "Unknown player",
        position: spot.positionCode || fallback.position || "",
        nhlTeam: spot.teamId === boxscore.awayTeam.id ? boxscore.awayTeam.abbrev : spot.teamId === boxscore.homeTeam.id ? boxscore.homeTeam.abbrev : "",
        headshot: spot.headshot || "",
      }));
    }
    return players.get(playerId);
  };

  for (const side of ["away", "home"]) {
    const teamStats = boxscore.playerByGameStats?.[`${side}Team`] || {};
    for (const group of ["forwards", "defense"]) {
      for (const player of teamStats[group] || []) {
        const stats = upsert(player.playerId, player);
        stats.games = 1;
        stats.goals = player.goals || 0;
        stats.assists = player.assists || 0;
        stats.blocks = player.blockedShots || 0;
        stats.hatTricks = stats.goals >= 3 ? 1 : 0;
      }
    }

    const goalies = (teamStats.goalies || []).filter((goalie) => toiToSeconds(goalie.toi) > 0);
    const starterId = findStarterId(side, boxscore, pbp);
    for (const goalie of goalies) {
      const stats = upsert(goalie.playerId, goalie);
      stats.games = 1;
      stats.starts = goalie.playerId === starterId ? 1 : 0;
      stats.goalsAgainst = goalie.goalsAgainst || 0;
      stats.wins = goalie.decision === "W" ? 1 : 0;
      stats.losses = goalie.decision === "L" ? 1 : 0;
      stats.otLosses = goalie.decision === "O" ? 1 : 0;
      stats.otWins = goalie.decision === "W" && boxscore.gameOutcome?.lastPeriodType === "OT" ? 1 : 0;
      stats.shutouts = goalie.decision === "W" && stats.goalsAgainst === 0 && goalies.length === 1 ? 1 : 0;
    }
  }

  for (const play of pbp.plays || []) {
    if (play.typeDescKey !== "goal" || play.periodDescriptor?.periodType === "SO") continue;
    const details = play.details || {};
    const participantIds = [details.scoringPlayerId, details.assist1PlayerId, details.assist2PlayerId].filter(Boolean);
    const strength = strengthForGoal(play, boxscore.awayTeam.id, boxscore.homeTeam.id);
    for (const playerId of participantIds) {
      const stats = upsert(playerId);
      if (strength === "PP") stats.powerPlayPoints += 1;
      if (strength === "SH") stats.shorthandedPoints += 1;
      if (stats.position === "G") {
        if (playerId === details.scoringPlayerId) stats.goals += 1;
        else stats.assists += 1;
      }
    }
  }

  return players;
}

function rounded(value) { return Math.round((value + Number.EPSILON) * 10) / 10; }

async function main() {
  const [rosterText, teamsText, aliasesText] = await Promise.all([
    fs.readFile(path.join(DATA, "rosters.csv"), "utf8"),
    fs.readFile(path.join(DATA, "teams.json"), "utf8"),
    fs.readFile(path.join(DATA, "player-aliases.json"), "utf8"),
  ]);
  const roster = parseCsv(rosterText);
  const teams = JSON.parse(teamsText);
  const aliases = JSON.parse(aliasesText).aliases || {};
  const rosterIndex = new Map();
  for (const player of roster) rosterIndex.set(normalizeName(player.Player), player);
  for (const [fantraxName, nhlName] of Object.entries(aliases)) rosterIndex.set(normalizeName(nhlName), roster.find((row) => row.Player === fantraxName));

  const schedules = await mapLimit(dateRange(CONFIG.startDate, CONFIG.endDate), 4, (date) => fetchJson(`${API}/schedule/${date}`));
  const games = new Map();
  for (const schedule of schedules) {
    for (const week of schedule.gameWeek || []) {
      for (const game of week.games || []) {
        if (game.season === CONFIG.seasonId && game.gameType === 1 && week.date >= CONFIG.startDate && week.date <= CONFIG.endDate) games.set(game.id, { ...game, gameDate: week.date });
      }
    }
  }
  const completedGames = [...games.values()].filter((game) => ["FINAL", "OFF"].includes(game.gameState)).sort((a, b) => a.gameDate.localeCompare(b.gameDate) || a.id - b.id);
  const gameData = await mapLimit(completedGames, 6, async (game) => {
    const [boxscore, pbp] = await Promise.all([
      fetchJson(`${API}/gamecenter/${game.id}/boxscore`),
      fetchJson(`${API}/gamecenter/${game.id}/play-by-play`),
    ]);
    return { game, playerStats: statsForGame(boxscore, pbp) };
  });

  const nhlTotals = new Map();
  const nhlByDate = new Map();
  for (const { game, playerStats } of gameData) {
    if (!nhlByDate.has(game.gameDate)) nhlByDate.set(game.gameDate, new Map());
    for (const [playerId, stats] of playerStats) {
      if (!nhlTotals.has(playerId)) nhlTotals.set(playerId, emptyStats(stats));
      addStats(nhlTotals.get(playerId), stats);
      if (!nhlByDate.get(game.gameDate).has(playerId)) nhlByDate.get(game.gameDate).set(playerId, emptyStats(stats));
      addStats(nhlByDate.get(game.gameDate).get(playerId), stats);
    }
  }

  const matchedByRosterName = new Map();
  for (const [playerId, stats] of nhlTotals) {
    const rosterPlayer = rosterIndex.get(normalizeName(stats.name));
    if (rosterPlayer) matchedByRosterName.set(rosterPlayer.Player, { playerId, stats });
  }

  const dates = [...nhlByDate.keys()].sort();
  const latestDate = dates.at(-1) || null;
  const playersByTeam = Object.fromEntries(Object.keys(teams).map((code) => [code, []]));
  const teamDaily = Object.fromEntries(Object.keys(teams).map((code) => [code, Object.fromEntries(dates.map((date) => [date, 0]))]));

  for (const rosterPlayer of roster) {
    const match = matchedByRosterName.get(rosterPlayer.Player);
    const totalStats = match?.stats || emptyStats({ name: rosterPlayer.Player, position: rosterPlayer.Position });
    const totalPoints = scoreStats(totalStats, rosterPlayer.Position);
    const latestStats = match && latestDate ? nhlByDate.get(latestDate)?.get(match.playerId) : null;
    const nightPoints = latestStats ? scoreStats(latestStats, rosterPlayer.Position) : 0;
    if (match) {
      for (const date of dates) {
        const dailyStats = nhlByDate.get(date)?.get(match.playerId);
        if (dailyStats) teamDaily[rosterPlayer.Team][date] += scoreStats(dailyStats, rosterPlayer.Position);
      }
    }
    playersByTeam[rosterPlayer.Team].push({
      name: rosterPlayer.Player,
      rosterPosition: rosterPlayer.Position,
      nhlId: match?.playerId || null,
      nhlPosition: totalStats.position || rosterPlayer.Position,
      nhlTeam: totalStats.nhlTeam || "",
      headshot: totalStats.headshot || "",
      appeared: totalStats.games > 0,
      points: rounded(totalPoints),
      nightPoints: rounded(nightPoints),
      stats: Object.fromEntries(Object.entries(totalStats).filter(([key]) => !["nhlId", "name", "position", "nhlTeam", "headshot"].includes(key))),
    });
  }

  const standings = Object.entries(teams).map(([teamCode, team]) => {
    const players = playersByTeam[teamCode].sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
    const totalPoints = players.reduce((sum, player) => sum + player.points, 0);
    const nightPoints = players.reduce((sum, player) => sum + player.nightPoints, 0);
    return {
      teamCode,
      teamName: team.name,
      primary: team.primary,
      accent: team.accent,
      totalPoints: rounded(totalPoints),
      nightPoints: rounded(nightPoints),
      playersAppeared: players.filter((player) => player.appeared).length,
      rosterSize: players.length,
      topScorer: players[0]?.appeared ? { name: players[0].name, points: players[0].points } : null,
    };
  }).sort((a, b) => b.totalPoints - a.totalPoints || b.nightPoints - a.nightPoints || a.teamName.localeCompare(b.teamName));
  standings.forEach((team, index) => { team.rank = index + 1; });

  const cumulative = Object.fromEntries(Object.keys(teams).map((code) => [code, 0]));
  const history = dates.map((date) => {
    for (const code of Object.keys(teams)) cumulative[code] += teamDaily[code][date] || 0;
    return { date, totals: Object.fromEntries(Object.entries(cumulative).map(([code, value]) => [code, rounded(value)])) };
  });

  const output = {
    competition: "NiceHL Preseason Championship",
    seasonId: CONFIG.seasonId,
    seasonLabel: CONFIG.seasonLabel,
    preseasonStart: CONFIG.startDate,
    preseasonEnd: CONFIG.endDate,
    updatedAt: new Date().toISOString(),
    completedThrough: latestDate,
    gamesProcessed: completedGames.length,
    scheduledGames: games.size,
    standings,
    teams: Object.fromEntries(Object.entries(teams).map(([code, team]) => [code, { ...team, players: playersByTeam[code] }])),
    history,
    diagnostics: {
      rosterPlayers: roster.length,
      matchedPlayers: matchedByRosterName.size,
      notYetAppeared: roster.length - matchedByRosterName.size,
    },
  };
  await fs.writeFile(path.join(DATA, "current.json"), `${JSON.stringify(output, null, 2)}\n`);
  console.log(`Processed ${completedGames.length} preseason games; matched ${matchedByRosterName.size}/${roster.length} roster players.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
