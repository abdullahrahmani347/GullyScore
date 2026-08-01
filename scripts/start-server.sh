#!/bin/bash
# Start the Next.js standalone server, fully detached from the parent shell
# so it survives the calling Bash command exiting.
# Uses setsid to create a new session + nohup-style redirection.

cd /home/z/my-project

# Kill any existing server
pkill -f "next-server" 2>/dev/null
pkill -f "node .next/standalone" 2>/dev/null
sleep 2

# Start with setsid: creates new session, detaches from controlling terminal.
# < /dev/null  → stdin from /dev/null (no hang on read)
# > server.log 2>&1  → stdout+stderr to file
# &  → background
# Then disown to remove from shell's job table.
setsid bash -c 'exec node .next/standalone/server.js' < /dev/null > /home/z/my-project/server.log 2>&1 &
SERVER_PID=$!
disown $SERVER_PID 2>/dev/null

# Wait for the server to be ready (max 10 seconds)
for i in $(seq 1 20); do
  if curl -s -o /dev/null http://localhost:3000/ 2>/dev/null; then
    echo "Server ready (PID $SERVER_PID) after ${i}*0.5s"
    break
  fi
  sleep 0.5
done

# Verify it's still alive
sleep 1
if ps -p $SERVER_PID > /dev/null 2>&1; then
  echo "ALIVE: PID $SERVER_PID"
else
  echo "DEAD: server exited. Log:"
  cat /home/z/my-project/server.log
fi

# Final check
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:3000/
