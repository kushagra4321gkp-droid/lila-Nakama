import { Client, Session, Socket } from "@heroiclabs/nakama-js";

const NAKAMA_HOST       = import.meta.env.VITE_NAKAMA_HOST       ?? "localhost";
const NAKAMA_PORT       = import.meta.env.VITE_NAKAMA_PORT       ?? "7350";
const NAKAMA_SSL        = import.meta.env.VITE_NAKAMA_SSL        === "true";
const NAKAMA_SERVER_KEY = import.meta.env.VITE_NAKAMA_SERVER_KEY ?? "defaultkey";

export const nakamaClient = new Client(NAKAMA_SERVER_KEY, NAKAMA_HOST, NAKAMA_PORT, NAKAMA_SSL);

function randomId(): string {
  return `dev_${Math.random().toString(36).slice(2)}${Date.now()}`;
}

export async function authenticateDevice(username: string): Promise<Session> {
  let deviceId = "";
  try { deviceId = localStorage.getItem("deviceId") || ""; } catch { }
  if (!deviceId) {
    deviceId = randomId();
    try { localStorage.setItem("deviceId", deviceId); } catch { }
  }

  const session = await nakamaClient.authenticateDevice(deviceId, true);

  try {
    await nakamaClient.updateAccount(session, { username, display_name: username });
  } catch {
    try {
      const fallback = `${username}${Math.random().toString(36).slice(2, 5)}`;
      await nakamaClient.updateAccount(session, { username: fallback, display_name: username });
    } catch { }
  }

  try { localStorage.setItem("nakamaSession", JSON.stringify(session)); } catch { }
  return session;
}

export function restoreSession(): Session | null {
  try {
    const raw = localStorage.getItem("nakamaSession");
    if (!raw) return null;
    const obj = JSON.parse(raw);
    return Session.restore(obj.token, obj.refresh_token);
  } catch { return null; }
}

export function clearSession(): void {
  try { localStorage.removeItem("nakamaSession"); } catch { }
}

export function createSocket(): Socket {
  return nakamaClient.createSocket(NAKAMA_SSL);
}

export async function joinMatchmaker(socket: Socket, mode: "classic" | "timed"): Promise<string> {
  const ticket = await socket.addMatchmaker("*", 2, 2, { mode });
  return ticket.ticket;
}

export async function cancelMatchmaker(socket: Socket, ticket: string): Promise<void> {
  await socket.removeMatchmaker(ticket);
}

export async function rpcCreateMatch(session: Session, mode: "classic" | "timed"): Promise<string> {
  const res = await nakamaClient.rpc(session, "create_match", JSON.stringify({ mode }));
  const d1 = typeof res.payload === 'string' ? JSON.parse(res.payload) : (res.payload ?? {});
  return d1.matchId as string;
}

export async function rpcListMatches(session: Session, mode?: "classic" | "timed"): Promise<any[]> {
  // Use SDK's built-in listMatches — no RPC needed, works more reliably
  const result = await nakamaClient.listMatches(session, 20, true, undefined, 0, 1);
  const matches = result.matches ?? [];
  if (!mode) return matches;
  return matches.filter((m: any) => {
    try { return JSON.parse(m.label || "{}").mode === mode; } catch { return true; }
  });
}

export async function rpcGetLeaderboard(session: Session): Promise<any[]> {
  const res = await nakamaClient.rpc(session, "get_leaderboard", {} as object);
  const d3 = typeof res.payload === 'string' ? JSON.parse(res.payload) : (res.payload ?? {});
  return d3.records ?? [];
}

export async function rpcGetMyStats(session: Session): Promise<any> {
  const res = await nakamaClient.rpc(session, "get_my_stats", {} as object);
  const d4 = typeof res.payload === 'string' ? JSON.parse(res.payload) : (res.payload ?? {});
  return d4.stats;
}
