import { useState, useEffect } from "react";
import { Session } from "@heroiclabs/nakama-js";
import { rpcGetLeaderboard, rpcGetMyStats } from "../nakamaClient";
import { LeaderboardRecord } from "../types";

interface Props {
  session:  Session;
  myUserId: string;
  onBack:   () => void;
}

export default function Leaderboard({ session, myUserId, onBack }: Props) {
  const [records,  setRecords]  = useState<LeaderboardRecord[]>([]);
  const [myStats,  setMyStats]  = useState<any>(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [lb, stats] = await Promise.all([
          rpcGetLeaderboard(session),
          rpcGetMyStats(session),
        ]);
        setRecords(lb);
        setMyStats(stats);
      } catch (e: any) {
        setError(e?.message ?? "Failed to load leaderboard.");
      } finally {
        setLoading(false);
      }
    };
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function rankDecoration(rank: number) {
    if (rank === 1) return <span className="lb-gold">🥇</span>;
    if (rank === 2) return <span className="lb-silver">🥈</span>;
    if (rank === 3) return <span className="lb-bronze">🥉</span>;
    return <span className="rank">{rank}</span>;
  }

  const winRate = (r: LeaderboardRecord) => {
    const total = r.numWins + r.numLosses + r.numDraws;
    if (total === 0) return "–";
    return `${Math.round((r.numWins / total) * 100)}%`;
  };

  return (
    <div style={{ paddingTop: "1.5rem" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <div>
          <div className="logo">LILA</div>
          <p className="muted">Global Rankings</p>
        </div>
        <button
          className="btn btn-outline"
          style={{ width: "auto", padding: "0.5rem 0.9rem" }}
          onClick={onBack}
        >
          ← Back
        </button>
      </div>

      {/* My stats card */}
      {myStats && (
        <div className="card" style={{ marginBottom: "1rem" }}>
          <p style={{ fontWeight: 700, marginBottom: "0.75rem" }}>Your Stats</p>
          <div style={{ display: "flex", justifyContent: "space-around", textAlign: "center" }}>
            <div>
              <div style={{ fontSize: "1.6rem", fontWeight: 900, color: "var(--accent)" }}>
                {myStats.numWins}
              </div>
              <div className="muted" style={{ fontSize: "0.8rem" }}>Wins</div>
            </div>
            <div>
              <div style={{ fontSize: "1.6rem", fontWeight: 900, color: "var(--danger)" }}>
                {myStats.numLosses}
              </div>
              <div className="muted" style={{ fontSize: "0.8rem" }}>Losses</div>
            </div>
            <div>
              <div style={{ fontSize: "1.6rem", fontWeight: 900, color: "var(--muted)" }}>
                {myStats.numDraws}
              </div>
              <div className="muted" style={{ fontSize: "0.8rem" }}>Draws</div>
            </div>
            <div>
              <div style={{ fontSize: "1.6rem", fontWeight: 900 }}>
                {myStats.score}
              </div>
              <div className="muted" style={{ fontSize: "0.8rem" }}>Score</div>
            </div>
          </div>
          {myStats.rank && (
            <p className="muted" style={{ textAlign: "center", marginTop: "0.75rem", fontSize: "0.85rem" }}>
              Global rank: <strong style={{ color: "var(--text)" }}>#{myStats.rank}</strong>
            </p>
          )}
        </div>
      )}

      {/* Leaderboard table */}
      <div className="card">
        <p style={{ fontWeight: 700, marginBottom: "1rem" }}>🏆 Top Players</p>

        {loading && (
          <div style={{ textAlign: "center", padding: "1rem" }}>
            <div className="spinner" />
            <p className="muted">Loading…</p>
          </div>
        )}

        {error && (
          <p style={{ color: "var(--danger)", textAlign: "center" }}>{error}</p>
        )}

        {!loading && !error && records.length === 0 && (
          <p className="muted">No records yet — play some games!</p>
        )}

        {!loading && records.length > 0 && (
          <table className="lb-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Player</th>
                <th style={{ textAlign: "right" }}>W</th>
                <th style={{ textAlign: "right" }}>L</th>
                <th style={{ textAlign: "right" }}>D</th>
                <th style={{ textAlign: "right" }}>Win%</th>
                <th style={{ textAlign: "right" }}>Pts</th>
              </tr>
            </thead>
            <tbody>
              {records.map(r => (
                <tr key={r.userId} className={r.userId === myUserId ? "me" : ""}>
                  <td>{rankDecoration(r.rank)}</td>
                  <td style={{ fontWeight: r.userId === myUserId ? 700 : 400 }}>
                    {r.username || "Unknown"}
                    {r.userId === myUserId && (
                      <span style={{ color: "var(--accent)", fontSize: "0.75rem", marginLeft: "0.3rem" }}>(you)</span>
                    )}
                  </td>
                  <td style={{ textAlign: "right", color: "var(--accent)" }}>{r.numWins}</td>
                  <td style={{ textAlign: "right", color: "var(--danger)" }}>{r.numLosses}</td>
                  <td style={{ textAlign: "right", color: "var(--muted)" }}>{r.numDraws}</td>
                  <td style={{ textAlign: "right" }}>{winRate(r)}</td>
                  <td style={{ textAlign: "right", fontWeight: 700 }}>{r.score}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
