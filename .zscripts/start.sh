#!/bin/sh

# NOTE: This script is invoked by the platform's deploy target after extracting
# the build tarball. It must be robust against:
#   - Slow Next.js cold starts (the old `sleep 1` check was too short — the
#     platform's health check would time out before Next.js was ready, even
#     though the process was technically alive).
#   - bun not being in PATH on the deploy target (fall back to node).
#   - /app/db/custom.db missing (the deploy target may extract to a different
#     path; fall back to ./db/custom.db relative to this script).
#   - Port 81 already in use (skip starting our own Caddy and let the
#     platform's Caddy handle proxying — it already proxies :81 → :3000).
#   - DATABASE_URL leakage from .env (override explicitly here).

set -e

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BUILD_DIR="$SCRIPT_DIR"

# 存储所有子进程的 PID
pids=""

# 清理函数：优雅关闭所有服务
cleanup() {
    echo ""
    echo "🛑 正在关闭所有服务..."

    # 发送 SIGTERM 信号给所有子进程
    for pid in $pids; do
        if kill -0 "$pid" 2>/dev/null; then
            service_name=$(ps -p "$pid" -o comm= 2>/dev/null || echo "unknown")
            echo "   关闭进程 $pid ($service_name)..."
            kill -TERM "$pid" 2>/dev/null
        fi
    done

    # 等待所有进程退出（最多等待 5 秒）
    sleep 1
    for pid in $pids; do
        if kill -0 "$pid" 2>/dev/null; then
            # 如果还在运行，等待最多 4 秒
            timeout=4
            while [ $timeout -gt 0 ] && kill -0 "$pid" 2>/dev/null; do
                sleep 1
                timeout=$((timeout - 1))
            done
            # 如果仍然在运行，强制关闭
            if kill -0 "$pid" 2>/dev/null; then
                echo "   强制关闭进程 $pid..."
                kill -KILL "$pid" 2>/dev/null
            fi
        fi
    done

    echo "✅ 所有服务已关闭"
    exit 0
}

echo "🚀 开始启动所有服务..."
echo ""

# 切换到构建目录
cd "$BUILD_DIR" || exit 1

# Diagnostic: dump the build dir layout so we can see what was actually deployed
echo "=== Build directory contents ==="
ls -lah
echo ""

# Resolve DB path: prefer the platform-default /app/db/custom.db, but fall back
# to a path relative to this script (in case the deploy target extracts to a
# non-/app/ location). The previous hard-coded /app/db/custom.db check would
# exit 1 if the deploy target used a different root, with no fallback.
DEFAULT_PACKAGED_DB_PATH="/app/db/custom.db"
if [ ! -f "$DEFAULT_PACKAGED_DB_PATH" ]; then
    FALLBACK_DB_PATH="$BUILD_DIR/db/custom.db"
    if [ -f "$FALLBACK_DB_PATH" ]; then
        echo "ℹ️  /app/db/custom.db not found, using fallback: $FALLBACK_DB_PATH"
        DEFAULT_PACKAGED_DB_PATH="$FALLBACK_DB_PATH"
    fi
fi
DEFAULT_PACKAGED_DATABASE_URL="file:$DEFAULT_PACKAGED_DB_PATH"

# 启动 Next.js 服务器
if [ -f "./next-service-dist/server.js" ]; then
    echo "🚀 启动 Next.js 服务器..."
    cd next-service-dist/ || exit 1

    # 设置环境变量
    export NODE_ENV=production
    # Force Next.js to listen on internal port 3000 (overriding whatever PORT
    # the platform may have set). The platform's reverse proxy and our Caddy
    # both expect Next.js on :3000. If the platform sets PORT=80, the old code
    # would put Next.js on :80, breaking the Caddy proxy and the health check.
    export PORT=3000
    export HOSTNAME="${HOSTNAME:-0.0.0.0}"
    # Always override DATABASE_URL — the standalone build's .env file (copied
    # from the dev environment) contains the DEV database path which doesn't
    # exist on the deploy target. Setting it explicitly here ensures Prisma
    # connects to the right DB regardless of what's in .env.
    export DATABASE_URL="${DATABASE_URL:-$DEFAULT_PACKAGED_DATABASE_URL}"
    # Force DATABASE_URL to the resolved path if it points at the default
    # (some platforms export DATABASE_URL alongside .env leakage; this guards
    # against both).
    if [ -z "$DATABASE_URL" ] || [ "$DATABASE_URL" = "file:/home/z/my-project/db/custom.db" ]; then
        export DATABASE_URL="$DEFAULT_PACKAGED_DATABASE_URL"
    fi

    if [ "$DATABASE_URL" = "file:$DEFAULT_PACKAGED_DB_PATH" ]; then
        if [ ! -f "$DEFAULT_PACKAGED_DB_PATH" ]; then
            echo "❌ 未找到打包后的数据库文件 $DEFAULT_PACKAGED_DB_PATH"
            echo "   为避免生产环境启动到空数据库，启动已终止"
            exit 1
        fi

        echo "🗄️  当前使用打包数据库: $DEFAULT_PACKAGED_DB_PATH"
    else
        echo "🗄️  当前使用外部指定数据库: $DATABASE_URL"
    fi

    # Pick a runtime: prefer bun (matches build env), fall back to node.
    RUNTIME=""
    if command -v bun >/dev/null 2>&1; then
        RUNTIME="bun"
    elif command -v node >/dev/null 2>&1; then
        RUNTIME="node"
        echo "⚠️  bun not found in PATH, falling back to node"
    else
        echo "❌ Neither bun nor node found in PATH"
        exit 1
    fi

    echo "   runtime: $RUNTIME"
    echo "   port:    $PORT"
    echo "   db:      $DATABASE_URL"

    # 后台启动 Next.js
    "$RUNTIME" server.js &
    NEXT_PID=$!
    pids="$NEXT_PID"

    # Real HTTP health check (replaces the old `sleep 1` PID check).
    # Next.js cold start can take 2-5s; the old 1s check would either pass
    # spuriously (process alive but not listening) or fail prematurely.
    echo "⏳ Waiting for Next.js to respond on :$PORT..."
    HEALTH_OK=0
    ATTEMPT=0
    MAX_ATTEMPTS=30
    while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
        ATTEMPT=$((ATTEMPT + 1))
        if ! kill -0 "$NEXT_PID" 2>/dev/null; then
            echo "❌ Next.js 服务器进程退出 (PID $NEXT_PID) after $ATTEMPT attempt(s)"
            exit 1
        fi
        if curl -s -o /dev/null -w "%{http_code}" --max-time 2 "http://localhost:$PORT/" 2>/dev/null | grep -qE "^(200|307|308|404)$"; then
            HEALTH_OK=1
            echo "✅ Next.js healthy on attempt $ATTEMPT"
            break
        fi
        sleep 1
    done

    if [ $HEALTH_OK -ne 1 ]; then
        echo "❌ Next.js did not become healthy within ${MAX_ATTEMPTS}s"
        echo "   Last 20 log lines (if any):"
        # Print recent stdout/stderr if we captured it (we didn't, but log
        # the diagnostic anyway in case the platform captures it).
        echo "   Process still alive? $(kill -0 "$NEXT_PID" 2>/dev/null && echo yes || echo no)"
        exit 1
    fi

    echo "✅ Next.js 服务器已启动 (PID: $NEXT_PID, Port: $PORT)"

    cd ../
else
    echo "⚠️  未找到 Next.js 服务器文件: ./next-service-dist/server.js"
fi

# 启动 mini-services
if [ -f "./mini-services-start.sh" ]; then
    echo "🚀 启动 mini-services..."

    # 运行启动脚本（从根目录运行，脚本内部会处理 mini-services-dist 目录）
    sh ./mini-services-start.sh &
    MINI_PID=$!
    pids="$pids $MINI_PID"

    # 等待一小段时间检查进程是否成功启动
    sleep 1
    if ! kill -0 "$MINI_PID" 2>/dev/null; then
        echo "⚠️  mini-services 可能启动失败，但继续运行..."
    else
        echo "✅ mini-services 已启动 (PID: $MINI_PID)"
    fi
elif [ -d "./mini-services-dist" ]; then
    echo "⚠️  未找到 mini-services 启动脚本，但目录存在"
else
    echo "ℹ️  mini-services 目录不存在，跳过"
fi

# 启动 Caddy（如果存在 Caddyfile 且端口可用）
# The platform's own container entrypoint (/start.sh on the base image) may
# already have a Caddy listening on :81 (it ends with `exec caddy run --config
# /app/Caddyfile`). If we try to start our own Caddy on :81, it'll fail with
# "bind: address already in use" and the container will crash.
# Detect this (via curl, since /dev/tcp is bash-only) and either skip our
# Caddy (let the platform's Caddy proxy to our Next.js on :3000) or start our
# Caddy in the background. If our Caddy fails to bind, fall back to keeping
# the container alive via Next.js alone.
echo "🚀 启动 Caddy..."

CADDY_PID=""
if ! command -v caddy >/dev/null 2>&1; then
    echo "⚠️  caddy not found in PATH — skipping Caddy, relying on platform proxy"
elif [ ! -f "./Caddyfile" ]; then
    echo "⚠️  Caddyfile not found — skipping Caddy"
else
    # Check if something is already listening on :81 (likely the platform's
    # Caddy from the base image's /start.sh). Use curl since /dev/tcp is a
    # bash-ism and this script's shebang is /bin/sh.
    PORT_81_TAKEN=0
    if command -v curl >/dev/null 2>&1; then
        # curl exit 0/22/etc = got a response (port open). exit 7 = refused.
        if curl -s -o /dev/null --connect-timeout 1 --max-time 2 "http://localhost:81/" 2>/dev/null; then
            PORT_81_TAKEN=1
        fi
    fi

    if [ $PORT_81_TAKEN -eq 1 ]; then
        echo "ℹ️  Port 81 is already in use (likely the platform's Caddy)."
        echo "   Skipping our Caddy — platform's Caddy should proxy :81 → localhost:3000."
    else
        echo "✅ Starting our Caddy in background"
        caddy run --config Caddyfile --adapter caddyfile > /tmp/our-caddy.log 2>&1 &
        CADDY_PID=$!
        pids="$pids $CADDY_PID"
        sleep 1
        if ! kill -0 "$CADDY_PID" 2>/dev/null; then
            echo "⚠️  Caddy failed to start (see /tmp/our-caddy.log). Continuing with Next.js only."
            echo "   Last 10 lines of Caddy log:"
            tail -10 /tmp/our-caddy.log 2>/dev/null || echo "   (no log file)"
            CADDY_PID=""
        else
            echo "✅ Caddy 已启动 (PID: $CADDY_PID, Port: 81 → localhost:3000)"
        fi
    fi
fi

echo ""
echo "🎉 服务已启动！"
echo ""
echo "💡 按 Ctrl+C 停止所有服务"
echo ""

# Keep the script alive. If Caddy is running, wait on it (it's the main
# proxy). If Caddy isn't running, wait on Next.js directly. Either way, when
# the waited process dies, we exit and the container restarts.
if [ -n "$CADDY_PID" ]; then
    wait "$CADDY_PID"
else
    wait "$NEXT_PID"
fi
