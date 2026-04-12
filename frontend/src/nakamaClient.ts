import { Client, Session, Socket } from "@heroiclabs/nakama-js";

const NAKAMA_HOST       = import.meta.env.VITE_NAKAMA_HOST       ?? "localhost";
const NAKAMA_PORT       = import.meta.env.VITE_NAKAMA_PORT       ?? "7350";
const NAKAMA_SSL        = import.meta.env.VITE_NAKAMA_SSL        === "true";
const NAKAMA_SERVER_KEY = import.meta.env.VITE_NAKAMA_SERVER_KEY ?? "defaultkey";

// Singleton client
export const nakamaClient = new Client(
  NAKAMA_SERVER_KEY,
  NAKAMA_HOST,
  NAKAMA_PORT,
  NAKAMA_SSL
);

// ── Auth ──────────────────────────────────────────────────────────────────────

/** Authenticate (or create) a device account and persist the session. */
export async function authenticateDevice(username: string): Promise<Session> {
  // Use a stable device ID based on username + a random suffix stored in localStorage
  let deviceId = localStorage.getItem("deviceId");
  if (!deviceId) {
    deviceId = `device_${Math.random().toString(36).slice(2)}`;
    localStorage.setItem("deviceId", deviceId);
  }

  const session = await nakamaClient.authenticateDevice(deviceId, true, username);

  // Update display name
  await nakamaClient.updateAccount(session, { username, displayName: username });

  // Persist
  localStorage.setItem("nakamaSession", JSON.stringify(session));

  return session;
}

/** Restore a persisted session (may be expired). */
export function restoreSession(): Session | null {
  const raw = localStorage.getItem("nakamaSession");
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw);
    return Session.restore(obj.token, obj.refresh_token);
  } catch {
    return null;
  }
}

export function clearSession(): void {
  localStorage.removeItem("nakamaSession");
}

// ── Socket ────────────────────────────────────────────────────────────────────

export function createSocket(): Socket {
  return nakamaClient.createSocket(NAKAMA_SSL);
}

// ── Matchmaking ───────────────────────────────────────────────────────────────

export async function joinMatchmaker(
  socket: Socket,
  mode: "classic" | "timed"
): Promise<string> {
  const ticket = await socket.addMatchmaker(
    "*",              // query (any)
    2,                // minCount
    2,                // maxCount
    { mode }          // string properties (sent to matchmakerMatched hook)
  );
  return ticket.ticket;
}

export async function cancelMatchmaker(socket: Socket, ticket: string): Promise<void> {
  await socket.removeMatchmaker(ticket);
}

// ── RPC helpers ───────────────────────────────────────────────────────────────

export async function rpcCreateMatch(
  session: Session,
  mode: "classic" | "timed"
): Promise<string> {
  const res = await nakamaClient.rpcFunc(session, "create_match", JSON.stringify({ mode }));
  const body = JSON.parse(res.payload ?? "{}");
  return body.matchId as string;
}

export async function rpcListMatches(
  session: Session,
  mode?: "classic" | "timed"
): Promise<any[]> {
  const res = await nakamaClient.rpcFunc(
    session,
    "list_matches",
    JSON.stringify(mode ? { mode } : {})
  );
  const body = JSON.parse(res.payload ?? "{}");
  return body.matches ?? [];
}

export async function rpcGetLeaderboard(session: Session): Promise<any[]> {
  const res = await nakamaClient.rpcFunc(session, "get_leaderboard", "{}");
  const body = JSON.parse(res.payload ?? "{}");
  return body.records ?? [];
}

export async function rpcGetMyStats(session: Session): Promise<any> {
  const res = await nakamaClient.rpcFunc(session, "get_my_stats", "{}");
  const body = JSON.parse(res.payload ?? "{}");
  return body.stats;
}
