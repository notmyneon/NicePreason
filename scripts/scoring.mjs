export const SCORING = Object.freeze({
  skater: Object.freeze({
    goals: 5,
    assists: 3,
    blocks: 1,
    powerPlayPoints: 1,
    shorthandedPoints: 2,
    hatTricks: 3,
  }),
  goalie: Object.freeze({
    wins: 8,
    starts: 3,
    goalsAgainst: -1,
    losses: 2,
    shutouts: 4,
    otLosses: 3,
    otWins: -1,
  }),
});

export function normalizeName(value = "") {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(jr|sr|ii|iii|iv)\b/gi, "")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();
}

export function emptyStats({ nhlId = null, name = "", position = "", nhlTeam = "", headshot = "" } = {}) {
  return {
    nhlId,
    name,
    position,
    nhlTeam,
    headshot,
    games: 0,
    goals: 0,
    assists: 0,
    blocks: 0,
    powerPlayPoints: 0,
    shorthandedPoints: 0,
    hatTricks: 0,
    wins: 0,
    starts: 0,
    goalsAgainst: 0,
    losses: 0,
    shutouts: 0,
    otLosses: 0,
    otWins: 0,
  };
}

export function addStats(target, source) {
  const numericKeys = [
    "games", "goals", "assists", "blocks", "powerPlayPoints", "shorthandedPoints",
    "hatTricks", "wins", "starts", "goalsAgainst", "losses", "shutouts",
    "otLosses", "otWins",
  ];
  for (const key of numericKeys) target[key] = (target[key] || 0) + (source[key] || 0);
  if (!target.nhlId && source.nhlId) target.nhlId = source.nhlId;
  if (!target.name && source.name) target.name = source.name;
  if (!target.position && source.position) target.position = source.position;
  if (!target.nhlTeam && source.nhlTeam) target.nhlTeam = source.nhlTeam;
  if (!target.headshot && source.headshot) target.headshot = source.headshot;
  return target;
}

export function scoreStats(stats, rosterPosition = "") {
  const s = SCORING.skater;
  let points =
    stats.goals * s.goals +
    stats.assists * s.assists +
    stats.blocks * s.blocks +
    stats.powerPlayPoints * s.powerPlayPoints +
    stats.shorthandedPoints * s.shorthandedPoints +
    stats.hatTricks * s.hatTricks;

  if (stats.position === "G" || rosterPosition === "G") {
    const g = SCORING.goalie;
    points +=
      stats.wins * g.wins +
      stats.starts * g.starts +
      stats.goalsAgainst * g.goalsAgainst +
      stats.losses * g.losses +
      stats.shutouts * g.shutouts +
      stats.otLosses * g.otLosses +
      stats.otWins * g.otWins;
  }
  return points;
}

export function strengthForGoal(play, awayTeamId, homeTeamId) {
  const code = String(play.situationCode || "");
  if (code.length !== 4 || play.periodDescriptor?.periodType === "SO") return "EV";
  const awaySkaters = Number(code[1]);
  const homeSkaters = Number(code[2]);
  const owner = play.details?.eventOwnerTeamId;
  const own = owner === awayTeamId ? awaySkaters : owner === homeTeamId ? homeSkaters : 0;
  const opponent = owner === awayTeamId ? homeSkaters : owner === homeTeamId ? awaySkaters : 0;
  if (own > opponent) return "PP";
  if (own < opponent) return "SH";
  return "EV";
}

export function toiToSeconds(toi = "0:00") {
  const [minutes, seconds] = String(toi).split(":").map(Number);
  return (Number.isFinite(minutes) ? minutes : 0) * 60 + (Number.isFinite(seconds) ? seconds : 0);
}
