// ============================================================
// GAME TYPES — Robot Executor (v22 integration)
// ============================================================

export interface Position {
  row: number;
  col: number;
}

export type Direction = "up" | "down" | "left" | "right";

// Wall key format: "h:row:col" (horizontal wall below cell row,col)
//                  "v:row:col" (vertical wall right of cell row,col)
export type WallKey = string;

export function wallKey(type: "h" | "v", row: number, col: number): WallKey {
  return `${type}:${row}:${col}`;
}

export function posKey(pos: Position): string {
  return `${pos.row}:${pos.col}`;
}

export interface Walls {
  horizontal: Set<WallKey>;
  vertical: Set<WallKey>;
}

export interface GameState {
  rows: number;
  cols: number;
  robot: Position;
  robotDir: Direction;
  robotStart: Position;
  walls: Walls;
  painted: Set<string>;
  targets: Set<string>;
  isRunning: boolean;
  isPaused: boolean;
  isCrashed: boolean;
  currentLine: number;
  error: string | null;
  message: string | null;
  speed: number;
  stepCount: number;
  tickCount: number;       // number of condition checks (тики)
  flashCell: string | null;   // key "row:col" of cell to flash (condition check)
  flashDir: Direction | null; // direction being checked
  loopFlashLine: number | null; // line number to flash for loopJump visual tick
  condFlashLine: number | null; // line number to flash for condition check (if/while)
  condFlashResult: boolean | null; // result of last condition check (true=green, false=red)
  robotFlash: boolean;           // true = robot pulse animation (useRobot step)
  repeatIterLine: number | null; // line of нц N раз currently executing
  repeatIterCurrent: number;     // current iteration index (1-based)
  repeatIterTotal: number;       // total iterations
  ifFlashLine: number | null;    // line of если being checked
  ifBranchLine: number | null;   // line of то or иначе being entered
}

export function createEmptyGameState(rows: number, cols: number): GameState {
  return {
    rows,
    cols,
    robot: { row: 0, col: 0 },
    robotDir: "right" as Direction,
    robotStart: { row: 0, col: 0 },
    walls: { horizontal: new Set(), vertical: new Set() },
    painted: new Set(),
    targets: new Set(),
    isRunning: false,
    isPaused: false,
    isCrashed: false,
    currentLine: -1,
    error: null,
    message: null,
    speed: 300,
    stepCount: 0,
    tickCount: 0,
    flashCell: null,
    flashDir: null,
    loopFlashLine: null,
    condFlashLine: null,
    condFlashResult: null,
    robotFlash: false,
    repeatIterLine: null,
    repeatIterCurrent: 0,
    repeatIterTotal: 0,
    ifFlashLine: null,
    ifBranchLine: null,
  };
}

export type GameAction =
  | { type: "MOVE"; direction: Direction }
  | { type: "PAINT" }
  | { type: "RESET" }
  | { type: "RESET_AND_START" }  // atomic: reset + set isRunning=true
  | { type: "CLEAR" }
  | { type: "SET_RUNNING"; value: boolean }
  | { type: "SET_PAUSED"; value: boolean }
  | { type: "SET_ERROR"; message: string | null }
  | { type: "SET_MESSAGE"; message: string | null }
  | { type: "SET_CURRENT_LINE"; line: number }
  | { type: "SET_SPEED"; value: number }
  | { type: "TOGGLE_WALL"; wall: WallKey }
  | { type: "TOGGLE_TARGET"; pos: Position }
  | { type: "SET_ROBOT"; pos: Position }
  | { type: "SET_CRASH"; value: boolean }
  | { type: "LOAD_LEVEL"; level: LevelDefinition }
  | { type: "FLASH_CELL"; key: string | null; dir: Direction | null }
  | { type: "LOOP_FLASH"; line: number | null }
  | { type: "COND_FLASH"; line: number | null; result: boolean | null }
  | { type: "INC_TICK" }
  | { type: "ROBOT_FLASH"; value: boolean }
  | { type: "REPEAT_ITER"; line: number | null; current: number; total: number }
  | { type: "IF_FLASH"; line: number | null; result: boolean | null }
  | { type: "IF_BRANCH"; line: number | null };

export interface LevelDefinition {
  id: string;
  name: string;
  description: string;
  rows: number;
  cols: number;
  robotStart: Position;
  walls: {
    horizontal: WallKey[];
    vertical: WallKey[];
  };
  targets: string[];
  initialCode?: string;
}

// Check if direction from pos is free (no wall, no boundary)
export function isFree(state: GameState, pos: Position, dir: Direction): boolean {
  const { row, col } = pos;
  if (dir === "up") {
    if (row === 0) return false;
    return !state.walls.horizontal.has(wallKey("h", row - 1, col));
  }
  if (dir === "down") {
    if (row === state.rows - 1) return false;
    return !state.walls.horizontal.has(wallKey("h", row, col));
  }
  if (dir === "left") {
    if (col === 0) return false;
    return !state.walls.vertical.has(wallKey("v", row, col - 1));
  }
  if (dir === "right") {
    if (col === state.cols - 1) return false;
    return !state.walls.vertical.has(wallKey("v", row, col));
  }
  return false;
}
