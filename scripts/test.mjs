import assert from "node:assert/strict";
import { emptyStats, normalizeName, scoreStats, strengthForGoal } from "./scoring.mjs";

assert.equal(normalizeName("J.P. Hurlbert"), normalizeName("JP Hurlbert"));
assert.equal(normalizeName("Alexis Lafrenière"), normalizeName("Alexis Lafreniere"));

const skater = emptyStats({ position: "F" });
Object.assign(skater, { goals: 3, assists: 2, blocks: 4, powerPlayPoints: 2, shorthandedPoints: 1, hatTricks: 1 });
assert.equal(scoreStats(skater), 32);

const goalie = emptyStats({ position: "G" });
Object.assign(goalie, { wins: 1, starts: 1, goalsAgainst: 2, otWins: 1 });
assert.equal(scoreStats(goalie), 8);

const play = { situationCode: "1541", periodDescriptor: { periodType: "REG" }, details: { eventOwnerTeamId: 10 } };
assert.equal(strengthForGoal(play, 10, 20), "PP");
assert.equal(strengthForGoal({ ...play, situationCode: "1451" }, 10, 20), "SH");

console.log("Scoring tests passed.");
