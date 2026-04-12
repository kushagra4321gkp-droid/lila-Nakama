import { useState, useEffect } from "react";
import { Session } from "@heroiclabs/nakama-js";
import { rpcListMatches } from "../nakamaClient";
import { GameMode } from "../types";

interface Props {
  session:         Session;
  username:        string;
  onFindMatch:     (mode: GameMode) => void;
  onJoinMatch:     (matchId: string) => void;
  onLeaderboard:   () => void;
  onLogout:        () => void;
}

interface MatchEntry {
  matchId:     string;
  label:       { mode: string; playerCount: number };
  size:        number;
}

export default function Lobby({ session, username, onFindMatch, onJoinMatch, onLeaderboard, onLogout }: Props) {
  const [openMatches, setOpenMatches] = useState<MatchEntry[]>([]);
  const [refreshing,  setRefreshing]  = useState(false);
  const [mode,        setMode]        = useState<GameMode>("classic");

  const loadMatches = async () => {
    setRefreshing(true);
    try {
      const raw = await rpcListMatches(session);
      const mapped: MatchEntry[] = raw.map((m: any) => ({
        matchId: m.match_id ?? m.matchId,
        label:   JSON.parse(m.label ?? "{}"),
        size:    m.size ?? 0,
      }));
      setOpenMatches(mapped);
    } catch { /* ignore */ }
    setRefreshing(false);
  };

  useEffect(() => {
    loadMatches();
    const interval = setInterval(loadMatches, 5000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ paddingTop: "1.5rem" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <div>
          <div className="logo">LILA</div>
          <p className="muted">Hey, <strong style={{ color: "var(--text)" }}>{username}</strong>!</p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button className="btn btn-outline" style={{ width: "auto", padding: "0.5rem 0.9rem" }} onClick={onLeaderboard}>
            🏆
          </button>
          <button className="btn btn-outline" style={{ width: "auto", padding: "0.5rem 0.9rem" }} onClick={onLogout}>
            ↩
          </button>
        </div>
      </div>

      {/* Mode selector */}
      <div className="card" style={{ marginBottom: "1rem" }}>
        <p className="screen-title" style={{ marginBottom: "1rem" }}>Game Mode</p>
        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.25rem" }}>
          <button
            className={`btn ${mode === "classic" ? "btn-primary" : "btn-outline"}`}
            onClick={() => setMode("classic")}
            style={{ flex: 1 }}
          >
            Classic
          </button>
          <button
            className={`btn ${mode === "timed" ? "btn-purple" : "btn-outline"}`}
            onClick={() => setMode("timed")}
            style={{ flex: 1 }}
          >
            ⏱ Timed (30s)
          </button>
        </div>

        <button
          className={`btn ${mode === "timed" ? "btn-purple" : "btn-primary"}`}
          onClick={() => onFindMatch(mode)}
        >
          🎮 Find Match
        </button>
      </div>

      {/* Open rooms */}
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
          <p className="screen-title" style={{ marginBottom: 0 }}>Open Rooms</p>
          <button
            className="btn btn-outline"
            style={{ width: "auto", padding: "0.4rem 0.8rem", fontSize: "0.85rem" }}
            onClick={loadMatches}
            disabled={refreshing}
          >
            {refreshing ? "…" : "↻ Refresh"}
          </button>
        </div>

        {openMatches.length === 0 ? (
          <p className="muted">No open rooms right now. Start one by finding a match!</p>
        ) : (
          <div className="match-list">
            {openMatches.map(m => (
              <div key={m.matchId} className="match-item">
                <div>
                  <span className={`mode-badge ${m.label.mode ?? "classic"}`}>
                    {m.label.mode === "timed" ? "⏱ Timed" : "Classic"}
                  </span>
                  <p className="muted" style={{ marginTop: "0.25rem", fontSize: "0.8rem" }}>
                    {m.label.playerCount ?? m.size}/2 players
                  </p>
                </div>
                <button
                  className="btn btn-outline"
                  style={{ width: "auto", padding: "0.5rem 1rem", fontSize: "0.85rem" }}
                  onClick={() => onJoinMatch(m.matchId)}
                >
                  Join →
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
