import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const data = JSON.parse(await fs.readFile(path.join(root, "data", "current.json"), "utf8"));

assert.equal(data.standings.length, 16, "Expected 16 NiceHL teams");
assert.equal(data.diagnostics.rosterPlayers, 375, "Expected 375 rostered players");
assert.equal(new Set(data.standings.map((team) => team.teamCode)).size, 16, "Team codes must be unique");

let playerCount = 0;
const names = new Set();
for (const standing of data.standings) {
  const players = data.teams[standing.teamCode]?.players || [];
  playerCount += players.length;
  const calculated = players.reduce((sum, player) => sum + player.points, 0);
  assert.ok(Number.isFinite(standing.totalPoints), `${standing.teamCode} total must be numeric`);
  assert.ok(Math.abs(calculated - standing.totalPoints) < 0.01, `${standing.teamCode} total does not reconcile`);
  for (const player of players) {
    assert.ok(!names.has(player.name), `Duplicate roster player: ${player.name}`);
    names.add(player.name);
    assert.ok(Number.isFinite(player.points), `Non-numeric points: ${player.name}`);
  }
}
assert.equal(playerCount, 375, "Player count does not reconcile");
console.log("Standings data validation passed.");
