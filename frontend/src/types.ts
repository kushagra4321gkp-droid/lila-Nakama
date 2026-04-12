// Opcodes must match nakama/src/tictactoe.ts
export const enum OpCode {
  MAKE_MOVE  = 1,
  GAME_STATE = 2,
  GAME_OVER  = 3,
  WAITING    = 4,
  TIMER_TICK = 5,
  ERROR      = 6,
}

export type Mark = "X" | "O" | "";

export interface GameState {
  board:       Mark[];
  marks:       Record<string, "X" | "O">;
  currentTurn: string;        // userId
  gameOver:    boolean;
  winner:      string | null; // userId or null
  winLine:     number[] | null;
  ready:       boolean;
  turnTimerS:  number | null;
}

export interface GameOverPayload {
  winner:     string | null;
  winnerMark: "X" | "O" | null;
  winLine:    number[] | null;
  reason:     "win" | "draw" | "timeout" | "opponent_disconnected";
  loser?:     string;
  board:      Mark[];
}

export interface TimerTickPayload {
  secondsLeft: number;
  turn:        string;
}

export interface LeaderboardRecord {
  rank:       number;
  userId:     string;
  username:   string;
  score:      number;
  numWins:    number;
  numLosses:  number;
  numDraws:   number;
  updateTime: string;
}

export type Screen = "login" | "lobby" | "matchmaking" | "game" | "leaderboard";

export type GameMode = "classic" | "timed";
