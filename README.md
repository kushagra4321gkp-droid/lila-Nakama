# LILA — Multiplayer Tic-Tac-Toe

A **production-ready, server-authoritative** multiplayer Tic-Tac-Toe game built with [Nakama](https://heroiclabs.com/nakama/) and React.

---

## ✨ Features

| Feature | Status |
|---|---|
| Server-authoritative game logic | ✅ |
| Real-time move broadcasting | ✅ |
| Automatic matchmaking | ✅ |
| Open room discovery & direct join | ✅ |
| Graceful disconnect handling (opponent left → forfeit win) | ✅ |
| Multiple concurrent game sessions (isolated) | ✅ |
| Global leaderboard (wins / losses / draws / score) | ✅ |
| Timed mode — 30 s per turn, auto-forfeit on timeout | ✅ |
| Classic mode (no timer) | ✅ |
| Session persistence (auto-login on revisit) | ✅ |
| Mobile-first responsive UI | ✅ |

---

## 🏗 Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Client (React + Vite)                   │
│  Login → Lobby → Matchmaking → Game → Leaderboard           │
│  Nakama JS SDK v2  (HTTP API + WebSocket real-time)         │
└────────────────────┬────────────────────────────────────────┘
                     │  HTTP RPC   +   WebSocket
┌────────────────────▼────────────────────────────────────────┐
│              Nakama 3.21  (authoritative server)            │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────┐ │
│  │ Match Handler│  │  Matchmaker  │  │   Leaderboard     │ │
│  │  tictactoe   │  │   (2 plyr)   │  │ tictactoe_global  │ │
│  │              │  │              │  │                   │ │
│  │ matchInit    │  │ matchmaker   │  │ rpcGetLeaderboard │ │
│  │ matchJoin    │  │ Matched hook │  │ rpcGetMyStats     │ │
│  │ matchLeave   │  │ → creates    │  │                   │ │
│  │ matchLoop    │  │   match      │  │ written server-   │ │
│  │ matchSignal  │  └──────────────┘  │ side after game   │ │
│  └──────────────┘                   └───────────────────┘ │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │                  RPC Endpoints                       │  │
│  │  create_match  list_matches  get_leaderboard         │  │
│  │  get_my_stats                                        │  │
│  └──────────────────────────────────────────────────────┘  │
└────────────────────┬────────────────────────────────────────┘
                     │ SQL
┌────────────────────▼────────────────────────────────────────┐
│                  CockroachDB  (persistent storage)          │
│  users · sessions · leaderboard records                     │
└─────────────────────────────────────────────────────────────┘
```

### Server-Authoritative Design

All game logic lives in `nakama/src/tictactoe.ts`:

- **`matchLoop`** processes client messages every tick (10 Hz). It validates moves, applies them to the board, checks for win/draw, and broadcasts the new state.
- Clients **cannot** directly write to game state — they only send `MAKE_MOVE` messages. The server rejects illegal moves silently.
- The timer (timed mode) decrements server-side; clients only receive `TIMER_TICK` events — they cannot manipulate time.
- Leaderboard records are written exclusively from server code after a game ends.

### Message Protocol

| OpCode | Direction | Payload |
|--------|-----------|---------|
| `1` MAKE_MOVE | client → server | `{ position: 0–8 }` |
| `2` GAME_STATE | server → client | board, marks, currentTurn, timer, … |
| `3` GAME_OVER | server → client | winner, reason, winLine |
| `4` WAITING | server → client | waiting for opponent |
| `5` TIMER_TICK | server → client | secondsLeft |
| `6` ERROR | server → client | message |

---

## 🚀 Local Development Setup

### Prerequisites

- [Docker](https://www.docker.com/) & Docker Compose
- [Node.js 20+](https://nodejs.org/) (for building the Nakama bundle locally)
- npm

### Step 1 — Build the Nakama JS bundle

```bash
cd nakama
npm install
npm run build        # outputs nakama/build/index.js
cd ..
```

### Step 2 — Start Nakama + CockroachDB

```bash
docker-compose up -d cockroachdb nakama
```

Wait ~20 s for CockroachDB to be healthy. Check Nakama logs:

```bash
docker-compose logs -f nakama
```

You should see `Tic-Tac-Toe module initialised ✓` in the output.

### Step 3 — Start the frontend dev server

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173** in two browser tabs (or two devices on the same network) to test multiplayer.

> The `VITE_NAKAMA_*` environment variables are pre-configured in `docker-compose.yml` to point to `localhost:7350`.

### Nakama Console

Visit **http://localhost:7351** → login with `admin / admin123` to inspect matches, users, leaderboard records, and API logs.

---

## ☁️ Cloud Deployment

### Step 1 — Provision a VM

Spin up a VM on AWS EC2, GCP Compute Engine, DigitalOcean Droplet, or Azure VM.

Recommended: **Ubuntu 22.04**, 2 vCPU, 2 GB RAM (minimum).

Open these firewall ports:

| Port | Purpose |
|------|---------|
| 22 | SSH |
| 80 | Frontend (HTTP) |
| 443 | Frontend (HTTPS, if using SSL) |
| 7350 | Nakama API + WebSocket |
| 7351 | Nakama Console (optional, restrict to your IP) |

### Step 2 — Install Docker on the VM

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# Log out and back in
```

### Step 3 — Clone the repo

```bash
git clone https://github.com/YOUR_USERNAME/lila-tictactoe.git
cd lila-tictactoe
```

### Step 4 — Configure environment

```bash
cp .env.example .env
nano .env
```

Set `NAKAMA_PUBLIC_HOST` to your VM's public IP or domain name.

### Step 5 — Build the Nakama bundle inside the VM

```bash
cd nakama && npm install && npm run build && cd ..
```

Or just use the production Docker build (which builds the bundle automatically):

```bash
docker-compose -f docker-compose.prod.yml build
```

### Step 6 — Launch

```bash
docker-compose -f docker-compose.prod.yml up -d
```

The frontend is now at **http://YOUR_SERVER_IP**, and the Nakama endpoint is at **http://YOUR_SERVER_IP:7350**.

### Step 7 — (Optional) HTTPS with Caddy

Install [Caddy](https://caddyserver.com/) on the VM for automatic TLS:

```bash
sudo apt install -y caddy

# /etc/caddy/Caddyfile
game.yourdomain.com {
    reverse_proxy localhost:80
}
```

Then set `NAKAMA_SSL=true` and `NAKAMA_PUBLIC_HOST=game.yourdomain.com` in `.env` and rebuild the frontend image.

---

## 🧪 Testing Multiplayer

### Two-browser test (quickest)

1. Open **http://localhost:5173** in Chrome tab 1 → enter username `Alice`
2. Open **http://localhost:5173** in Chrome tab 2 (or an Incognito window) → enter username `Bob`
3. In both tabs, click **Find Match** (same mode) → they auto-pair via the matchmaker
4. Make moves alternately — the board updates in real time on both screens

### Direct room join test

1. `Alice` clicks Find Match → is put in a waiting room
2. `Bob` goes to the Lobby → sees the open room in the list → clicks **Join →**
3. Game starts immediately

### Timed mode test

1. Both players select **⏱ Timed (30s)** before clicking Find Match
2. Let the 30-second timer run out — the player whose turn it was forfeits; the other wins

### Disconnect test

1. Start a game between Alice and Bob
2. Close Bob's browser tab
3. Alice's screen should show a "You Win — opponent disconnected" game-over overlay

### API / RPC test with curl

```bash
# Authenticate (device auth)
curl -X POST http://localhost:7350/v2/account/authenticate/device \
  -H "Content-Type: application/json" \
  -u "defaultkey:" \
  -d '{"id":"test-device-001","create":true,"username":"testuser"}'

# Save the token from the response, then:
TOKEN="<your_token_here>"

# Create a match
curl -X POST http://localhost:7350/v2/rpc/create_match \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"mode":"classic"}'

# List open matches
curl -X POST http://localhost:7350/v2/rpc/list_matches \
  -H "Authorization: Bearer $TOKEN" \
  -d '{}'

# Get leaderboard
curl -X POST http://localhost:7350/v2/rpc/get_leaderboard \
  -H "Authorization: Bearer $TOKEN" \
  -d '{}'
```

---

## 📁 Project Structure

```
lila-tictactoe/
├── nakama/
│   ├── src/
│   │   ├── main.ts          # Module init: registers handlers, RPCs, matchmaker hook
│   │   └── tictactoe.ts     # Match handler, game logic, leaderboard helper
│   ├── build/               # Compiled JS bundle (git-ignored, generated by npm run build)
│   │   └── index.js
│   ├── local.yml            # Nakama config overrides
│   ├── package.json
│   ├── rollup.config.mjs    # Bundles TS → single IIFE JS for Nakama runtime
│   └── tsconfig.json
│
├── frontend/
│   ├── src/
│   │   ├── main.tsx         # React entry point
│   │   ├── App.tsx          # Screen router / state machine
│   │   ├── index.css        # Global styles (dark theme, CSS variables)
│   │   ├── nakamaClient.ts  # Nakama singleton, auth helpers, RPC wrappers
│   │   ├── types.ts         # Shared TypeScript types & opcode enum
│   │   └── components/
│   │       ├── Login.tsx        # Username entry screen
│   │       ├── Lobby.tsx        # Mode select, open room list
│   │       ├── Matchmaking.tsx  # Matchmaker queue + socket setup
│   │       ├── Game.tsx         # Board, timer, game-over overlay
│   │       └── Leaderboard.tsx  # Global rankings + personal stats
│   ├── index.html
│   ├── package.json
│   ├── vite.config.ts
│   └── tsconfig.json
│
├── docker-compose.yml           # Local dev (Nakama + CockroachDB + Vite HMR)
├── docker-compose.prod.yml      # Production (builds images, serves on port 80)
├── Dockerfile.nakama            # Nakama image with bundled JS module
├── Dockerfile.frontend          # Nginx image serving Vite build
├── .env.example                 # Environment variable template
└── README.md
```

---

## ⚙️ Configuration Reference

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_NAKAMA_HOST` | `localhost` | Nakama server host for the frontend |
| `VITE_NAKAMA_PORT` | `7350` | Nakama HTTP/WS port |
| `VITE_NAKAMA_SSL` | `false` | Use WSS/HTTPS |
| `VITE_NAKAMA_SERVER_KEY` | `defaultkey` | Must match Nakama's server key |
| `NAKAMA_PUBLIC_HOST` | — | (prod) Public IP/domain |
| `NAKAMA_CONSOLE_PASSWORD` | `changeme` | (prod) Nakama console password |

---

## 🛠 Nakama Version Notes

This project targets **Nakama 3.21** and the **`@heroiclabs/nakama-js` SDK v2.9**. The runtime module is compiled with **rollup** into a single IIFE JS file because Nakama's JavaScript runtime does not support ES modules natively — it uses the Goja JS engine (ES5/ES2015 subset).
