import { useState, useEffect, useRef, useCallback } from "react";
import { Session, Socket } from "@heroiclabs/nakama-js";
import { createSocket } from "../nakamaClient";
import { OpCode, GameState, GameOverPayload, Mark } from "../types";

interface Props {
  session:  Session;
  matchId:  string;
  username: string;
  onBack:   () => void;
  onLeaderboard: () => void;
}

type Phase = "connecting" | "waiting" | "playing" | "over";

export default function Game({ session, matchId, username, onBack, onLeaderboard }: Props) {
  const socketRef = useRef<Socket | null>(null);

  const [phase,       setPhase]       = useState<Phase>("connecting");
  const [gameState,   setGameState]   = useState<GameState | null>(null);
  const [overPayload, setOverPayload] = useState<GameOverPayload | null>(null);
  const [timer,       setTimer]       = useState<number | null>(null);
  const [error,       setError]       = useState<string | null>(null);

  const myId = session.user_id!;

  // ── Connect & join match ─────────────────────────────────────────────────────
  useEffect(() => {
    let mounted = true;

    const connect = async () => {
      try {
        const socket = createSocket();
        socketRef.current = socket;

        await socket.connect(session, false);

        // ── Message handler ──────────────────────────────────────────────────
        socket.onmatchdata = (data) => {
          if (!mounted) return;
          const payload = data.data
            ? JSON.parse(new TextDecoder().decode(data.data))
            : {};

          switch (data.op_code) {
            case OpCode.WAITING:
              setPhase("waiting");
              break;

            case OpCode.GAME_STATE:
              setGameState(payload as GameState);
              if ((payload as GameState).ready) setPhase("playing");
              if ((payload as GameState).turnTimerS !== null) {
                setTimer((payload as GameState).turnTimerS);
              }
              break;

            case OpCode.GAME_OVER:
              setOverPayload(payload as GameOverPayload);
              setPhase("over");
              break;

            case OpCode.TIMER_TICK:
              setTimer(payload.secondsLeft as number);
              break;

            case OpCode.ERROR:
              setError(payload.message ?? "Server error");
              break;
          }
        };

        socket.onmatchpresence = () => { /* presence handled server-side */ };

        socket.ondisconnect = () => {
          if (mounted) setError("Disconnected from server.");
        };

        await socket.joinMatch(matchId);
        if (mounted) setPhase("waiting");

      } catch (e: any) {
        if (mounted) {
          setError(e?.message ?? "Failed to join match.");
          setPhase("over");
        }
      }
    };

    connect();

    return () => {
      mounted = false;
      socketRef.current?.leaveMatch(matchId).catch(() => {});
      socketRef.current?.disconnect(false);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Make a move ──────────────────────────────────────────────────────────────
  const makeMove = useCallback((position: number) => {
    if (!socketRef.current || !gameState) return;
    if (gameState.currentTurn !== myId) return;
    if (gameState.board[position] !== "") return;

    const payload = new TextEncoder().encode(JSON.stringify({ position }));
    socketRef.current.sendMatchState(matchId, OpCode.MAKE_MOVE, payload);
  }, [gameState, matchId, myId]);

  // ── Render helpers ────────────────────────────────────────────────────────────
  const myMark     = gameState?.marks?.[myId] as Mark | undefined;
  const theirId    = gameState
    ? Object.keys(gameState.marks).find(id => id !== myId)
    : undefined;
  const theirMark  = theirId ? gameState!.marks[theirId] as Mark : undefined;
  const myTurn     = gameState?.currentTurn === myId && !gameState?.gameOver;
  const isWinLine  = (i: number) => gameState?.winLine?.includes(i) ?? false;

  function renderCell(cell: Mark, i: number) {
    const classNames = [
      "cell",
      cell ? "taken" : "",
      !myTurn || cell ? "disabled" : "",
      cell === "X" ? "X" : cell === "O" ? "O" : "",
      isWinLine(i) ? "winner-cell" : "",
    ].filter(Boolean).join(" ");

    return (
      <div
        key={i}
        className={classNames}
        onClick={() => makeMove(i)}
      >
        {cell || ""}
      </div>
    );
  }

  const theirName = theirId ? (gameState?.marks ? `Opponent` : "?") : "Waiting…";

  // ── Winner display logic ─────────────────────────────────────────────────────
  function getOverTitle(): string {
    if (!overPayload) return "";
    if (overPayload.reason === "draw") return "It's a Draw!";
    if (overPayload.winner === myId) return "You Win! 🎉";
    return "You Lose 😞";
  }

  function getOverSub(): string {
    if (!overPayload) return "";
    if (overPayload.reason === "timeout")               return "Opponent ran out of time.";
    if (overPayload.reason === "opponent_disconnected") return "Opponent disconnected.";
    if (overPayload.reason === "draw")                  return "No winner this time.";
    return "";
  }

  // ── Connecting / error state ──────────────────────────────────────────────────
  if (phase === "connecting") {
    return (
      <div style={{ paddingTop: "3rem", textAlign: "center" }}>
        <div className="spinner" />
        <p className="muted">Connecting…</p>
      </div>
    );
  }

  if (error && phase !== "playing") {
    return (
      <div style={{ paddingTop: "3rem" }}>
        <div className="card" style={{ textAlign: "center" }}>
          <p style={{ color: "var(--danger)", marginBottom: "1rem" }}>{error}</p>
          <button className="btn btn-outline" onClick={onBack}>← Back to Lobby</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ paddingTop: "1.5rem" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <div className="logo">LILA</div>
        <button className="btn btn-outline" style={{ width: "auto", padding: "0.5rem 0.9rem" }} onClick={onBack}>
          ✕
        </button>
      </div>

      {/* Waiting state */}
      {phase === "waiting" && (
        <div className="card" style={{ textAlign: "center" }}>
          <div className="spinner" />
          <p style={{ fontWeight: 600, marginBottom: "0.25rem" }}>Finding a random player…</p>
          <p className="muted" style={{ fontSize: "0.85rem" }}>It usually takes 20 seconds.</p>
          <button className="btn btn-outline" style={{ marginTop: "1.25rem" }} onClick={onBack}>
            Cancel
          </button>
        </div>
      )}

      {/* Game */}
      {(phase === "playing" || phase === "over") && gameState && (
        <>
          {/* Player chips */}
          <div className="player-bar">
            <div className={`player-chip ${myMark} ${gameState.currentTurn === myId ? "active" : ""}`}>
              <div className="chip-mark">{myMark}</div>
              <div className="chip-name">{username} (you)</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", color: "var(--muted)", fontWeight: 700, padding: "0 0.25rem" }}>
              vs
            </div>
            <div className={`player-chip ${theirMark} ${theirId && gameState.currentTurn === theirId ? "active" : ""}`}>
              <div className="chip-mark">{theirMark ?? "?"}</div>
              <div className="chip-name">{theirName}</div>
            </div>
          </div>

          {/* Timer */}
          {timer !== null && (
            <div className={`timer ${timer <= 10 ? "urgent" : ""}`}>
              ⏱ {timer}s
            </div>
          )}

          {/* Status */}
          {!gameState.gameOver && (
            <div className="status-banner">
              {myTurn ? "Your turn" : "Opponent's turn…"}
            </div>
          )}

          {/* Board */}
          <div className="board">
            {gameState.board.map((cell, i) => renderCell(cell, i))}
          </div>

          {/* Error toast */}
          {error && (
            <p style={{ color: "var(--danger)", textAlign: "center", fontSize: "0.875rem" }}>
              {error}
            </p>
          )}
        </>
      )}

      {/* Game over overlay */}
      {phase === "over" && overPayload && (
        <div className="game-over-overlay">
          <div className="game-over-card">
            <div className="game-over-mark">
              {overPayload.reason === "draw"
                ? "🤝"
                : overPayload.winner === myId
                  ? "🏆"
                  : "💀"}
            </div>
            <div
              className="game-over-title"
              style={{
                color: overPayload.reason === "draw"
                  ? "var(--text)"
                  : overPayload.winner === myId
                    ? "var(--accent)"
                    : "var(--danger)",
              }}
            >
              {getOverTitle()}
            </div>
            <p className="game-over-sub">{getOverSub()}</p>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              <button className="btn btn-primary" onClick={onBack}>
                Play Again
              </button>
              <button className="btn btn-outline" onClick={onLeaderboard}>
                🏆 Leaderboard
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
