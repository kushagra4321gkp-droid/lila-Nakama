import { useState, useEffect } from "react";
import { Session, Socket } from "@heroiclabs/nakama-js";

import { restoreSession, clearSession } from "./nakamaClient";
import { Screen, GameMode } from "./types";

import Login       from "./components/Login";
import Lobby       from "./components/Lobby";
import Matchmaking from "./components/Matchmaking";
import Game        from "./components/Game";
import Leaderboard from "./components/Leaderboard";

export default function App() {
  const [screen,   setScreen]   = useState<Screen>("login");
  const [session,  setSession]  = useState<Session | null>(null);
  const [username, setUsername] = useState("");
  const [matchId,  setMatchId]  = useState<string | null>(null);
  const [gameMode, setGameMode] = useState<GameMode>("classic");

  // Socket shared between Matchmaking → Game (so Game reuses the same connection)
  const [sharedSocket, setSharedSocket] = useState<Socket | null>(null);

  // Try to restore a previous session on first load
  useEffect(() => {
    const saved = restoreSession();
    if (saved && !saved.isexpired(Date.now() / 1000)) {
      setSession(saved);
      setUsername(saved.username ?? "Player");
      setScreen("lobby");
    }
  }, []);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleLogin = (sess: Session) => {
    setSession(sess);
    setUsername(sess.username ?? "Player");
    setScreen("lobby");
  };

  const handleLogout = () => {
    clearSession();
    setSession(null);
    setScreen("login");
  };

  // Matchmaker flow
  const handleFindMatch = (mode: GameMode) => {
    setGameMode(mode);
    setScreen("matchmaking");
  };

  // Direct join (from open rooms list)
  const handleJoinMatch = (id: string) => {
    setMatchId(id);
    setSharedSocket(null); // Game will create its own socket
    setScreen("game");
  };

  // Matchmaker found a match and already has a socket
  const handleMatchmakerMatched = (id: string, socket: Socket) => {
    setMatchId(id);
    setSharedSocket(socket);
    setScreen("game");
  };

  const handleGameBack = () => {
    setMatchId(null);
    setSharedSocket(null);
    setScreen("lobby");
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (screen === "login" || !session) {
    return <Login onLogin={handleLogin} />;
  }

  if (screen === "lobby") {
    return (
      <Lobby
        session={session}
        username={username}
        onFindMatch={handleFindMatch}
        onJoinMatch={handleJoinMatch}
        onLeaderboard={() => setScreen("leaderboard")}
        onLogout={handleLogout}
      />
    );
  }

  if (screen === "matchmaking") {
    return (
      <Matchmaking
        session={session}
        mode={gameMode}
        onMatched={handleMatchmakerMatched}
        onCancel={() => setScreen("lobby")}
      />
    );
  }

  if (screen === "game" && matchId) {
    return (
      <Game
        session={session}
        matchId={matchId}
        username={username}
        onBack={handleGameBack}
        onLeaderboard={() => setScreen("leaderboard")}
      />
    );
  }

  if (screen === "leaderboard") {
    return (
      <Leaderboard
        session={session}
        myUserId={session.user_id ?? ""}
        onBack={() => setScreen("lobby")}
      />
    );
  }

  return null;
}
