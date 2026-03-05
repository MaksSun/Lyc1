// ============================================================
// PARSER & INTERPRETER — Robot Executor (v22 integration)
// Russian natural-language commands
//
// TWO EXECUTION MODES:
//   1. execute(ast, onAction, onCheck) — async, used for normal run with delays
//   2. compile(ast, onCheck)           — SYNC, pre-computes flat step list for step mode
//
// compile() evaluates conditions SYNCHRONOUSLY against the initial state,
// then returns an array of ActionStep[] that can be replayed one by one.
// ============================================================

export type TokenType =
  | "VVERH" | "VNIZ" | "VLEVO" | "VPRAVO" | "ZAKRASIT"
  | "NZ" | "KZ" | "POKA" | "ESLI" | "TO" | "INACHE" | "VSE"
  | "SLEVA" | "SPRAVA" | "SVERHU" | "SNIZU" | "SVOBODNO"
  | "NE" | "I" | "ILI" | "LPAREN" | "RPAREN" | "NUMBER" | "RAZ" | "EOF";

export interface Token { type: TokenType; value: string; line: number; }

const KEYWORDS: Record<string, TokenType> = {
  "вверх": "VVERH", "вниз": "VNIZ", "влево": "VLEVO", "вправо": "VPRAVO",
  "закрасить": "ZAKRASIT", "нц": "NZ", "кц": "KZ", "пока": "POKA",
  "если": "ESLI", "то": "TO", "иначе": "INACHE", "все": "VSE",
  "слева": "SLEVA", "справа": "SPRAVA", "сверху": "SVERHU", "снизу": "SNIZU",
  "свободно": "SVOBODNO", "не": "NE", "и": "I", "или": "ILI",
  "раз": "RAZ",
};

export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  const lines = source.split("\n");
  for (let li = 0; li < lines.length; li++) {
    const raw = lines[li].replace(/\/\/.*$/, "").toLowerCase();
    let i = 0;
    while (i < raw.length) {
      const ch = raw[i];
      if (ch === " " || ch === "\t" || ch === "," || ch === ";") { i++; continue; }
      if (ch === "(") { tokens.push({ type: "LPAREN", value: "(", line: li + 1 }); i++; continue; }
      if (ch === ")") { tokens.push({ type: "RPAREN", value: ")", line: li + 1 }); i++; continue; }
      if (ch >= "0" && ch <= "9") {
        let j = i;
        while (j < raw.length && raw[j] >= "0" && raw[j] <= "9") j++;
        tokens.push({ type: "NUMBER", value: raw.slice(i, j), line: li + 1 });
        i = j;
        continue;
      }
      let j = i;
      while (j < raw.length && raw[j] !== " " && raw[j] !== "\t" && raw[j] !== "," && raw[j] !== ";" && raw[j] !== "(" && raw[j] !== ")") j++;
      const word = raw.slice(i, j);
      if (word.length > 0) {
        const type = KEYWORDS[word];
        if (type) {
          tokens.push({ type, value: word, line: li + 1 });
        } else {
          throw new SyntaxError(`Неизвестная команда: "${word}" (строка ${li + 1})`);
        }
      }
      i = j;
    }
  }
  tokens.push({ type: "EOF", value: "", line: lines.length });
  return tokens;
}

export type ASTNode =
  | { kind: "Program"; body: ASTNode[]; line: number }
  | { kind: "Move"; direction: "up" | "down" | "left" | "right"; line: number }
  | { kind: "Paint"; line: number }
  | { kind: "WhileLoop"; condition: ConditionNode; body: ASTNode[]; line: number; endLine: number }
  | { kind: "RepeatLoop"; count: number; body: ASTNode[]; line: number; endLine: number }
  | { kind: "IfStatement"; condition: ConditionNode; then: ASTNode[]; else?: ASTNode[]; line: number; thenLine: number; elseLine?: number; endLine: number };

export type ConditionNode =
  | { kind: "Check"; direction: "up" | "down" | "left" | "right"; line: number }
  | { kind: "Not"; operand: ConditionNode; line: number }
  | { kind: "And"; left: ConditionNode; right: ConditionNode; line: number }
  | { kind: "Or"; left: ConditionNode; right: ConditionNode; line: number };

class Parser {
  private tokens: Token[];
  private pos = 0;
  constructor(tokens: Token[]) { this.tokens = tokens; }
  private peek() { return this.tokens[this.pos]; }
  private advance() { return this.tokens[this.pos++]; }
  private expect(type: TokenType) {
    const tok = this.peek();
    if (tok.type !== type) throw new SyntaxError(`Ожидалось "${type}", получено "${tok.value}" (строка ${tok.line})`);
    return this.advance();
  }
  parseProgram(): ASTNode {
    const body: ASTNode[] = [];
    while (this.peek().type !== "EOF") body.push(this.parseStatement());
    return { kind: "Program", body, line: 1 };
  }
  private parseStatement(): ASTNode {
    const tok = this.peek();
    switch (tok.type) {
      case "VVERH": this.advance(); return { kind: "Move", direction: "up", line: tok.line };
      case "VNIZ": this.advance(); return { kind: "Move", direction: "down", line: tok.line };
      case "VLEVO": this.advance(); return { kind: "Move", direction: "left", line: tok.line };
      case "VPRAVO": this.advance(); return { kind: "Move", direction: "right", line: tok.line };
      case "ZAKRASIT": this.advance(); return { kind: "Paint", line: tok.line };
      case "NZ": return this.parseLoop();
      case "ESLI": return this.parseIf();
      default: throw new SyntaxError(`Неожиданный токен: "${tok.value}" (строка ${tok.line})`);
    }
  }
  private parseLoop(): ASTNode {
    const st = this.expect("NZ");
    const next = this.peek();
    if (next.type === "NUMBER") {
      const count = parseInt(this.advance().value, 10);
      this.expect("RAZ");
      const body: ASTNode[] = [];
      while (this.peek().type !== "KZ" && this.peek().type !== "EOF") body.push(this.parseStatement());
      if (this.peek().type === "EOF") throw new SyntaxError(`Цикл не закрыт — ожидается "кц" (строка ${st.line})`);
      const kzTokR = this.expect("KZ");
      return { kind: "RepeatLoop", count, body, line: st.line, endLine: kzTokR.line };
    }
    this.expect("POKA");
    const cond = this.parseCondition();
    const body: ASTNode[] = [];
    while (this.peek().type !== "KZ" && this.peek().type !== "EOF") body.push(this.parseStatement());
    if (this.peek().type === "EOF") throw new SyntaxError(`Цикл не закрыт — ожидается "кц" (строка ${st.line})`);
    const kzTok = this.expect("KZ");
    return { kind: "WhileLoop", condition: cond, body, line: st.line, endLine: kzTok.line };
  }
  private parseIf(): ASTNode {
    const st = this.expect("ESLI");
    const cond = this.parseCondition();
    const toTok = this.expect("TO");
    const thenLine = toTok.line;
    const thenBody: ASTNode[] = [];
    while (this.peek().type !== "INACHE" && this.peek().type !== "VSE" && this.peek().type !== "EOF")
      thenBody.push(this.parseStatement());
    let elseBody: ASTNode[] | undefined;
    let elseLine: number | undefined;
    if (this.peek().type === "INACHE") {
      const inacheTok = this.advance();
      elseLine = inacheTok.line;
      elseBody = [];
      while (this.peek().type !== "VSE" && this.peek().type !== "EOF") elseBody.push(this.parseStatement());
    }
    if (this.peek().type === "EOF") throw new SyntaxError(`Условие не закрыто — ожидается "все" (строка ${st.line})`);
    const vseTok = this.expect("VSE");
    return { kind: "IfStatement", condition: cond, then: thenBody, else: elseBody, line: st.line, thenLine, elseLine, endLine: vseTok.line };
  }
  private parseCondition(): ConditionNode { return this.parseOr(); }
  private parseOr(): ConditionNode {
    let left = this.parseAnd();
    while (this.peek().type === "ILI") {
      const line = this.peek().line; this.advance();
      left = { kind: "Or", left, right: this.parseAnd(), line };
    }
    return left;
  }
  private parseAnd(): ConditionNode {
    let left = this.parseNot();
    while (this.peek().type === "I") {
      const line = this.peek().line; this.advance();
      left = { kind: "And", left, right: this.parseNot(), line };
    }
    return left;
  }
  private parseNot(): ConditionNode {
    if (this.peek().type === "NE") {
      const line = this.peek().line; this.advance();
      return { kind: "Not", operand: this.parsePrimary(), line };
    }
    return this.parsePrimary();
  }
  private parsePrimary(): ConditionNode {
    const tok = this.peek();
    if (tok.type === "LPAREN") {
      this.advance();
      const c = this.parseCondition();
      this.expect("RPAREN");
      return c;
    }
    let dir: "up" | "down" | "left" | "right" | null = null;
    if (tok.type === "SLEVA") dir = "left";
    else if (tok.type === "SPRAVA") dir = "right";
    else if (tok.type === "SVERHU") dir = "up";
    else if (tok.type === "SNIZU") dir = "down";
    if (dir) { this.advance(); this.expect("SVOBODNO"); return { kind: "Check", direction: dir, line: tok.line }; }
    throw new SyntaxError(`Ожидалось условие (слева/справа/сверху/снизу свободно), получено "${tok.value}" (строка ${tok.line})`);
  }
}

export function parse(source: string): ASTNode {
  return new Parser(tokenize(source)).parseProgram();
}

// ─── Step types ───────────────────────────────────────────────────────────────

export interface ActionStep {
  type: "move" | "paint";
  direction?: "up" | "down" | "left" | "right";
  line: number;
}

export interface CheckStep {
  type: "check";
  direction: "up" | "down" | "left" | "right";
  line: number;
}

// ActionCallback: called for move/paint — return true to continue, false to stop
export type ActionCallback = (step: ActionStep) => Promise<boolean>;
// CheckCallback: called for condition checks — return boolean result of the check
export type CheckCallback = (step: CheckStep) => boolean;

const MAX_STEPS = 10000;

// ─── Async interpreter (normal run mode) ─────────────────────────────────────

export class Interpreter {
  private actionCount = 0;
  // Optional callback: called when a loop jumps back to condition (new iteration)
  onLoopJump?: (line: number) => void;
  // Optional callback: called when loop exits (condition false) — highlights кц line
  onLoopEnd?: (endLine: number) => void;
  // Optional callback: called on each нц N раз iteration start
  onRepeatIter?: (line: number, current: number, total: number) => void;
  // Optional callback: called when если condition evaluated
  onIfCheck?: (line: number, result: boolean) => void;
  // Optional callback: called when entering то or иначе branch
  onIfBranch?: (branchLine: number) => void;

  async execute(
    ast: ASTNode,
    onAction: ActionCallback,
    onCheck: CheckCallback
  ): Promise<void> {
    this.actionCount = 0;
    await this.run(ast, onAction, onCheck);
  }

  private async run(
    node: ASTNode,
    onAction: ActionCallback,
    onCheck: CheckCallback
  ): Promise<void> {
    if (node.kind === "Program") {
      for (const c of node.body) await this.run(c, onAction, onCheck);

    } else if (node.kind === "Move") {
      if (++this.actionCount > MAX_STEPS)
        throw new Error("Превышено максимальное количество шагов (10000). Возможно, бесконечный цикл.");
      const cont = await onAction({ type: "move", direction: node.direction, line: node.line });
      if (!cont) throw new Error("STOPPED");

    } else if (node.kind === "Paint") {
      if (++this.actionCount > MAX_STEPS)
        throw new Error("Превышено максимальное количество шагов.");
      const cont = await onAction({ type: "paint", line: node.line });
      if (!cont) throw new Error("STOPPED");

    } else if (node.kind === "WhileLoop") {
      let iters = 0;
      while (true) {
        if (++iters > MAX_STEPS)
          throw new Error("Превышено максимальное количество итераций цикла.");
        const cond = this.evalCond(node.condition, onCheck);
        if (!cond) {
          // Notify loopEnd: highlight кц line when condition is false
          if (this.onLoopEnd) this.onLoopEnd(node.endLine);
          break;
        }
        for (const c of node.body) await this.run(c, onAction, onCheck);
        // Notify loopJump (new iteration): flash нц line
        if (this.onLoopJump) this.onLoopJump(node.line);
      }

    } else if (node.kind === "RepeatLoop") {
      for (let i = 0; i < node.count; i++) {
        if (this.onRepeatIter) this.onRepeatIter(node.line, i + 1, node.count);
        for (const c of node.body) await this.run(c, onAction, onCheck);
      }

    } else if (node.kind === "IfStatement") {
      const cond = this.evalCond(node.condition, onCheck);
      if (this.onIfCheck) this.onIfCheck(node.line, cond);
      if (cond) {
        if (this.onIfBranch) this.onIfBranch(node.thenLine);
        for (const c of node.then) await this.run(c, onAction, onCheck);
      } else if (node.else) {
        if (this.onIfBranch) this.onIfBranch(node.elseLine ?? node.thenLine);
        for (const c of node.else) await this.run(c, onAction, onCheck);
      }
    }
  }

  private evalCond(cond: ConditionNode, onCheck: CheckCallback): boolean {
    if (cond.kind === "Check") {
      return onCheck({ type: "check", direction: cond.direction, line: cond.line });
    }
    if (cond.kind === "Not") return !this.evalCond(cond.operand, onCheck);
    if (cond.kind === "And") {
      return this.evalCond(cond.left, onCheck) && this.evalCond(cond.right, onCheck);
    }
    if (cond.kind === "Or") {
      return this.evalCond(cond.left, onCheck) || this.evalCond(cond.right, onCheck);
    }
    return false;
  }
}

// ─── Compiler (step mode) ─────────────────────────────────────────────────────
//
// Compiles the AST into a flat array of ActionStep[] by simulating execution
// synchronously. Conditions are evaluated against a virtual robot state.
// The result is a complete list of actions to replay step-by-step.
//
// This approach is 100% reliable because:
//   - No Promises, no async, no closures
//   - No React state involved during compilation
//   - Steps are just an array — replay is trivial

export interface VirtualState {
  row: number;
  col: number;
  rows: number;
  cols: number;
  wallsH: Set<string>;
  wallsV: Set<string>;
  painted: Set<string>;
}

function vIsFree(vs: VirtualState, dir: "up" | "down" | "left" | "right"): boolean {
  const { row, col } = vs;
  if (dir === "up") {
    if (row === 0) return false;
    return !vs.wallsH.has(`h:${row - 1}:${col}`);
  }
  if (dir === "down") {
    if (row === vs.rows - 1) return false;
    return !vs.wallsH.has(`h:${row}:${col}`);
  }
  if (dir === "left") {
    if (col === 0) return false;
    return !vs.wallsV.has(`v:${row}:${col - 1}`);
  }
  if (dir === "right") {
    if (col === vs.cols - 1) return false;
    return !vs.wallsV.has(`v:${row}:${col}`);
  }
  return false;
}

function vMove(vs: VirtualState, dir: "up" | "down" | "left" | "right"): void {
  if (dir === "up") vs.row--;
  else if (dir === "down") vs.row++;
  else if (dir === "left") vs.col--;
  else if (dir === "right") vs.col++;
}

export interface CompiledStep {
  type: "move" | "paint" | "check" | "loopJump" | "loopEnd" | "useRobot" | "repeatIter" | "ifCheck" | "ifBranch";
  direction?: "up" | "down" | "left" | "right";
  line: number;
  crashed?: boolean;    // true if this move hits a wall
  checkResult?: boolean; // result of condition check
  checkRow?: number;    // position of robot when check was made
  checkCol?: number;
  iterCurrent?: number; // for repeatIter: current iteration (1-based)
  iterTotal?: number;   // for repeatIter: total iterations
}

export interface CompileResult {
  steps: CompiledStep[];
  error?: string;
}

export function compile(ast: ASTNode, initialState: VirtualState, useRobotLine?: number): CompileResult {
  const steps: CompiledStep[] = [];
  // Prepend useRobot step if line is provided
  if (useRobotLine !== undefined) {
    steps.push({ type: "useRobot", line: useRobotLine });
  }
  const vs: VirtualState = {
    row: initialState.row,
    col: initialState.col,
    rows: initialState.rows,
    cols: initialState.cols,
    wallsH: new Set(initialState.wallsH),
    wallsV: new Set(initialState.wallsV),
    painted: new Set(initialState.painted),
  };

  function evalCond(cond: ConditionNode): boolean {
    if (cond.kind === "Check") return vIsFree(vs, cond.direction);
    if (cond.kind === "Not") return !evalCond(cond.operand);
    if (cond.kind === "And") return evalCond(cond.left) && evalCond(cond.right);
    if (cond.kind === "Or") return evalCond(cond.left) || evalCond(cond.right);
    return false;
  }

  function runNode(node: ASTNode): string | null {
    if (steps.length > MAX_STEPS) return "Превышено максимальное количество шагов (10000). Возможно, бесконечный цикл.";

    if (node.kind === "Program") {
      for (const c of node.body) {
        const err = runNode(c);
        if (err) return err;
      }

    } else if (node.kind === "Move") {
      const dir = node.direction;
      if (!vIsFree(vs, dir)) {
        // Record crash step and stop
        steps.push({ type: "move", direction: dir, line: node.line, crashed: true });
        return `Робот врезался в стену! (строка ${node.line})`;
      }
      steps.push({ type: "move", direction: dir, line: node.line });
      vMove(vs, dir);

    } else if (node.kind === "Paint") {
      steps.push({ type: "paint", line: node.line });
      vs.painted.add(`${vs.row}:${vs.col}`);

    } else if (node.kind === "WhileLoop") {
      let iters = 0;
      // Emit check step at loop entry
      const emitLoopCheck = (condNode: typeof node.condition): boolean => {
        const dir = condNode.kind === "Check" ? condNode.direction
          : condNode.kind === "Not" && condNode.operand.kind === "Check" ? condNode.operand.direction
          : undefined;
        const result = evalCond(condNode);
        steps.push({ type: "check", direction: dir, line: node.line, checkResult: result, checkRow: vs.row, checkCol: vs.col });
        return result;
      };
      while (emitLoopCheck(node.condition)) {
        if (++iters > MAX_STEPS) return "Превышено максимальное количество итераций цикла.";
        for (const c of node.body) {
          const err = runNode(c);
          if (err) return err;
        }
        if (steps.length > MAX_STEPS) return "Превышено максимальное количество шагов.";
        // loopJump: jump back to condition check
        steps.push({ type: "loopJump", line: node.line, checkRow: vs.row, checkCol: vs.col });
      }
      // loopEnd: highlight кц line when condition is false (loop exits)
      steps.push({ type: "loopEnd", line: node.endLine });

    } else if (node.kind === "RepeatLoop") {
      for (let i = 0; i < node.count; i++) {
        // repeatIter: show iteration counter on нц N раз line
        steps.push({ type: "repeatIter", line: node.line, iterCurrent: i + 1, iterTotal: node.count });
        for (const c of node.body) {
          const err = runNode(c);
          if (err) return err;
        }
      }

    } else if (node.kind === "IfStatement") {
      const dir = node.condition.kind === "Check" ? node.condition.direction
        : node.condition.kind === "Not" && node.condition.operand.kind === "Check" ? node.condition.operand.direction
        : undefined;
      const condResult = evalCond(node.condition);
      // ifCheck: highlight если line with condition result
      steps.push({ type: "ifCheck", direction: dir, line: node.line, checkResult: condResult, checkRow: vs.row, checkCol: vs.col });
      if (condResult) {
        // ifBranch: highlight то line
        steps.push({ type: "ifBranch", line: node.thenLine });
        for (const c of node.then) {
          const err = runNode(c);
          if (err) return err;
        }
      } else if (node.else) {
        // ifBranch: highlight иначе line
        steps.push({ type: "ifBranch", line: node.elseLine ?? node.thenLine });
        for (const c of node.else) {
          const err = runNode(c);
          if (err) return err;
        }
      }
    }
    return null;
  }

  const error = runNode(ast) ?? undefined;
  return { steps, error };
}
