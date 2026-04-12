import { useState } from "react";
import { Session } from "@heroiclabs/nakama-js";
import { authenticateDevice } from "../nakamaClient";

interface Props {
  onLogin: (session: Session) => void;
}

export default function Login({ onLogin }: Props) {
  const [username, setUsername] = useState("");
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  const handleSubmit = async () => {
    const name = username.trim();
    if (!name || name.length < 2) {
      setError("Username must be at least 2 characters.");
      return;
    }
    if (name.length > 20) {
      setError("Username must be under 20 characters.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const session = await authenticateDevice(name);
      onLogin(session);
    } catch (e: any) {
      setError(e?.message ?? "Failed to connect. Is Nakama running?");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", minHeight: "100dvh" }}>
      <div className="card">
        <div className="logo" style={{ marginBottom: "0.25rem" }}>LILA</div>
        <p className="muted" style={{ marginBottom: "2rem" }}>Multiplayer Tic-Tac-Toe</p>

        <p className="screen-title">Who are you?</p>
        <p className="muted" style={{ marginBottom: "1.25rem" }}>Enter a nickname to get started.</p>

        <input
          className="input"
          style={{ marginBottom: "0.75rem" }}
          placeholder="Nickname"
          value={username}
          maxLength={20}
          onChange={e => setUsername(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleSubmit()}
          autoFocus
        />

        {error && (
          <p style={{ color: "var(--danger)", fontSize: "0.875rem", marginBottom: "0.75rem" }}>
            {error}
          </p>
        )}

        <button
          className="btn btn-primary"
          onClick={handleSubmit}
          disabled={loading}
        >
          {loading ? "Connecting…" : "Continue →"}
        </button>
      </div>
    </div>
  );
}
