import { useState, useEffect, useRef } from "react";
import { Session, Socket } from "@heroiclabs/nakama-js";
import { createSocket, joinMatchmaker, cancelMatchmaker } from "../nakamaClient";
import { GameMode } from "../types";

interface Props {
  session:    Session;
  mode:       GameMode;
  onMatched:  (matchId: string, socket: Socket) => void;
  onCancel:   () => void;
}

export default function Matchmaking({ session, mode, onMatched, onCancel }: Props) {
  const [status,   setStatus]   = useState("Connecting…");
  const [elapsed,  setElapsed]  = useState(0);
  const [error,    setError]    = useState<string | null>(null);

  const socketRef  = useRef<Socket | null>(null);
  const ticketRef  = useRef<string | null>(null);
  const timerRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    const start = async () => {
      try {
        const socket = createSocket();
        socketRef.current = socket;

        await socket.connect(session, false);

        // When matchmaker pairs us, we get an event with the match token
        socket.onmatchmakermatched = async (matched) => {
          if (!mountedRef.current) return;
          setStatus("Match found! Joining…");

          try {
            // Join the match the server created for us
            await socket.joinMatch(matched.match_id ?? "", matched.token);
            if (mountedRef.current) {
              onMatched(matched.match_id ?? "", socket);
            }
          } catch (e: any) {
            if (mountedRef.current) setError(e?.message ?? "Failed to join matched game.");
          }
        };

        socket.ondisconnect = () => {
          if (mountedRef.current) setError("Disconnected. Please try again.");
        };

        // Add to matchmaker queue
        const ticket = await joinMatchmaker(socket, mode);
        ticketRef.current = ticket;

        if (mountedRef.current) setStatus("Finding a random player…");

        // Elapsed-time counter
        timerRef.current = setInterval(() => {
          setElapsed(s => s + 1);
        }, 1000);

      } catch (e: any) {
        if (mountedRef.current) setError(e?.message ?? "Matchmaking failed.");
      }
    };

    start();

    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearInterval(timerRef.current);
      // Cancel matchmaker ticket on unmount
      if (socketRef.current && ticketRef.current) {
        cancelMatchmaker(socketRef.current, ticketRef.current).catch(() => {});
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCancel = async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (socketRef.current && ticketRef.current) {
      await cancelMatchmaker(socketRef.current, ticketRef.current).catch(() => {});
      socketRef.current.disconnect(false);
    }
    onCancel();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", minHeight: "60dvh" }}>
      <div className="card" style={{ textAlign: "center" }}>
        {error ? (
          <>
            <p style={{ color: "var(--danger)", marginBottom: "1rem" }}>{error}</p>
            <button className="btn btn-outline" onClick={onCancel}>← Back to Lobby</button>
          </>
        ) : (
          <>
            <div className="spinner" />
            <p style={{ fontWeight: 600, marginBottom: "0.25rem" }}>{status}</p>
            <p className="muted" style={{ fontSize: "0.85rem", marginBottom: "1.25rem" }}>
              {elapsed > 0 ? `${elapsed}s elapsed…` : "It usually takes about 20 seconds."}
            </p>
            <div style={{ marginBottom: "1rem" }}>
              <span className={`mode-badge ${mode}`}>
                {mode === "timed" ? "⏱ Timed Mode" : "Classic Mode"}
              </span>
            </div>
            <button className="btn btn-outline" onClick={handleCancel}>
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
  );
}
