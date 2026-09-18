# NiceHL Preseason Championship

A public, automatically updated championship table using only NHL preseason games and the full frozen rosters of all 16 NiceHL franchises.

## Championship rules

- Every player in `data/rosters.csv` counts, including active, reserve, minor-league and injured players.
- Only NHL preseason games (`gameType: 1`) count.
- Every player's results are added to the NiceHL franchise that owned the player at roster lock.
- There are no starters, bench slots or positional limits.

### Skaters

| Category | Points |
|---|---:|
| Goal | 5 |
| Assist | 3 |
| Blocked shot | 1 |
| Power-play point | 1 |
| Short-handed point | 2 |
| Hat trick | 3 |

### Goaltenders

| Category | Points |
|---|---:|
| Win | 8 |
| Game started | 3 |
| Goal against | -1 |
| Regulation loss | 2 |
| Shutout | 4 |
| OT/shootout loss | 3 |
| Overtime win | -1 |

Goalie goals, assists and special-teams points use the skater values.

## Automatic updates

The workflow in `.github/workflows/update-and-deploy.yml` runs each morning during the preseason and can also be started manually from the Actions tab. It:

1. Downloads the NHL preseason schedule.
2. Reads the official box score and play-by-play for every completed game.
3. Recalculates all player and team totals from the beginning of preseason.
4. Saves `data/current.json` and deploys the dashboard to GitHub Pages.

## Player matching

Players are matched using normalized full names from the NHL game roster. Punctuation, accents and spacing are ignored. If the NHL and Fantrax use genuinely different names, add an entry to `data/player-aliases.json`:

```json
{
  "aliases": {
    "Fantrax Name": "NHL Feed Name"
  }
}
```

## Local commands

```bash
npm test
npm run update
python3 -m http.server 8000
```

Then open `http://localhost:8000`.
