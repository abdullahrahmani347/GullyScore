#!/bin/bash
# Start the standalone server and run agent-browser tests in one session
set -e

cd /home/z/my-project

# Kill any existing server
pkill -f "next-server" 2>/dev/null || true
pkill -f "node .next/standalone/server.js" 2>/dev/null || true
lsof -ti:3000 | xargs kill -9 2>/dev/null || true
sleep 1

# Start server in background
NODE_ENV=production node .next/standalone/server.js > server.log 2>&1 &
SERVER_PID=$!
echo "Server PID: $SERVER_PID"

# Wait for server to be ready
for i in $(seq 1 15); do
  if curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ 2>/dev/null | grep -q "200"; then
    echo "Server ready after ${i}s"
    break
  fi
  sleep 1
done

# Verify server is running
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/)
echo "Server HTTP: $HTTP_CODE"

if [ "$HTTP_CODE" != "200" ]; then
  echo "Server not ready, aborting"
  kill $SERVER_PID 2>/dev/null
  exit 1
fi

# Close any existing browser session
agent-browser close --all 2>/dev/null || true
sleep 1

# Set viewport
agent-browser set viewport 1440 900
sleep 1

# Navigate to landing page
agent-browser navigate --url "http://localhost:3000/"
sleep 5

# Check scroll metrics
echo "=== Landing Page Metrics ==="
agent-browser eval "JSON.stringify({bodyHeight: document.body.scrollHeight, innerHeight: window.innerHeight, scrollPages: (document.body.scrollHeight/window.innerHeight).toFixed(1)})"

# Take hero screenshot
agent-browser screenshot /home/z/my-project/download/final-landing-hero.png

# Scroll to 50% and screenshot
agent-browser eval "window.scrollTo({top: document.body.scrollHeight * 0.5, behavior: 'instant'}); '50%'"
sleep 2
agent-browser screenshot /home/z/my-project/download/final-landing-50.png

# Scroll to 100% and screenshot
agent-browser eval "window.scrollTo({top: document.body.scrollHeight, behavior: 'instant'}); '100%'"
sleep 2
agent-browser screenshot /home/z/my-project/download/final-landing-100.png

# Scroll back to top, click dashboard link
agent-browser eval "window.scrollTo({top: 0, behavior: 'instant'}); 'top'"
sleep 2
agent-browser eval "document.querySelector('a[href=\"/dashboard\"]')?.click(); 'clicked'"
sleep 4

# Check dashboard metrics
echo "=== Dashboard Metrics ==="
agent-browser eval "JSON.stringify({url: window.location.href, scrollY: window.scrollY, bodyHeight: document.body.scrollHeight, hasCanvas: !!document.querySelector('canvas'), mainVisible: getComputedStyle(document.querySelector('main')).visibility, mainOpacity: getComputedStyle(document.querySelector('main')).opacity})"

# Take dashboard screenshot
agent-browser screenshot /home/z/my-project/download/final-dashboard.png

# Check for errors
echo "=== Console Errors ==="
agent-browser eval "JSON.stringify({errors: window.__errors || []})"

# Cleanup
kill $SERVER_PID 2>/dev/null || true
echo "=== Done ==="
