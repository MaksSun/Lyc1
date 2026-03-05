// ============================================================
// GAME ENGINE HOOK — Robot Executor (v22 integration)
//
// TWO EXECUTION MODES:
//
// 1. Normal run (run(code, false)):
//    Uses async Interpreter with setTimeout delays.
//    Robot moves are dispatched to React state one by one.
//
// 2. Step mode (run(code, true)):
//    Uses compile() to pre-build a flat array of ALL steps synchronously.
//    Then exposes nextStep() which replays steps one by one on demand.
//    No Promises, no closures, no timing issues.
//    The user clicks "Шаг →" → we take steps[stepIndex] → dispatch → done.
//
// This design guarantees step mode works correctly for:
//   - нц пока ... кц  (while loops)
//   - нц N раз ... кц (repeat loops)
//   - если ... то ... иначе ... все (conditionals)
//   - nested combinations of all the above
// ============================================================

import { useReducer, useRef, useCallback, useState } from "react";
import { gameReducer } from "../lib/gameReducer";
import { createEmptyGameState, isFree, posKey, LevelDefinition } from "../lib/gameTypes";
import { parse, Interpreter, ActionStep, CheckStep, compile, CompiledStep, VirtualState } from "../lib/parser";

const DEFAULT_ROWS = 7;
const DEFAULT_COLS = 9;

export interface RunResult {
  success: boolean;
  stepCount: number;
  stopped: boolean;
}

// ─── "использовать Робот" validation ─────────────────────────────────────────
export function validateUseRobot(code: string): string | null {
  const lines = code.split("\n").map((l) => l.trim().toLowerCase());
  // Find first non-empty, non-comment line
  const firstReal = lines.find((l) => l.length > 0 && !l.startsWith("//"));
  if (!firstReal) return null; // empty program — let parser handle
  if (firstReal === "использовать робот") return null; // OK
  return 'Первая строка программы должна быть: "использовать Робот"';
}

// Strip "использовать Робот" line before parsing (it's a declaration, not a command)
function stripUseRobot(code: string): string {
  return code
    .split("\n")
    .filter((l) => l.trim().toLowerCase() !== "использовать робот")
    .join("\n");
}

export function useGameEngine() {
  const [state, dispatch] = useReducer(
    gameReducer,
    createEmptyGameState(DEFAULT_ROWS, DEFAULT_COLS)
  );

  // ─── Normal run refs ──────────────────────────────────────────────────────
  const stopRef = useRef(false);
  const speedRef = useRef(300);
  const stateRef = useRef(state);
  stateRef.current = state;

  // ─── Step mode state ──────────────────────────────────────────────────────
  // compiledSteps: the full flat list of steps produced by compile()
  const compiledStepsRef = useRef<CompiledStep[]>([]);
  // stepIndex: which step we're about to execute next
  const stepIndexRef = useRef(0);
  // isStepMode: true while step mode is active
  const [isStepMode, setIsStepMode] = useState(false);
  const isStepModeRef = useRef(false);
  // stepDoneCallback: called by nextStep() to resolve the current step promise
  // (used only to signal completion to the run() caller)
  const stepFinishRef = useRef<((result: RunResult) => void) | null>(null);

  // Virtual robot position for step mode (mirrors what's been applied so far)
  const stepRobotRef = useRef({ row: 0, col: 0 });
  const stepPaintedRef = useRef<Set<string>>(new Set());
  const stepCountRef = useRef(0);
  const stepTickCountRef = useRef(0);
  const stepTargetsRef = useRef<Set<string>>(new Set());

  const loadLevel = useCallback((level: LevelDefinition) => {
    dispatch({ type: "LOAD_LEVEL", level });
  }, []);

  // ─── Normal run ───────────────────────────────────────────────────────────

  const runNormal = useCallback(async (code: string): Promise<RunResult> => {
    stopRef.current = false;

    // Validate "использовать Робот"
    const useRobotErr = validateUseRobot(code);
    if (useRobotErr) {
      dispatch({ type: "SET_ERROR", message: useRobotErr });
      return { success: false, stepCount: 0, stopped: false };
    }

    const execCode = stripUseRobot(code);

    // Find "использовать Робот" line number
    const useRobotLineIdx = code.split("\n").findIndex((l) => l.trim().toLowerCase() === "использовать робот");
    const useRobotLineNum = useRobotLineIdx >= 0 ? useRobotLineIdx + 1 : -1;

    dispatch({ type: "RESET" });
    await new Promise<void>((r) => setTimeout(r, 0));
    dispatch({ type: "SET_RUNNING", value: true });
    dispatch({ type: "SET_ERROR", message: null });
    dispatch({ type: "SET_MESSAGE", message: null });

    // Flash "использовать Робот" line briefly at start + robot pulse animation
    if (useRobotLineNum > 0) {
      dispatch({ type: "SET_CURRENT_LINE", line: useRobotLineNum });
      dispatch({ type: "ROBOT_FLASH", value: true });
      dispatch({ type: "INC_TICK" });
      await new Promise<void>((r) => setTimeout(r, Math.min(speedRef.current, 600)));
      dispatch({ type: "SET_CURRENT_LINE", line: -1 });
      dispatch({ type: "ROBOT_FLASH", value: false });
    }

    let ast;
    try {
      ast = parse(execCode);
    } catch (e: unknown) {
      dispatch({ type: "SET_ERROR", message: (e as Error).message });
      dispatch({ type: "SET_RUNNING", value: false });
      return { success: false, stepCount: 0, stopped: false };
    }

    const interpreter = new Interpreter();
    const s = stateRef.current;
    let localRobot = { ...s.robotStart };
    const localWalls = s.walls;
    const localRows = s.rows;
    const localCols = s.cols;
    const localTargets = s.targets;
    let localPainted = new Set(s.painted);
    let localStepCount = 0;
    let localTickCount = 0;
    let runSuccess = false;

    const onAction = async (step: ActionStep): Promise<boolean> => {
      if (stopRef.current) return false;
      dispatch({ type: "SET_CURRENT_LINE", line: step.line });
      // Clear condition/if flash when a real action happens
      dispatch({ type: "COND_FLASH", line: null, result: null });
      dispatch({ type: "IF_FLASH", line: null, result: null });
      dispatch({ type: "IF_BRANCH", line: null });

      if (step.type === "move") {
        const dir = step.direction!;
        const canMove = isFree(
          { rows: localRows, cols: localCols, robot: localRobot, walls: localWalls } as any,
          localRobot, dir
        );
        if (!canMove) {
          dispatch({ type: "SET_ERROR", message: `Робот врезался в стену! (строка ${step.line})` });
          return false;
        }
        if (dir === "up")         localRobot = { row: localRobot.row - 1, col: localRobot.col };
        else if (dir === "down")  localRobot = { row: localRobot.row + 1, col: localRobot.col };
        else if (dir === "left")  localRobot = { row: localRobot.row, col: localRobot.col - 1 };
        else if (dir === "right") localRobot = { row: localRobot.row, col: localRobot.col + 1 };
        dispatch({ type: "MOVE", direction: dir });
        localStepCount++;
      }

      if (step.type === "paint") {
        localPainted = new Set(localPainted);
        localPainted.add(posKey(localRobot));
        dispatch({ type: "PAINT" });
        localStepCount++;
      }

      await new Promise<void>((resolve) => setTimeout(resolve, speedRef.current));
      if (stopRef.current) return false;
      return true;
    };

    const onCheck = (step: CheckStep): boolean => {
      const result = isFree(
        { rows: localRows, cols: localCols, robot: localRobot, walls: localWalls } as any,
        localRobot, step.direction
      );
      localTickCount++;
      dispatch({ type: "INC_TICK" });
      // Flash condition line
      dispatch({ type: "COND_FLASH", line: step.line, result });
      // Flash cell on canvas
      let flashR = localRobot.row, flashC = localRobot.col;
      if (step.direction === "up") flashR--;
      else if (step.direction === "down") flashR++;
      else if (step.direction === "left") flashC--;
      else if (step.direction === "right") flashC++;
      dispatch({ type: "FLASH_CELL", key: `${flashR}:${flashC}`, dir: step.direction });
      setTimeout(() => dispatch({ type: "FLASH_CELL", key: null, dir: null }), Math.min(speedRef.current * 0.8, 400));
      return result;
    };

    // onLoopJump: called when loop jumps back to condition (new iteration)
    interpreter.onLoopJump = (line: number) => {
      dispatch({ type: "LOOP_FLASH", line });
      setTimeout(() => dispatch({ type: "LOOP_FLASH", line: null }), 300);
    };
    // onLoopEnd: called when loop condition is false (кц line highlight)
    interpreter.onLoopEnd = (endLine: number) => {
      dispatch({ type: "COND_FLASH", line: endLine, result: false });
      setTimeout(() => dispatch({ type: "COND_FLASH", line: null, result: null }), Math.min(speedRef.current * 0.8, 600));
    };
    // onRepeatIter: called at each нц N раз iteration
    interpreter.onRepeatIter = (line: number, current: number, total: number) => {
      dispatch({ type: "REPEAT_ITER", line, current, total });
    };
    // onIfCheck: called when если condition is evaluated
    interpreter.onIfCheck = (line: number, result: boolean) => {
      dispatch({ type: "IF_FLASH", line, result });
      setTimeout(() => dispatch({ type: "IF_FLASH", line: null, result: null }), Math.min(speedRef.current * 0.6, 500));
    };
    // onIfBranch: called when entering то or иначе branch
    interpreter.onIfBranch = (branchLine: number) => {
      dispatch({ type: "IF_BRANCH", line: branchLine });
      setTimeout(() => dispatch({ type: "IF_BRANCH", line: null }), Math.min(speedRef.current * 0.6, 500));
    };

    try {
      await interpreter.execute(ast, onAction, onCheck);
      if (!stopRef.current) {
        const allPainted = localTargets.size === 0 || [...localTargets].every((t) => localPainted.has(t));
        runSuccess = allPainted;
        dispatch({ type: "SET_MESSAGE", message: allPainted ? "✅ Задание выполнено!" : "⚠️ Программа завершена, но не все клетки закрашены." });
      }
    } catch (e: unknown) {
      const msg = (e as Error).message;
      if (msg !== "STOPPED") dispatch({ type: "SET_ERROR", message: msg });
    } finally {
      dispatch({ type: "SET_RUNNING", value: false });
      dispatch({ type: "SET_CURRENT_LINE", line: -1 });
      dispatch({ type: "COND_FLASH", line: null, result: null });
      dispatch({ type: "IF_FLASH", line: null, result: null });
      dispatch({ type: "IF_BRANCH", line: null });
      dispatch({ type: "REPEAT_ITER", line: null, current: 0, total: 0 });
      dispatch({ type: "ROBOT_FLASH", value: false });
    }

    return { success: runSuccess, stepCount: localStepCount, stopped: stopRef.current };
  }, []);

  // ─── Step mode: start ─────────────────────────────────────────────────────

  const runStep = useCallback((code: string): Promise<RunResult> => {
    return new Promise<RunResult>((resolve) => {
      // Validate "использовать Робот"
      const useRobotErr = validateUseRobot(code);
      if (useRobotErr) {
        dispatch({ type: "SET_ERROR", message: useRobotErr });
        resolve({ success: false, stepCount: 0, stopped: false });
        return;
      }

      const execCode = stripUseRobot(code);

      // Find the line number of "использовать Робот" in original code
      const useRobotLineIdx = code.split("\n").findIndex((l) => l.trim().toLowerCase() === "использовать робот");
      const useRobotLineNum = useRobotLineIdx >= 0 ? useRobotLineIdx + 1 : undefined;

      // Parse
      let ast;
      try {
        ast = parse(execCode);
      } catch (e: unknown) {
        dispatch({ type: "SET_ERROR", message: (e as Error).message });
        resolve({ success: false, stepCount: 0, stopped: false });
        return;
      }

      // Compile — build full step list synchronously (prepend useRobot step)
      const s = stateRef.current;
      const vs: VirtualState = {
        row: s.robotStart.row,
        col: s.robotStart.col,
        rows: s.rows,
        cols: s.cols,
        wallsH: new Set(s.walls.horizontal),
        wallsV: new Set(s.walls.vertical),
        painted: new Set(s.painted),
      };

      const result = compile(ast, vs, useRobotLineNum);

      // Reset UI atomically — single dispatch = single render = no flicker
      dispatch({ type: "RESET_AND_START" });
      dispatch({ type: "SET_ERROR", message: null });
      dispatch({ type: "SET_MESSAGE", message: null });

      // Store compiled steps
      compiledStepsRef.current = result.steps;
      stepIndexRef.current = 0;
      stepRobotRef.current = { ...s.robotStart };
      stepPaintedRef.current = new Set(s.painted);
      stepCountRef.current = 0;
      stepTickCountRef.current = 0;
      stepTargetsRef.current = new Set(s.targets);
      stepFinishRef.current = resolve;

      isStepModeRef.current = true;
      setIsStepMode(true);
      stopRef.current = false;

      // If there are no steps at all (empty program or compile error)
      if (result.steps.length === 0) {
        setTimeout(() => {
          if (result.error) {
            dispatch({ type: "SET_ERROR", message: result.error });
          } else {
            const allPainted = s.targets.size === 0 || [...s.targets].every((t) => s.painted.has(t));
            dispatch({ type: "SET_MESSAGE", message: allPainted ? "✅ Задание выполнено!" : "⚠️ Программа завершена, но не все клетки закрашены." });
          }
          dispatch({ type: "SET_RUNNING", value: false });
          isStepModeRef.current = false;
          setIsStepMode(false);
          stepFinishRef.current = null;
          resolve({ success: false, stepCount: 0, stopped: false });
        }, 50);
      }
    });
  }, []);

  // ─── Step mode: advance one step ─────────────────────────────────────────

  const nextStep = useCallback(() => {
    if (!isStepModeRef.current) return;
    if (stopRef.current) return;

    const steps = compiledStepsRef.current;
    const idx = stepIndexRef.current;

    if (idx >= steps.length) {
      // All steps done
      const targets = stepTargetsRef.current;
      const painted = stepPaintedRef.current;
      const allPainted = targets.size === 0 || [...targets].every((t) => painted.has(t));
      dispatch({ type: "SET_MESSAGE", message: allPainted ? "✅ Задание выполнено!" : "⚠️ Программа завершена, но не все клетки закрашены." });
      dispatch({ type: "SET_RUNNING", value: false });
      dispatch({ type: "SET_CURRENT_LINE", line: -1 });
      dispatch({ type: "COND_FLASH", line: null, result: null });
      isStepModeRef.current = false;
      setIsStepMode(false);
      const finish = stepFinishRef.current;
      stepFinishRef.current = null;
      if (finish) finish({ success: allPainted, stepCount: stepCountRef.current, stopped: false });
      return;
    }

    const step = steps[idx];
    stepIndexRef.current = idx + 1;

    // Highlight line — only for move/paint (regular commands)
    // check/loopEnd use condFlashLine; loopJump uses loopFlashLine
    // useRobot uses currentLine + ROBOT_FLASH; repeatIter uses REPEAT_ITER; ifCheck/ifBranch use IF_FLASH/IF_BRANCH
    if (step.type === "move" || step.type === "paint") {
      dispatch({ type: "SET_CURRENT_LINE", line: step.line });
      dispatch({ type: "COND_FLASH", line: null, result: null });
      dispatch({ type: "IF_FLASH", line: null, result: null });
      dispatch({ type: "IF_BRANCH", line: null });
    } else if (step.type === "useRobot") {
      dispatch({ type: "SET_CURRENT_LINE", line: step.line });
      dispatch({ type: "ROBOT_FLASH", value: true });
      // Auto-clear robot flash after next step
      setTimeout(() => dispatch({ type: "ROBOT_FLASH", value: false }), 800);
    } else if (step.type === "loopJump" || step.type === "loopEnd" || step.type === "check") {
      // Clear currentLine so only condFlashLine/loopFlashLine shows
      dispatch({ type: "SET_CURRENT_LINE", line: -1 });
      dispatch({ type: "IF_FLASH", line: null, result: null });
      dispatch({ type: "IF_BRANCH", line: null });
    } else if (step.type === "repeatIter" || step.type === "ifCheck" || step.type === "ifBranch") {
      dispatch({ type: "SET_CURRENT_LINE", line: -1 });
      dispatch({ type: "COND_FLASH", line: null, result: null });
    }

    if (step.crashed) {
      // Crash step — show error and end
      dispatch({ type: "SET_ERROR", message: `Робот врезался в стену! (строка ${step.line})` });
      dispatch({ type: "SET_RUNNING", value: false });
      dispatch({ type: "SET_CURRENT_LINE", line: -1 });
      isStepModeRef.current = false;
      setIsStepMode(false);
      const finish = stepFinishRef.current;
      stepFinishRef.current = null;
      if (finish) finish({ success: false, stepCount: stepCountRef.current, stopped: false });
      return;
    }

    if (step.type === "move") {
      const dir = step.direction!;
      // Update virtual robot
      if (dir === "up")         stepRobotRef.current = { row: stepRobotRef.current.row - 1, col: stepRobotRef.current.col };
      else if (dir === "down")  stepRobotRef.current = { row: stepRobotRef.current.row + 1, col: stepRobotRef.current.col };
      else if (dir === "left")  stepRobotRef.current = { row: stepRobotRef.current.row, col: stepRobotRef.current.col - 1 };
      else if (dir === "right") stepRobotRef.current = { row: stepRobotRef.current.row, col: stepRobotRef.current.col + 1 };
      dispatch({ type: "MOVE", direction: dir });
      stepCountRef.current++;
    } else if (step.type === "paint") {
      const key = `${stepRobotRef.current.row}:${stepRobotRef.current.col}`;
      stepPaintedRef.current = new Set(stepPaintedRef.current);
      stepPaintedRef.current.add(key);
      dispatch({ type: "PAINT" });
      stepCountRef.current++;
    } else if (step.type === "check") {
      const r = step.checkRow ?? stepRobotRef.current.row;
      const c = step.checkCol ?? stepRobotRef.current.col;
      const dir = step.direction;
      let flashR = r, flashC = c;
      if (dir === "up") flashR = r - 1;
      else if (dir === "down") flashR = r + 1;
      else if (dir === "left") flashC = c - 1;
      else if (dir === "right") flashC = c + 1;
      const flashKey = `${flashR}:${flashC}`;
      dispatch({ type: "FLASH_CELL", key: flashKey, dir: dir ?? null });
      // Condition flash: highlight the condition line with result color
      dispatch({ type: "COND_FLASH", line: step.line, result: step.checkResult ?? null });
      // Auto-clear flash after 400ms
      setTimeout(() => dispatch({ type: "FLASH_CELL", key: null, dir: null }), 400);
      // Tick count
      stepTickCountRef.current++;
      dispatch({ type: "INC_TICK" });
    } else if (step.type === "loopJump") {
      // Visual tick: briefly flash the loop line (нц line) to show jump back to condition check
      dispatch({ type: "LOOP_FLASH", line: step.line });
      setTimeout(() => dispatch({ type: "LOOP_FLASH", line: null }), 350);
    } else if (step.type === "loopEnd") {
      // Highlight кц line when loop condition becomes false
      dispatch({ type: "COND_FLASH", line: step.line, result: false });
      setTimeout(() => dispatch({ type: "COND_FLASH", line: null, result: null }), 600);
    } else if (step.type === "useRobot") {
      // useRobot: highlight line + robot pulse animation (handled above)
    } else if (step.type === "repeatIter") {
      // Show iteration counter on нц N раз line
      dispatch({ type: "REPEAT_ITER", line: step.line, current: step.iterCurrent ?? 0, total: step.iterTotal ?? 0 });
    } else if (step.type === "ifCheck") {
      // Highlight если line with condition result
      const r = step.checkRow ?? stepRobotRef.current.row;
      const c = step.checkCol ?? stepRobotRef.current.col;
      const dir = step.direction;
      let flashR = r, flashC = c;
      if (dir === "up") flashR = r - 1;
      else if (dir === "down") flashR = r + 1;
      else if (dir === "left") flashC = c - 1;
      else if (dir === "right") flashC = c + 1;
      dispatch({ type: "FLASH_CELL", key: `${flashR}:${flashC}`, dir: dir ?? null });
      setTimeout(() => dispatch({ type: "FLASH_CELL", key: null, dir: null }), 400);
      dispatch({ type: "IF_FLASH", line: step.line, result: step.checkResult ?? null });
      stepTickCountRef.current++;
      dispatch({ type: "INC_TICK" });
    } else if (step.type === "ifBranch") {
      // Highlight то or иначе line
      dispatch({ type: "IF_BRANCH", line: step.line });
    }
  }, []);

  // ─── Public run() ─────────────────────────────────────────────────────────

  const run = useCallback(async (code: string, stepMode = false): Promise<RunResult> => {
    if (stepMode) {
      return runStep(code);
    } else {
      return runNormal(code);
    }
  }, [runNormal, runStep]);

  // ─── Stop ─────────────────────────────────────────────────────────────────

  const stop = useCallback(() => {
    stopRef.current = true;
    if (isStepModeRef.current) {
      isStepModeRef.current = false;
      setIsStepMode(false);
      dispatch({ type: "SET_RUNNING", value: false });
      dispatch({ type: "SET_CURRENT_LINE", line: -1 });
      dispatch({ type: "COND_FLASH", line: null, result: null });
      const finish = stepFinishRef.current;
      stepFinishRef.current = null;
      if (finish) finish({ success: false, stepCount: stepCountRef.current, stopped: true });
    } else {
      dispatch({ type: "SET_RUNNING", value: false });
    }
  }, []);

  // ─── Reset ────────────────────────────────────────────────────────────────

  const reset = useCallback(() => {
    stopRef.current = true;
    if (isStepModeRef.current) {
      isStepModeRef.current = false;
      setIsStepMode(false);
      const finish = stepFinishRef.current;
      stepFinishRef.current = null;
      if (finish) finish({ success: false, stepCount: 0, stopped: true });
    }
    dispatch({ type: "RESET" });
  }, []);

  const setSpeed = useCallback((value: number) => {
    speedRef.current = value;
    dispatch({ type: "SET_SPEED", value });
  }, []);

  const toggleWall = useCallback((wall: string) => {
    dispatch({ type: "TOGGLE_WALL", wall });
  }, []);

  const toggleTarget = useCallback((pos: { row: number; col: number }) => {
    dispatch({ type: "TOGGLE_TARGET", pos });
  }, []);

  const setRobot = useCallback((pos: { row: number; col: number }) => {
    dispatch({ type: "SET_ROBOT", pos });
  }, []);

  return {
    state,
    dispatch,
    run,
    stop,
    nextStep,
    reset,
    setSpeed,
    loadLevel,
    toggleWall,
    toggleTarget,
    setRobot,
    isStepMode,
  };
}
