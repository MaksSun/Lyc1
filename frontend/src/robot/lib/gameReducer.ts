// ============================================================
// GAME REDUCER — Robot Executor (v22 integration)
// ============================================================

import {
  GameState, GameAction, Position, wallKey, posKey, LevelDefinition, createEmptyGameState
} from "./gameTypes";

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case "MOVE": {
      const { row, col } = state.robot;
      let newRow = row, newCol = col;
      if (action.direction === "up") newRow--;
      else if (action.direction === "down") newRow++;
      else if (action.direction === "left") newCol--;
      else if (action.direction === "right") newCol++;
      return {
        ...state,
        robot: { row: newRow, col: newCol },
        robotDir: action.direction,
        stepCount: state.stepCount + 1,
        flashCell: null,
        flashDir: null,
      };
    }
    case "PAINT": {
      const key = posKey(state.robot);
      const newPainted = new Set(state.painted);
      newPainted.add(key);
      return { ...state, painted: newPainted, stepCount: state.stepCount + 1, flashCell: null, flashDir: null };
    }
    case "RESET": {
      return {
        ...state,
        robot: { ...state.robotStart },
        painted: new Set(),
        isRunning: false,
        isPaused: false,
        isCrashed: false,
        currentLine: -1,
        error: null,
        message: null,
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
    case "RESET_AND_START": {
      return {
        ...state,
        robot: { ...state.robotStart },
        painted: new Set(),
        isRunning: true,
        isPaused: false,
        isCrashed: false,
        currentLine: -1,
        error: null,
        message: null,
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
    case "FLASH_CELL":
      return { ...state, flashCell: action.key, flashDir: action.dir };
    case "LOOP_FLASH":
      return { ...state, loopFlashLine: action.line };
    case "COND_FLASH":
      return { ...state, condFlashLine: action.line, condFlashResult: action.result };
    case "INC_TICK":
      return { ...state, tickCount: state.tickCount + 1 };
    case "ROBOT_FLASH":
      return { ...state, robotFlash: action.value };
    case "REPEAT_ITER":
      return { ...state, repeatIterLine: action.line, repeatIterCurrent: action.current, repeatIterTotal: action.total };
    case "IF_FLASH":
      return { ...state, ifFlashLine: action.line, condFlashLine: action.line, condFlashResult: action.result };
    case "IF_BRANCH":
      return { ...state, ifBranchLine: action.line };
    case "SET_CRASH":
      return { ...state, isCrashed: action.value };
    case "CLEAR": {
      const empty = createEmptyGameState(state.rows, state.cols);
      return {
        ...empty,
        speed: state.speed,
      };
    }
    case "SET_RUNNING":
      return { ...state, isRunning: action.value };
    case "SET_PAUSED":
      return { ...state, isPaused: action.value };
    case "SET_ERROR":
      // Only stop running if there's an actual error message (not a null clear)
      return { ...state, error: action.message, isRunning: action.message !== null ? false : state.isRunning };
    case "SET_MESSAGE":
      return { ...state, message: action.message };
    case "SET_CURRENT_LINE":
      return { ...state, currentLine: action.line };
    case "SET_SPEED":
      return { ...state, speed: action.value };
    case "TOGGLE_WALL": {
      const wall = action.wall;
      const newH = new Set(state.walls.horizontal);
      const newV = new Set(state.walls.vertical);
      if (wall.startsWith("h:")) {
        if (newH.has(wall)) newH.delete(wall); else newH.add(wall);
      } else {
        if (newV.has(wall)) newV.delete(wall); else newV.add(wall);
      }
      return { ...state, walls: { horizontal: newH, vertical: newV } };
    }
    case "TOGGLE_TARGET": {
      const key = posKey(action.pos);
      const newTargets = new Set(state.targets);
      if (newTargets.has(key)) newTargets.delete(key); else newTargets.add(key);
      return { ...state, targets: newTargets };
    }
    case "SET_ROBOT": {
      return {
        ...state,
        robot: { ...action.pos },
        robotStart: { ...action.pos },
      };
    }
    case "LOAD_LEVEL": {
      const level: LevelDefinition = action.level;
      return {
        ...createEmptyGameState(level.rows, level.cols),
        robotStart: { ...level.robotStart },
        robot: { ...level.robotStart },
        walls: {
          horizontal: new Set(level.walls.horizontal),
          vertical: new Set(level.walls.vertical),
        },
        targets: new Set(level.targets),
        speed: state.speed,
      };
    }
    default:
      return state;
  }
}
