#!/usr/bin/env bash
# §14 UI smoke setup — creates a fresh match with NO setup done (no innings),
# so /matches/[id] should render the SetupWizard (toss step).
set -e
BASE=http://localhost:3000
DEV="browser-smoke-14"
CT="Content-Type: application/json"

T1=$(curl -s -X POST $BASE/api/teams -H "$CT" -H "X-Device-Id: $DEV" \
  -d '{"name":"Smoke A","shortName":"SMA","color":"#3B82F6","emoji":"X","players":[{"name":"a1"},{"name":"a2"},{"name":"a3"},{"name":"a4"},{"name":"a5"}]}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["id"])')
T2=$(curl -s -X POST $BASE/api/teams -H "$CT" -H "X-Device-Id: $DEV" \
  -d '{"name":"Smoke B","shortName":"SMB","color":"#FF4D6A","emoji":"Y","players":[{"name":"b1"},{"name":"b2"},{"name":"b3"}]}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["id"])')
echo "T1=$T1 T2=$T2"
MATCH=$(curl -s -X POST $BASE/api/matches -H "$CT" -H "X-Device-Id: $DEV" \
  -d "{\"team1Id\":\"$T1\",\"team2Id\":\"$T2\",\"totalOvers\":6,\"maxWickets\":10}" | python3 -c 'import sys,json;print(json.load(sys.stdin)["id"])')
echo "MATCH=$MATCH"
echo "$MATCH" > /home/z/my-project/scripts/smoke-match-id.txt
