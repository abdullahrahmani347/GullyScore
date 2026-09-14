#!/bin/bash
# GULLYSCORE v2 §12.1 — browser E2E: tap NB, tap 4 → FH chip appears then disappears
set -e
BASE=http://localhost:3000
AB="agent-browser"

$AB set viewport 390 844
$AB open $BASE/dashboard
sleep 3

# Create a match through the UI path is heavy; instead seed via API with the
# page's device id, then open the scoring screen.
# First read the device id the browser generated:
DEV=$($AB storage local key gullyscore_device_id 2>/dev/null | tail -1 | tr -d '"' || true)
if [ -z "$DEV" ]; then
  $AB storage local
  DEV=$($AB eval "localStorage.getItem('gullyscore_device_id')" | tail -1 | tr -d '"')
fi
echo "DEVICE: $DEV"

# Seed: teams + v2 match + innings + openers via API
SEED=$(BUN_DEVICE=$DEV bun -e "
const DEV = process.env.BUN_DEVICE;
const BASE = '$BASE';
const H = { 'Content-Type': 'application/json', 'X-Device-Id': DEV };
const post = async (p, b) => (await fetch(BASE + p, { method: 'POST', headers: H, body: JSON.stringify(b) })).json();
const stamp = Date.now().toString(36);
const bat = await post('/api/teams', { name: 'UI FH ' + stamp, shortName: 'UI' + stamp.slice(-3).toUpperCase(), players: Array.from({length: 6}, (_, i) => ({ name: 'Bat' + (i+1) })) });
const bowl = await post('/api/teams', { name: 'UI BOWL ' + stamp, shortName: 'UB' + stamp.slice(-3).toUpperCase(), players: Array.from({length: 4}, (_, i) => ({ name: 'Bowl' + (i+1) })) });
const match = await post('/api/matches', { team1Id: bat.id, team2Id: bowl.id, totalOvers: 10, maxWickets: 10, rules: { freeHitOnNoBall: true } });
const inn = await post('/api/matches/' + match.id + '/innings', { teamId: bat.id, inningsNumber: 1 });
await post('/api/matches/' + match.id + '/innings/' + inn.id + '/striker', { strikerId: bat.players[0].id, nonStrikerId: bat.players[1].id });
await post('/api/matches/' + match.id + '/innings/' + inn.id + '/bowler', { bowlerId: bowl.players[0].id });
console.log(JSON.stringify({ matchId: match.id, innId: inn.id }));
")
echo "SEED: $SEED"
MATCH_ID=$(echo $SEED | python3 -c "import json,sys; print(json.load(sys.stdin)['matchId'])")

# Open the scoring page
$AB open $BASE/matches/$MATCH_ID
sleep 4
$AB snapshot -i > /tmp/snap1.txt 2>&1 || true
grep -i "free hit" /tmp/snap1.txt && echo "FH FOUND TOO EARLY (should not be present yet)" || echo "OK: no FH pill before any no-ball"

# Tap Extras → No Ball → 0 runs → Record
$AB find text "Extras" click || true
sleep 1
$AB find text "No Ball" click || true
sleep 1
$AB find text "Record No-ball" click || true
sleep 2
$AB snapshot -i > /tmp/snap2.txt 2>&1 || true
if grep -qi "free hit" /tmp/snap2.txt; then echo "OK: FH chip appeared after the no-ball"; else echo "FAIL: FH chip missing after NB"; fi

# Tap 4 (legal ball) — the free hit delivery
$AB find text "4" click || true
sleep 2
$AB snapshot -i > /tmp/snap3.txt 2>&1 || true
if grep -qi "free hit" /tmp/snap3.txt; then echo "FAIL: FH chip still present after the legal ball"; else echo "OK: FH chip disappeared after the legal ball"; fi

# Score sanity: 1 (nb) + 4 = 5 runs
$AB eval "document.body.innerText.match(/5\/0/) ? 'OK: score 5/0' : document.body.innerText.slice(0, 400)"
$AB screenshot /home/z/my-project/scripts/fh-verify.png
$AB console > /tmp/console.txt 2>&1 || true
echo "--- console errors:"
grep -i "error" /tmp/console.txt | head -5 || echo "none"
