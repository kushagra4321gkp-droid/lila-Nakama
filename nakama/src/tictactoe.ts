// ─── Opcodes (client ↔ server message types) ────────────────────────────────
const enum OpCode {
  MAKE_MOVE    = 1,   // client → server
  GAME_STATE   = 2,   // server → client  (board update)
  GAME_OVER    = 3,   // server → client
  WAITING      = 4,   // server → client  (waiting for opponent)
  TIMER_TICK   = 5,   // server → client  (countdown)
  ERROR        = 6,   // server → client
}

// ─── Types ───────────────────────────────────────────────────────────────────
interface MatchLabel {
  mode: "classic" | "timed";
  open: boolean;        // accepting new players?
  playerCount: number;
}

interface MatchState {
  // players
  presences: { [userId: string]: nkruntime.Presence };
  marks:     { [userId: string]: "X" | "O" };  // userId → mark
  turnOrder: string[];                          // [userId of X, userId of O]

  // board
  board: Array<"" | "X" | "O">;  // indices 0-8

  // game flow
  currentTurn: string;  // userId whose turn it is
  gameOver:    boolean;
  winner:      string | null;   // userId, or null for draw
  winLine:     number[] | null; // winning cell indices

  // timer-based mode
  timedMode:      boolean;
  ticksPerSecond: number;
  turnTimerTicks: number;   // ticks remaining for current turn
  turnTimeLimitS: number;   // seconds per turn (30)

  // stats accumulation (written to leaderboard on game over)
  ready: boolean;  // true once 2 players have joined
}

// ─── Helpers ────────────────────────────────────────────────────────────────
const WIN_LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
  [0, 3, 6], [1, 4, 7], [2, 5, 8], // cols
  [0, 4, 8], [2, 4, 6],            // diagonals
];

function checkWinner(board: Array<"" | "X" | "O">): { winner: "X" | "O" | null; line: number[] | null } {
  for (const line of WIN_LINES) {
    const [a, b, c] = line;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return { winner: board[a] as "X" | "O", line };
    }
  }
  return { winner: null, line: null };
}

function isDraw(board: Array<"" | "X" | "O">): boolean {
  return board.every(cell => cell !== "");
}

function buildLabel(state: MatchState): string {
  const label: MatchLabel = {
    mode: state.timedMode ? "timed" : "classic",
    open: Object.keys(state.presences).length < 2,
    playerCount: Object.keys(state.presences).length,
  };
  return JSON.stringify(label);
}

function sendState(dispatcher: nkruntime.MatchDispatcher, state: MatchState): void {
  const payload = {
    board:        state.board,
    marks:        state.marks,
    currentTurn:  state.currentTurn,
    gameOver:     state.gameOver,
    winner:       state.winner,
    winLine:      state.winLine,
    ready:        state.ready,
    turnTimerS:   state.timedMode
      ? Math.ceil(state.turnTimerTicks / state.ticksPerSecond)
      : null,
  };
  dispatcher.broadcastMessage(OpCode.GAME_STATE, JSON.stringify(payload));
}

// ─── Match Handler ──────────────────────────────────────────────────────────
const matchInit: nkruntime.MatchInitFunction = function (
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  params: { [key: string]: string }
): { state: MatchState; tickRate: number; label: string } {
  const timedMode = params["mode"] === "timed";
  const ticksPerSecond = 10; // Nakama tick rate

  const state: MatchState = {
    presences:      {},
    marks:          {},
    turnOrder:      [],
    board:          ["", "", "", "", "", "", "", "", ""],
    currentTurn:    "",
    gameOver:       false,
    winner:         null,
    winLine:        null,
    timedMode,
    ticksPerSecond,
    turnTimerTicks: 30 * ticksPerSecond,
    turnTimeLimitS: 30,
    ready:          false,
  };

  logger.info(`Match initialised — mode: ${timedMode ? "timed" : "classic"}`);

  return {
    state,
    tickRate: ticksPerSecond,
    label: buildLabel(state),
  };
};

const matchJoinAttempt: nkruntime.MatchJoinAttemptFunction = function (
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  dispatcher: nkruntime.MatchDispatcher,
  tick: number,
  state: MatchState,
  presence: nkruntime.Presence,
  metadata: { [key: string]: any }
): { state: MatchState; accept: boolean; rejectMessage?: string } | null {
  // Reject if game already has 2 players and this user is not reconnecting
  const playerCount = Object.keys(state.presences).length;
  if (playerCount >= 2 && !state.presences[presence.userId]) {
    return { state, accept: false, rejectMessage: "Match is full." };
  }
  if (state.gameOver) {
    return { state, accept: false, rejectMessage: "Match has ended." };
  }
  return { state, accept: true };
};

const matchJoin: nkruntime.MatchJoinFunction = function (
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  dispatcher: nkruntime.MatchDispatcher,
  tick: number,
  state: MatchState,
  presences: nkruntime.Presence[]
): { state: MatchState } | null {
  for (const presence of presences) {
    state.presences[presence.userId] = presence;

    if (!state.marks[presence.userId]) {
      // First joiner gets X, second gets O
      const existingMarks = Object.values(state.marks);
      const mark: "X" | "O" = existingMarks.includes("X") ? "O" : "X";
      state.marks[presence.userId] = mark;

      if (mark === "X") {
        state.turnOrder.unshift(presence.userId);
      } else {
        state.turnOrder.push(presence.userId);
      }
    }

    logger.info(`Player joined: ${presence.userId} (${state.marks[presence.userId]})`);
  }

  const playerCount = Object.keys(state.presences).length;
  if (playerCount === 2 && !state.ready) {
    // Both players in — start game
    state.ready = true;
    state.currentTurn = state.turnOrder[0]; // X goes first
    state.turnTimerTicks = state.turnTimeLimitS * state.ticksPerSecond;
    logger.info("Both players ready — game starting");
  } else {
    // Still waiting
    dispatcher.broadcastMessage(
      OpCode.WAITING,
      JSON.stringify({ message: "Waiting for opponent…" })
    );
  }

  dispatcher.matchLabelUpdate(buildLabel(state));
  sendState(dispatcher, state);

  return { state };
};

const matchLeave: nkruntime.MatchLeaveFunction = function (
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  dispatcher: nkruntime.MatchDispatcher,
  tick: number,
  state: MatchState,
  presences: nkruntime.Presence[]
): { state: MatchState } | null {
  for (const presence of presences) {
    logger.info(`Player left: ${presence.userId}`);
    delete state.presences[presence.userId];
  }

  if (!state.gameOver && state.ready) {
    // A player disconnected mid-game → the remaining player wins
    const remaining = Object.keys(state.presences);
    if (remaining.length === 1) {
      state.gameOver = true;
      state.winner = remaining[0];

      const payload = {
        winner:      state.winner,
        winnerMark:  state.marks[state.winner],
        reason:      "opponent_disconnected",
        board:       state.board,
      };
      dispatcher.broadcastMessage(OpCode.GAME_OVER, JSON.stringify(payload));

      recordLeaderboard(nk, logger, state);
    }
  }

  dispatcher.matchLabelUpdate(buildLabel(state));
  return { state };
};

const matchLoop: nkruntime.MatchLoopFunction = function (
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  dispatcher: nkruntime.MatchDispatcher,
  tick: number,
  state: MatchState,
  messages: nkruntime.MatchMessage[]
): { state: MatchState } | null {
  // No players left → terminate match
  if (Object.keys(state.presences).length === 0) {
    logger.info("All players gone — terminating match");
    return null;
  }

  if (state.gameOver) return { state };

  // ── Process incoming messages ──────────────────────────────────────────────
  for (const msg of messages) {
    if (msg.opCode !== OpCode.MAKE_MOVE) continue;
    if (!state.ready) continue;

    // Only the current-turn player can move
    if (msg.sender.userId !== state.currentTurn) {
      dispatcher.broadcastMessage(
        OpCode.ERROR,
        JSON.stringify({ message: "Not your turn." }),
        [msg.sender]
      );
      continue;
    }

    let data: { position: number };
    try {
      data = JSON.parse(nk.binaryToString(msg.data));
    } catch {
      dispatcher.broadcastMessage(
        OpCode.ERROR,
        JSON.stringify({ message: "Invalid message format." }),
        [msg.sender]
      );
      continue;
    }

    const pos = data.position;
    if (typeof pos !== "number" || pos < 0 || pos > 8 || state.board[pos] !== "") {
      dispatcher.broadcastMessage(
        OpCode.ERROR,
        JSON.stringify({ message: "Invalid move." }),
        [msg.sender]
      );
      continue;
    }

    // Apply move
    state.board[pos] = state.marks[msg.sender.userId];
    state.turnTimerTicks = state.turnTimeLimitS * state.ticksPerSecond; // reset timer

    // Check outcome
    const { winner: winMark, line } = checkWinner(state.board);
    if (winMark) {
      // Find userId of the winner by mark
      const winnerUserId = Object.entries(state.marks).find(
        ([, mark]) => mark === winMark
      )![0];
      state.gameOver = true;
      state.winner = winnerUserId;
      state.winLine = line;

      sendState(dispatcher, state);
      dispatcher.broadcastMessage(
        OpCode.GAME_OVER,
        JSON.stringify({
          winner:     winnerUserId,
          winnerMark: winMark,
          winLine:    line,
          reason:     "win",
          board:      state.board,
        })
      );
      recordLeaderboard(nk, logger, state);
    } else if (isDraw(state.board)) {
      state.gameOver = true;
      state.winner = null;

      sendState(dispatcher, state);
      dispatcher.broadcastMessage(
        OpCode.GAME_OVER,
        JSON.stringify({ winner: null, reason: "draw", board: state.board })
      );
      recordLeaderboard(nk, logger, state);
    } else {
      // Advance turn
      state.currentTurn = state.turnOrder.find(id => id !== msg.sender.userId)!;
      sendState(dispatcher, state);
    }
  }

  // ── Timer tick (timed mode only) ───────────────────────────────────────────
  if (state.timedMode && state.ready && !state.gameOver) {
    state.turnTimerTicks--;

    // Broadcast timer every second
    if (state.turnTimerTicks % state.ticksPerSecond === 0) {
      const secondsLeft = state.turnTimerTicks / state.ticksPerSecond;
      dispatcher.broadcastMessage(
        OpCode.TIMER_TICK,
        JSON.stringify({ secondsLeft, turn: state.currentTurn })
      );
    }

    // Time expired → forfeit
    if (state.turnTimerTicks <= 0) {
      const loser = state.currentTurn;
      const winner = state.turnOrder.find(id => id !== loser)!;

      state.gameOver = true;
      state.winner = winner;

      sendState(dispatcher, state);
      dispatcher.broadcastMessage(
        OpCode.GAME_OVER,
        JSON.stringify({
          winner,
          winnerMark: state.marks[winner],
          reason:     "timeout",
          loser,
          board:      state.board,
        })
      );
      recordLeaderboard(nk, logger, state);
    }
  }

  return { state };
};

const matchTerminate: nkruntime.MatchTerminateFunction = function (
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  dispatcher: nkruntime.MatchDispatcher,
  tick: number,
  state: MatchState,
  graceSeconds: number
): { state: MatchState } | null {
  logger.info("Match terminating");
  dispatcher.broadcastMessage(
    OpCode.ERROR,
    JSON.stringify({ message: "Server is shutting down. Please reconnect." })
  );
  return { state };
};

const matchSignal: nkruntime.MatchSignalFunction = function (
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  dispatcher: nkruntime.MatchDispatcher,
  tick: number,
  state: MatchState
): { state: MatchState; data?: string } | null {
  return { state };
};

// ─── Leaderboard Helper ──────────────────────────────────────────────────────
const LEADERBOARD_ID = "tictactoe_global";

function recordLeaderboard(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  state: MatchState
): void {
  try {
    const userIds = Object.keys(state.presences);
    for (const userId of userIds) {
      const isWinner = state.winner === userId;
      const isDraw_  = state.winner === null;

      // Score: win=3, draw=1, loss=0
      const score = isWinner ? 3 : isDraw_ ? 1 : 0;

      nk.leaderboardRecordWrite(LEADERBOARD_ID, userId, undefined, score, undefined, {
        wins:   isWinner ? 1 : 0,
        losses: (!isWinner && !isDraw_) ? 1 : 0,
        draws:  isDraw_ ? 1 : 0,
      });
    }
  } catch (e: any) {
    logger.error(`Failed to write leaderboard record: ${e.message}`);
  }
}

// ─── Exports ─────────────────────────────────────────────────────────────────
export {
  matchInit,
  matchJoinAttempt,
  matchJoin,
  matchLeave,
  matchLoop,
  matchTerminate,
  matchSignal,
  LEADERBOARD_ID,
};
