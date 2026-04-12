import {
  matchInit,
  matchJoinAttempt,
  matchJoin,
  matchLeave,
  matchLoop,
  matchTerminate,
  matchSignal,
  LEADERBOARD_ID,
} from "./tictactoe";

const MATCH_HANDLER_NAME = "tictactoe";

// ─── RPC: Create a match ─────────────────────────────────────────────────────
// payload: { "mode": "classic" | "timed" }
const rpcCreateMatch: nkruntime.RpcFunction = function (
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  let mode = "classic";
  try {
    const body = JSON.parse(payload);
    if (body.mode === "timed") mode = "timed";
  } catch { /* default to classic */ }

  const matchId = nk.matchCreate(MATCH_HANDLER_NAME, { mode });
  logger.info(`RPC createMatch → ${matchId} (mode=${mode})`);
  return JSON.stringify({ matchId });
};

// ─── RPC: List open matches ──────────────────────────────────────────────────
// payload: { "mode"?: "classic" | "timed" }
const rpcListMatches: nkruntime.RpcFunction = function (
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  let modeFilter: string | undefined;
  try {
    const body = JSON.parse(payload || "{}");
    modeFilter = body.mode;
  } catch { /* no filter */ }

  const matches = nk.matchList(
    10,        // limit
    true,      // authoritative
    undefined, // label filter (we filter manually below)
    0,         // minSize
    1          // maxSize (still has an open slot)
  );

  const filtered = modeFilter
    ? matches.filter(m => {
        try {
          const label = JSON.parse(m.label || "{}");
          return label.mode === modeFilter && label.open;
        } catch { return false; }
      })
    : matches.filter(m => {
        try { return JSON.parse(m.label || "{}").open; } catch { return false; }
      });

  return JSON.stringify({ matches: filtered });
};

// ─── RPC: Get leaderboard ────────────────────────────────────────────────────
const rpcGetLeaderboard: nkruntime.RpcFunction = function (
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  const records = nk.leaderboardRecordsList(
    LEADERBOARD_ID,
    undefined, // ownerIds (none — fetch global top)
    20,        // limit
    undefined, // cursor
    undefined  // expiry
  );

  return JSON.stringify({
    records: (records.records || []).map(r => ({
      rank:       r.rank,
      userId:     r.ownerId,
      username:   r.username,
      score:      r.score,
      numWins:    r.metadata?.wins    ?? 0,
      numLosses:  r.metadata?.losses  ?? 0,
      numDraws:   r.metadata?.draws   ?? 0,
      updateTime: r.updateTime,
    })),
  });
};

// ─── RPC: Get my stats ───────────────────────────────────────────────────────
const rpcGetMyStats: nkruntime.RpcFunction = function (
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  if (!ctx.userId) {
    throw new Error("Not authenticated");
  }

  const records = nk.leaderboardRecordsList(
    LEADERBOARD_ID,
    [ctx.userId],
    1,
    undefined,
    undefined
  );

  const record = records.ownerRecords?.[0] ?? null;

  return JSON.stringify({
    stats: record
      ? {
          rank:      record.rank,
          score:     record.score,
          numWins:   record.metadata?.wins   ?? 0,
          numLosses: record.metadata?.losses ?? 0,
          numDraws:  record.metadata?.draws  ?? 0,
        }
      : { rank: null, score: 0, numWins: 0, numLosses: 0, numDraws: 0 },
  });
};

// ─── Matchmaker Matched Hook ──────────────────────────────────────────────────
// When the matchmaker pairs two players, create a server-authoritative match
// and return its ID so the SDK automatically joins them.
const matchmakerMatched: nkruntime.MatchmakerMatchedFunction = function (
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  matches: nkruntime.MatchmakerResult[]
): string | void {
  const uniqueUsers = new Set(matches.map(m => m.presence.userId));
  if (uniqueUsers.size < 2) {
    logger.warn(`Matchmaker paired ${matches.length} ticket(s) from only ${uniqueUsers.size} user(s) — skipping`);
    return;
  }

  // All players in the same ticket share the same properties
  const mode = (matches[0]?.properties?.["mode"] as string) ?? "classic";
  const matchId = nk.matchCreate(MATCH_HANDLER_NAME, { mode });
  logger.info(`Matchmaker created match ${matchId} for ${matches.length} players`);
  return matchId;
};

// ─── Initialiser ─────────────────────────────────────────────────────────────
function InitModule(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  initializer: nkruntime.Initializer
): void {
  // Register the authoritative match handler
  initializer.registerMatch(MATCH_HANDLER_NAME, {
    matchInit,
    matchJoinAttempt,
    matchJoin,
    matchLeave,
    matchLoop,
    matchTerminate,
    matchSignal,
  });

  // Register RPC endpoints
  initializer.registerRpc("create_match",    rpcCreateMatch);
  initializer.registerRpc("list_matches",    rpcListMatches);
  initializer.registerRpc("get_leaderboard", rpcGetLeaderboard);
  initializer.registerRpc("get_my_stats",    rpcGetMyStats);

  // Register matchmaker hook (fired when 2 players are matched)
  initializer.registerMatchmakerMatched(matchmakerMatched);

  // Create the leaderboard (idempotent — safe to call on every boot)
  try {
    nk.leaderboardCreate(
      LEADERBOARD_ID,
      false,                      // authoritative (server writes only)
      nkruntime.SortOrder.DESCENDING,
      nkruntime.Operator.INCREMENT, // cumulative score
      0,                          // reset schedule (0 = never)
      undefined                   // metadata
    );
    logger.info(`Leaderboard "${LEADERBOARD_ID}" ready`);
  } catch (e: any) {
    logger.warn(`Leaderboard already exists or error: ${e.message}`);
  }

  logger.info("Tic-Tac-Toe module initialised ✓");
}

// Required Nakama exports
// @ts-ignore
!InitModule && InitModule.bind(null);
