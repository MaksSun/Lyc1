// ============================================================
// ROBOT GAME PAGE — v22 integration v6
// Design: Dark IDE theme, JetBrains Mono, green accent #00FF88
//
// KEY FIXES v6:
//   - stepMode now uses isStepMode from useGameEngine (no local state mismatch)
//   - insertCommand uses a shared textareaRef passed to ALL CodeEditor instances
//   - Full command list (all directions, loops, conditions, checks)
//   - Save dialog: visibility = "personal" | "class" | "school"
//   - Code editor stays under field in all layouts (no tab switch needed)
//   - Field scrolls if large (overflow: auto)
// ============================================================

import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  Box, Typography, Button, IconButton, Tabs, Tab, Chip,
  TextField, ToggleButton, ToggleButtonGroup, Tooltip,
  Dialog, DialogTitle, DialogContent, DialogActions,
  CircularProgress, Slider, RadioGroup, FormControlLabel, Radio,
  Card, CardContent, CardActions, Divider,
  Select, MenuItem, InputLabel, FormControl,
} from "@mui/material";
import {
  PlayArrow, Stop, Replay, SkipNext, Share,
  History as HistoryIcon, EmojiEvents as EmojiEventsIcon,
  TrendingUp as TrendingUpIcon,
  LibraryBooks as LibraryIcon,
  Save as SaveIcon, Delete as DeleteIcon,
  Public as PublicIcon, Lock as LockIcon, School as SchoolIcon,
  Add as AddIcon, Code as CodeIcon,
  SmartToy as RobotIcon,
  CheckCircle, Cancel, Speed,
  ArrowBack,
} from "@mui/icons-material";

import { useGameEngine, validateUseRobot } from "../../robot/hooks/useGameEngine";
import GameCanvas from "../../robot/components/GameCanvas";
import { LevelDefinition } from "../../robot/lib/gameTypes";
import { BUILT_IN_LEVELS } from "../../robot/lib/levels";
import {
  saveRobotAttempt, getMyRobotAttempts, getRobotLeaderboard,
  getRobotTrends, getRobotLevels, saveRobotLevel, deleteRobotLevel,
  RobotAttemptRecord, LeaderboardItem, TrendItem, RobotLevelRecord,
} from "../../robot/lib/robotApi";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(s: string) {
  try {
    return new Date(s).toLocaleString("ru-RU", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return s; }
}

// ─── Shared styles ─────────────────────────────────────────────────────────────

const mkTabSx = (fontSize = 12) => ({
  minHeight: 44,
  "& .MuiTab-root": { color: "#4B5563", minHeight: 44, fontSize, px: 1.5, py: 0, minWidth: 0 },
  "& .Mui-selected": { color: "#00FF88" },
  "& .MuiTabs-indicator": { bgcolor: "#00FF88" },
});

const CARD_SX = {
  bgcolor: "#111827",
  border: "1px solid #1E2A3A",
  borderRadius: 2,
  mb: 1.5,
};

const BTN_SX = {
  fontFamily: "monospace",
  textTransform: "none" as const,
};

// ─── Code editor with cursor tracking ─────────────────────────────────────────

interface CodeEditorProps {
  value: string;
  onChange: (v: string) => void;
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
  currentLine?: number;
  loopFlashLine?: number | null;
  condFlashLine?: number | null;
  condFlashResult?: boolean | null;
  repeatIterLine?: number | null;
  repeatIterCurrent?: number;
  repeatIterTotal?: number;
  ifFlashLine?: number | null;
  ifBranchLine?: number | null;
  disabled?: boolean;
  minHeight?: number;
  fontSize?: number;
  autoGrow?: boolean;
  onCursorSave?: (pos: number) => void;
}

function CodeEditor({
  value, onChange, textareaRef, currentLine, loopFlashLine, condFlashLine, condFlashResult,
  repeatIterLine, repeatIterCurrent, repeatIterTotal,
  ifFlashLine, ifBranchLine,
  disabled, minHeight = 200, fontSize = 13, autoGrow = false, onCursorSave,
}: CodeEditorProps) {
  const internalRef = useRef<HTMLTextAreaElement>(null);
  const taRef = textareaRef ?? internalRef;
  const overlayRef = useRef<HTMLElement>(null);
  const lineNumRef = useRef<HTMLElement>(null);

  // Sync scroll of overlay and line numbers with textarea
  const handleScroll = useCallback(() => {
    const ta = taRef.current;
    if (!ta) return;
    const scrollTop = ta.scrollTop;
    if (overlayRef.current) overlayRef.current.scrollTop = scrollTop;
    if (lineNumRef.current) lineNumRef.current.scrollTop = scrollTop;
  }, [taRef]);

  // Handle Enter key: auto-indent based on current line
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Enter") return;
    const ta = e.currentTarget;
    const pos = ta.selectionStart;
    const before = ta.value.slice(0, pos);
    const after = ta.value.slice(ta.selectionEnd);
    // Get indent of current line
    const lineStart = before.lastIndexOf("\n") + 1;
    const currentLine = before.slice(lineStart);
    const indent = currentLine.match(/^(\s*)/)?.[1] ?? "";
    // Extra indent after нц / если / то / иначе
    const extraIndent = /\b(нц|если|то|иначе)\b/.test(currentLine) ? "  " : "";
    e.preventDefault();
    const insert = "\n" + indent + extraIndent;
    const newCode = before + insert + after;
    const newPos = pos + insert.length;
    onChange(newCode);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(newPos, newPos);
    });
  }, [onChange]);

  const highlight = (code: string) =>
    code
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/\b(использовать)\b/g, '<span style="color:#818CF8">$1</span>')
      .replace(/\b(Робот)\b/g, '<span style="color:#38BDF8">$1</span>')
      .replace(/\b(нц|кц|пока)\b/g, '<span style="color:#60A5FA">$1</span>')
      .replace(/\b(если|то|иначе|все)\b/g, '<span style="color:#C084FC">$1</span>')
      .replace(/\b(вверх|вниз|влево|вправо|закрасить)\b/g, '<span style="color:#00FF88">$1</span>')
      .replace(/\b(слева|справа|сверху|снизу)\b/g, '<span style="color:#F59E0B">$1</span>')
      .replace(/\b(свободно)\b/g, '<span style="color:#FCD34D">$1</span>')
      .replace(/\b(не|и|или)\b/g, '<span style="color:#A78BFA">$1</span>')
      .replace(/\b(\d+)\b/g, '<span style="color:#FB923C">$1</span>')
      .replace(/\b(раз)\b/g, '<span style="color:#60A5FA">$1</span>')
      .replace(/(\/\/[^\n]*)/g, '<span style="color:#4B5563">$1</span>');

  const lines = value.split("\n");
  const lh = `${fontSize * 1.6}px`;
  const lineHeight = fontSize * 1.6;
  // Auto-grow: compute height from line count
  const computedHeight = autoGrow ? Math.max(minHeight, lines.length * lineHeight + 16) : undefined;

  // Determine line highlight color
  const getLineBg = (lineNum: number) => {
    if (currentLine === lineNum) return "#00FF8818";
    if (condFlashLine === lineNum) return condFlashResult === true ? "#22C55E22" : condFlashResult === false ? "#EF444422" : "#F59E0B18";
    if (ifFlashLine === lineNum) return condFlashResult === true ? "#22C55E22" : condFlashResult === false ? "#EF444422" : "#C084FC18";
    if (ifBranchLine === lineNum) return "#C084FC18";
    if (loopFlashLine === lineNum) return "#F59E0B18";
    if (repeatIterLine === lineNum && (repeatIterCurrent ?? 0) > 0) return "#60A5FA18";
    return "transparent";
  };
  const getLineNumColor = (lineNum: number) => {
    if (currentLine === lineNum) return "#00FF88";
    if (condFlashLine === lineNum) return condFlashResult === true ? "#22C55E" : condFlashResult === false ? "#EF4444" : "#F59E0B";
    if (ifFlashLine === lineNum) return condFlashResult === true ? "#22C55E" : condFlashResult === false ? "#EF4444" : "#C084FC";
    if (ifBranchLine === lineNum) return "#C084FC";
    if (loopFlashLine === lineNum) return "#F59E0B";
    if (repeatIterLine === lineNum && (repeatIterCurrent ?? 0) > 0) return "#60A5FA";
    return "#374151";
  };

  return (
    <Box sx={{ position: "relative", fontFamily: "monospace", fontSize }}>
      {/* Line numbers */}
      <Box ref={lineNumRef} sx={{
        position: "absolute", left: 0, top: 0, bottom: 0, width: 36,
        bgcolor: "#0D1117", borderRight: "1px solid #1E2A3A",
        pt: "8px", pb: "8px", userSelect: "none", zIndex: 2,
        overflow: "scroll", scrollbarWidth: "none", "&::-webkit-scrollbar": { display: "none" },
      }}>
        {lines.map((_, i) => {
          const ln = i + 1;
          const showIter = repeatIterLine === ln && (repeatIterCurrent ?? 0) > 0;
          return (
            <Box key={i} sx={{
              height: lh, lineHeight: lh, textAlign: "right", pr: 1,
              color: getLineNumColor(ln),
              bgcolor: getLineBg(ln),
              transition: "background-color 0.15s, color 0.15s",
              fontSize: fontSize - 2,
              display: "flex", alignItems: "center", justifyContent: "flex-end",
              gap: 0.3,
            }}>
              {showIter && (
                <Box component="span" sx={{
                  fontSize: fontSize - 4, color: "#60A5FA", fontWeight: 700,
                  bgcolor: "#1E3A5F", borderRadius: "3px", px: 0.4, py: 0,
                  lineHeight: 1, whiteSpace: "nowrap",
                }}>
                  {repeatIterCurrent}/{repeatIterTotal}
                </Box>
              )}
              {ln}
            </Box>
          );
        })}
      </Box>
      {/* Line highlight layer (currentLine + condFlashLine + loopFlashLine) */}
      <Box sx={{
        position: "absolute", top: 0, left: 36, right: 0, bottom: 0,
        pointerEvents: "none", zIndex: 0, pt: "8px", pb: "8px",
        overflow: "hidden",
      }}>
        {lines.map((_, i) => (
          <Box key={i} sx={{
            height: lh, lineHeight: lh,
            bgcolor: getLineBg(i + 1),
            transition: "background-color 0.15s",
          }} />
        ))}
      </Box>
      {/* Syntax highlight overlay */}
      <Box
        ref={overlayRef}
        component="pre"
        sx={{
          position: "absolute", top: 0, left: 36, right: 0, bottom: 0,
          m: 0, p: "8px 8px 8px 8px",
          fontFamily: "'JetBrains Mono', monospace", fontSize,
          lineHeight: lh, whiteSpace: "pre-wrap", wordBreak: "break-word",
          color: "#E2E8F0", pointerEvents: "none", zIndex: 1,
          minHeight: computedHeight ?? minHeight,
          height: computedHeight,
          overflow: "scroll", scrollbarWidth: "none", "&::-webkit-scrollbar": { display: "none" },
        }}
        dangerouslySetInnerHTML={{ __html: highlight(value) + "\n" }}
      />
      {/* Textarea */}
      <textarea
        ref={taRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onScroll={handleScroll}
        onKeyDown={handleKeyDown}
        onBlur={(e) => onCursorSave?.(e.currentTarget.selectionStart)}
        onMouseUp={(e) => onCursorSave?.(e.currentTarget.selectionStart)}
        onKeyUp={(e) => onCursorSave?.((e.target as HTMLTextAreaElement).selectionStart)}
        disabled={disabled}
        spellCheck={false}
        style={{
          position: "relative", zIndex: 3,
          display: "block", width: "100%",
          paddingLeft: 44, paddingRight: 8, paddingTop: 8, paddingBottom: 8,
          fontFamily: "'JetBrains Mono', monospace", fontSize,
          lineHeight: lh,
          background: "transparent", color: "transparent",
          caretColor: "#00FF88",
          border: "none", outline: "none", resize: "none",
          minHeight: computedHeight ?? minHeight,
          height: computedHeight,
          maxHeight: autoGrow ? undefined : 500,
          boxSizing: "border-box",
          whiteSpace: "pre-wrap", wordBreak: "break-word",
          overflowY: autoGrow ? "hidden" : "auto",
        }}
      />
    </Box>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function RobotGame() {
  const {
    state, run, stop, reset, nextStep, setSpeed, loadLevel,
    toggleWall, toggleTarget, setRobot, isStepMode,
  } = useGameEngine();

  const [code, setCode] = useState(() => {
    try { return localStorage.getItem("robot_code") || "// Введите программу для робота\n// Пример:\nвправо\nвправо\nзакрасить\n"; } catch { return "// Введите программу для робота\n// Пример:\nвправо\nвправо\nзакрасить\n"; }
  });
  const [editMode, setEditMode] = useState<"none" | "wall_h" | "wall_v" | "target" | "robot">("none");

  // Single shared textarea ref — all CodeEditor instances use this
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Save cursor position on blur so insertCommand works correctly after button click
  const lastCursorRef = useRef<number | null>(null);

  // Tabs
  const [rightTab, setRightTab] = useState(0);
  const [mobileTab, setMobileTab] = useState(0);
  const [tabletTab, setTabletTab] = useState(0);

  // Level selector — persisted in localStorage
  const [selectedLevelId, setSelectedLevelId] = useState<string>(() => {
    try { return localStorage.getItem("robot_level_id") || BUILT_IN_LEVELS[0].id; } catch { return BUILT_IN_LEVELS[0].id; }
  });

  // Share dialog
  const [shareOpen, setShareOpen] = useState(false);
  const [shareURL, setShareURL] = useState("");
  const [levelName, setLevelName] = useState("");

  // History & leaderboard
  const [history, setHistory] = useState<RobotAttemptRecord[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardItem[]>([]);
  const [trends, setTrends] = useState<TrendItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [loadingLeaderboard, setLoadingLeaderboard] = useState(false);
  const [loadingTrends, setLoadingTrends] = useState(false);

  // Level library
  const [libraryLevels, setLibraryLevels] = useState<RobotLevelRecord[]>([]);
  const [loadingLibrary, setLoadingLibrary] = useState(false);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveDesc, setSaveDesc] = useState("");
  // visibility: "personal" | "class" | "school"
  const [saveVisibility, setSaveVisibility] = useState<"personal" | "class" | "school">("personal");
  const [savingLevel, setSavingLevel] = useState(false);

  // Running state (mirrors state.isRunning but also tracks step mode start)
  const runningRef = useRef(false);

  // Window width for responsive layout
  const [winW, setWinW] = useState(window.innerWidth);
  useEffect(() => {
    const h = () => setWinW(window.innerWidth);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);

  const isMobile = winW < 640;
  const isTablet = winW >= 640 && winW < 1100;

  // Load level from URL on mount, or restore from localStorage
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const encoded = params.get("level");
    if (encoded) {
      try {
        const level: LevelDefinition = JSON.parse(atob(encoded));
        loadLevel(level);
        if (level.initialCode) setCode(level.initialCode);
        setSelectedLevelId("__url__");
      } catch { /* ignore */ }
    } else {
      // Restore saved level from localStorage
      const savedId = (() => { try { return localStorage.getItem("robot_level_id"); } catch { return null; } })();
      const savedCode = (() => { try { return localStorage.getItem("robot_code"); } catch { return null; } })();
      const level = BUILT_IN_LEVELS.find((l) => l.id === savedId) || BUILT_IN_LEVELS[0];
      loadLevel(level);
      setSelectedLevelId(level.id);
      if (savedCode !== null) setCode(savedCode);
      else setCode(level.initialCode ?? "");
    }
  }, []);

  // Persist code and level to localStorage on change
  useEffect(() => {
    try { localStorage.setItem("robot_code", code); } catch { /* ignore */ }
  }, [code]);

  useEffect(() => {
    try { localStorage.setItem("robot_level_id", selectedLevelId); } catch { /* ignore */ }
  }, [selectedLevelId]);

  // ─── Insert command at cursor ──────────────────────────────────────────────

  const insertCommand = useCallback((cmd: string) => {
    const ta = textareaRef.current;
    if (!ta) {
      // Fallback: append to end
      setCode((prev) => prev + cmd + "\n");
      return;
    }
    // Use saved cursor position (from blur) or current selectionStart
    const pos = (document.activeElement === ta ? ta.selectionStart : lastCursorRef.current) ?? ta.value.length;
    const before = ta.value.slice(0, pos);
    const after = ta.value.slice(pos);
    // Detect indent of current line
    const lineStart = before.lastIndexOf("\n") + 1;
    const lineIndent = before.slice(lineStart).match(/^(\s*)/)?.[1] ?? "";
    // Multi-line commands: indent each line
    const indented = cmd.split("\n").map((line, i) => (i === 0 ? line : lineIndent + line)).join("\n");
    const insert = indented + "\n";
    const newCode = before + insert + after;
    const newPos = pos + insert.length;
    setCode(newCode);
    // Restore focus and cursor
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(newPos, newPos);
    });
    if (isMobile && mobileTab !== 0) setMobileTab(0);
  }, [isMobile, mobileTab]);

  // ─── Run / Step ───────────────────────────────────────────────────────────

  const startTime = useRef<number>(0);

  const handleRun = useCallback(async (withStep = false) => {
    if (runningRef.current) return;
    runningRef.current = true;
    startTime.current = Date.now();
    if (isMobile) setMobileTab(0); // show field
    try {
      const result = await run(code, withStep);
      const elapsed = Math.round((Date.now() - startTime.current) / 1000);
      const currentLevel = BUILT_IN_LEVELS.find((l) => l.id === selectedLevelId);
      const levelId = selectedLevelId === "__url__" ? "custom:url" : selectedLevelId;
      const levelNameStr = currentLevel?.name ?? "Пользовательский";
      try {
        await saveRobotAttempt({
          level_id: levelId,
          level_name: levelNameStr,
          success: result.success,
          steps: result.stepCount,
          code,
          time_seconds: elapsed,
        });
      } catch { /* offline or not logged in */ }
    } finally {
      runningRef.current = false;
    }
  }, [code, run, selectedLevelId, isMobile]);

  const handleStop = useCallback(() => {
    stop();
    runningRef.current = false;
  }, [stop]);

  const handleReset = useCallback(() => {
    reset();
    runningRef.current = false;
    // Restore initialCode for current level on reset
    const currentLevel = BUILT_IN_LEVELS.find((l) => l.id === selectedLevelId);
    if (currentLevel?.initialCode) {
      setCode(currentLevel.initialCode);
    }
  }, [reset, selectedLevelId]);

  // ─── Level loading ────────────────────────────────────────────────────────

  const handleLoadBuiltIn = (id: string) => {
    const level = BUILT_IN_LEVELS.find((l) => l.id === id);
    if (!level) return;
    setSelectedLevelId(id);
    loadLevel(level);
    setCode(level.initialCode ?? "");
    handleReset();
  };

  const handleLoadLibraryLevel = (rec: RobotLevelRecord) => {
    const level: LevelDefinition = {
      id: `custom:${rec.id}`,
      name: rec.name,
      description: rec.description,
      rows: rec.rows,
      cols: rec.cols,
      robotStart: { row: rec.robot_start_row, col: rec.robot_start_col },
      walls: { horizontal: rec.walls_h, vertical: rec.walls_v },
      targets: rec.targets,
      initialCode: rec.initial_code,
    };
    setSelectedLevelId(`custom:${rec.id}`);
    loadLevel(level);
    setCode(rec.initial_code || "");
    handleReset();
    if (isMobile) setMobileTab(0);
    else if (isTablet) setTabletTab(0);
  };

  // ─── Share ────────────────────────────────────────────────────────────────

  const handleShare = () => {
    const level: LevelDefinition = {
      id: "shared",
      name: levelName || "Мой уровень",
      description: "",
      rows: state.rows,
      cols: state.cols,
      robotStart: { ...state.robotStart },
      walls: {
        horizontal: Array.from(state.walls.horizontal),
        vertical: Array.from(state.walls.vertical),
      },
      targets: Array.from(state.targets),
      initialCode: code,
    };
    const encoded = btoa(JSON.stringify(level));
    const url = `${window.location.origin}${window.location.pathname}?level=${encoded}`;
    setShareURL(url);
    setShareOpen(true);
  };

  // ─── Save to library ──────────────────────────────────────────────────────

  const handleSaveToLibrary = async () => {
    setSavingLevel(true);
    try {
      await saveRobotLevel({
        name: saveName || "Мой уровень",
        description: saveDesc,
        rows: state.rows,
        cols: state.cols,
        robot_start_row: state.robotStart.row,
        robot_start_col: state.robotStart.col,
        walls_h: Array.from(state.walls.horizontal),
        walls_v: Array.from(state.walls.vertical),
        targets: Array.from(state.targets),
        initial_code: code,
        is_public: saveVisibility !== "personal",
        // visibility field sent as extra data — backend can use it
        // @ts-ignore
        visibility: saveVisibility,
      });
      setSaveDialogOpen(false);
      setSaveName(""); setSaveDesc(""); setSaveVisibility("personal");
      loadLibrary();
    } catch { /* ignore */ }
    setSavingLevel(false);
  };

  const handleDeleteLevel = async (id: number) => {
    try {
      await deleteRobotLevel(id);
      setLibraryLevels((prev) => prev.filter((l) => l.id !== id));
    } catch { /* ignore */ }
  };

  // ─── Data loading ─────────────────────────────────────────────────────────

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    try { setHistory(await getMyRobotAttempts()); } catch { /* offline */ }
    setLoadingHistory(false);
  }, []);

  const loadLeaderboard = useCallback(async () => {
    setLoadingLeaderboard(true);
    try { setLeaderboard(await getRobotLeaderboard()); } catch { /* offline */ }
    setLoadingLeaderboard(false);
  }, []);

  const loadTrends = useCallback(async () => {
    setLoadingTrends(true);
    try { setTrends(await getRobotTrends()); } catch { /* offline */ }
    setLoadingTrends(false);
  }, []);

  const loadLibrary = useCallback(async () => {
    setLoadingLibrary(true);
    try { const d = await getRobotLevels(); setLibraryLevels(Array.isArray(d) ? d : []); } catch { /* offline */ }
    setLoadingLibrary(false);
  }, []);

  useEffect(() => {
    if (isMobile) {
      if (mobileTab === 2) loadLibrary();
      if (mobileTab === 3) loadTrends();
      if (mobileTab === 4) loadHistory();
      if (mobileTab === 5) loadLeaderboard();
    } else if (isTablet) {
      if (tabletTab === 1) loadLibrary();
      if (tabletTab === 2) loadTrends();
      if (tabletTab === 3) loadHistory();
      if (tabletTab === 4) loadLeaderboard();
    } else {
      if (rightTab === 0) loadLibrary();
      if (rightTab === 1) loadTrends();
      if (rightTab === 2) loadHistory();
      if (rightTab === 3) loadLeaderboard();
    }
  }, [mobileTab, tabletTab, rightTab, isMobile, isTablet]);

  // ─── Command buttons — full list ──────────────────────────────────────────

  const COMMANDS = [
    // Basic moves
    { label: "↑ вверх", cmd: "вверх", group: "move" },
    { label: "↓ вниз", cmd: "вниз", group: "move" },
    { label: "← влево", cmd: "влево", group: "move" },
    { label: "→ вправо", cmd: "вправо", group: "move" },
    { label: "✦ закрасить", cmd: "закрасить", group: "move" },
    // While loops
    { label: "нц пока свободно →", cmd: "нц пока справа свободно\n  вправо\nкц", group: "loop" },
    { label: "нц пока свободно ↑", cmd: "нц пока сверху свободно\n  вверх\nкц", group: "loop" },
    { label: "нц пока свободно ↓", cmd: "нц пока снизу свободно\n  вниз\nкц", group: "loop" },
    { label: "нц пока свободно ←", cmd: "нц пока слева свободно\n  влево\nкц", group: "loop" },
    { label: "нц N раз", cmd: "нц 3 раз\n  вправо\nкц", group: "loop" },
    // Conditionals
    { label: "если справа свободно", cmd: "если справа свободно то\n  вправо\nиначе\n  вниз\nвсе", group: "cond" },
    { label: "если слева свободно", cmd: "если слева свободно то\n  влево\nиначе\n  вниз\nвсе", group: "cond" },
    { label: "если сверху свободно", cmd: "если сверху свободно то\n  вверх\nиначе\n  вправо\nвсе", group: "cond" },
    { label: "если снизу свободно", cmd: "если снизу свободно то\n  вниз\nиначе\n  вправо\nвсе", group: "cond" },
    // Checks (for manual use inside loops/ifs)
    { label: "справа свободно", cmd: "справа свободно", group: "check" },
    { label: "слева свободно", cmd: "слева свободно", group: "check" },
    { label: "сверху свободно", cmd: "сверху свободно", group: "check" },
    { label: "снизу свободно", cmd: "снизу свободно", group: "check" },
    { label: "не справа свободно", cmd: "не справа свободно", group: "check" },
    { label: "не слева свободно", cmd: "не слева свободно", group: "check" },
    // Logical
    { label: "и", cmd: "и", group: "logic" },
    { label: "или", cmd: "или", group: "logic" },
    { label: "не", cmd: "не", group: "logic" },
  ];

  const GROUP_COLORS: Record<string, { color: string; border: string }> = {
    move:  { color: "#00FF88", border: "#00FF8840" },
    loop:  { color: "#60A5FA", border: "#60A5FA40" },
    cond:  { color: "#C084FC", border: "#C084FC40" },
    check: { color: "#F59E0B", border: "#F59E0B40" },
    logic: { color: "#A78BFA", border: "#A78BFA40" },
  };

  const CommandButtons = ({ size = "small", fs = 11 }: { size?: "small" | "medium"; fs?: number }) => (
    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
      {COMMANDS.map(({ label, cmd, group }) => {
        const gc = GROUP_COLORS[group] ?? { color: "#94A3B8", border: "#1E2A3A" };
        return (
          <Button
            key={label}
            size={size}
            variant="outlined"
            onClick={() => insertCommand(cmd)}
            disabled={state.isRunning}
            sx={{
              ...BTN_SX, fontSize: fs, py: size === "medium" ? 0.6 : 0.3, px: size === "medium" ? 1.2 : 0.8,
              color: gc.color, borderColor: gc.border,
              "&:hover": { borderColor: gc.color, bgcolor: `${gc.color}10` },
            }}
          >
            {label}
          </Button>
        );
      })}
    </Box>
  );

  // ─── Run controls ─────────────────────────────────────────────────────────

  const RunControls = ({ compact = false }: { compact?: boolean }) => {
    const btnSize = compact ? "small" : "medium";
    const btnFs = compact ? 12 : 14;
    return (
      <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
        {/* Normal run */}
        {!state.isRunning && (
          <Button variant="contained" size={btnSize} startIcon={<PlayArrow />}
            onClick={() => handleRun(false)}
            sx={{ ...BTN_SX, bgcolor: "#00FF88", color: "#0D1117", fontWeight: 700, fontSize: btnFs,
              "&:hover": { bgcolor: "#00CC6A" } }}>
            Запустить
          </Button>
        )}

        {/* Step-by-step run */}
        {!state.isRunning && (
          <Tooltip title="Пошагово — нажимайте «Шаг» для каждого действия">
            <Button variant="outlined" size={btnSize} startIcon={<SkipNext />}
              onClick={() => handleRun(true)}
              sx={{ ...BTN_SX, color: "#FFB800", borderColor: "#FFB800", fontSize: btnFs,
                "&:hover": { bgcolor: "#FFB80015", borderColor: "#FFD700" } }}>
              Пошагово
            </Button>
          </Tooltip>
        )}

        {/* Step advance button — shown while step mode is active */}
        {state.isRunning && isStepMode && (
          <Button variant="contained" size={btnSize} startIcon={<SkipNext />}
            onClick={nextStep}
            sx={{
              ...BTN_SX, bgcolor: "#FFB800", color: "#0D1117", fontWeight: 700, fontSize: btnFs,
              animation: "stepPulse 0.8s ease-in-out infinite",
              "@keyframes stepPulse": {
                "0%,100%": { boxShadow: "0 0 0 0 rgba(255,184,0,0.5)" },
                "50%": { boxShadow: "0 0 0 8px rgba(255,184,0,0)" },
              },
              "&:hover": { bgcolor: "#FFD700" },
            }}>
            Шаг →
          </Button>
        )}

        {/* Stop */}
        {state.isRunning && (
          <Button variant="outlined" size={btnSize} startIcon={<Stop />}
            onClick={handleStop}
            sx={{ ...BTN_SX, color: "#EF4444", borderColor: "#EF4444", fontSize: btnFs }}>
            Стоп
          </Button>
        )}

        {/* Reset */}
        <Button variant="outlined" size={btnSize} startIcon={<Replay />}
          onClick={handleReset} disabled={state.isRunning}
          sx={{ ...BTN_SX, color: "#94A3B8", borderColor: "#1E2A3A", fontSize: btnFs }}>
          Сброс
        </Button>

        <Tooltip title="Поделиться уровнем">
          <IconButton size={btnSize} onClick={handleShare} sx={{ color: "#60A5FA" }}>
            <Share fontSize={compact ? "small" : "medium"} />
          </IconButton>
        </Tooltip>

        <Tooltip title="Сохранить в библиотеку">
          <IconButton size={btnSize} onClick={() => setSaveDialogOpen(true)} sx={{ color: "#A78BFA" }}>
            <SaveIcon fontSize={compact ? "small" : "medium"} />
          </IconButton>
        </Tooltip>
      </Box>
    );
  };

  // ─── Status bar ───────────────────────────────────────────────────────────

  // Warn if first real line is not "использовать Робот"
  const useRobotWarning = !state.isRunning ? validateUseRobot(code) : null;

  const StatusBar = () => (
    <Box sx={{
      display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap",
      px: 1.5, py: 0.75, bgcolor: "#080D14", borderTop: "1px solid #1E2A3A",
      minHeight: 34,
    }}>
      {state.isRunning && !isStepMode && (
        <Chip label="▶ Выполняется" size="small"
          sx={{ bgcolor: "#00FF8820", color: "#00FF88", fontFamily: "monospace", fontSize: 11, height: 22 }} />
      )}
      {state.isRunning && isStepMode && (
        <Chip label={`⏸ Пошаговый режим — шаг ${state.stepCount}${state.tickCount > 0 ? ` · тиков ${state.tickCount}` : ""}`} size="small"
          sx={{ bgcolor: "#FFB80020", color: "#FFB800", fontFamily: "monospace", fontSize: 11, height: 22 }} />
      )}
      {state.message && !state.isRunning && (
        <Chip
          label={state.message}
          size="small"
          icon={state.message.startsWith("✅") ? <CheckCircle sx={{ fontSize: 13 }} /> : <Cancel sx={{ fontSize: 13 }} />}
          sx={{
            bgcolor: state.message.startsWith("✅") ? "#00FF8820" : "#FFB80020",
            color: state.message.startsWith("✅") ? "#00FF88" : "#FFB800",
            fontFamily: "monospace", fontSize: 11, height: 22,
          }}
        />
      )}
      {state.error && (
        <Chip label={`⚠ ${state.error}`} size="small"
          sx={{ bgcolor: "#EF444420", color: "#EF4444", fontFamily: "monospace", fontSize: 11, height: 22, maxWidth: 340 }} />
      )}
      {state.stepCount > 0 && (
        <Chip label={`${state.stepCount} шагов`} size="small"
          sx={{ bgcolor: "#1E2A3A", color: "#94A3B8", fontFamily: "monospace", fontSize: 11, height: 22 }} />
      )}
      {state.tickCount > 0 && (
        <Chip label={`${state.tickCount} тиков`} size="small"
          sx={{ bgcolor: "#1E2A3A", color: "#60A5FA", fontFamily: "monospace", fontSize: 11, height: 22 }} />
      )}
      {state.isRunning && state.currentLine > 0 && (
        <Chip label={`строка ${state.currentLine}`} size="small"
          sx={{ bgcolor: "#00FF8820", color: "#00FF88", fontFamily: "monospace", fontSize: 11, height: 22 }} />
      )}
      {useRobotWarning && (
        <Chip label={`⚠ ${useRobotWarning}`} size="small"
          sx={{ bgcolor: "#F59E0B20", color: "#F59E0B", fontFamily: "monospace", fontSize: 11, height: 22, maxWidth: 400 }} />
      )}
    </Box>
  );

  // ─── Field settings ───────────────────────────────────────────────────────

  const FieldSettings = ({ compact = false }: { compact?: boolean }) => (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
      <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
        <FormControl size="small" sx={{ minWidth: compact ? 130 : 160 }}>
          <InputLabel sx={{ color: "#374151", fontSize: 12 }}>Задание</InputLabel>
          <Select
            value={selectedLevelId}
            label="Задание"
            onChange={(e) => handleLoadBuiltIn(e.target.value)}
            disabled={state.isRunning}
            sx={{
              color: "#E2E8F0", fontFamily: "monospace", fontSize: 12,
              "& .MuiOutlinedInput-notchedOutline": { borderColor: "#1E2A3A" },
              "& .MuiSvgIcon-root": { color: "#374151" },
            }}
          >
            {BUILT_IN_LEVELS.map((l) => (
              <MenuItem key={l.id} value={l.id} sx={{ fontFamily: "monospace", fontSize: 12 }}>
                {l.name}
              </MenuItem>
            ))}
            {selectedLevelId === "__url__" && (
              <MenuItem value="__url__" sx={{ fontFamily: "monospace", fontSize: 12 }}>Из ссылки</MenuItem>
            )}
          </Select>
        </FormControl>

        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <Speed sx={{ fontSize: 14, color: "#374151" }} />
          <Slider
            value={state.speed}
            min={50} max={1000} step={50}
            onChange={(_, v) => setSpeed(v as number)}
            disabled={state.isRunning}
            sx={{ width: 70, color: "#00FF88", "& .MuiSlider-thumb": { width: 12, height: 12 } }}
          />
          <Typography variant="caption" sx={{ color: "#374151", fontFamily: "monospace", fontSize: 10 }}>
            {state.speed}мс
          </Typography>
        </Box>
      </Box>

      {/* Edit toolbar */}
      <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
        <Typography variant="caption" sx={{ color: "#374151", fontSize: 11 }}>Редактор:</Typography>
        <ToggleButtonGroup value={editMode} exclusive onChange={(_, v) => setEditMode(v || "none")}
          size="small" disabled={state.isRunning}
          sx={{
            "& .MuiToggleButton-root": { color: "#4B5563", borderColor: "#1E2A3A", py: 0.3, px: compact ? 0.8 : 1, fontSize: 11 },
            "& .Mui-selected": { color: "#00FF88", bgcolor: "#00FF8811 !important" },
          }}>
          <ToggleButton value="wall_h">─ Стена ─</ToggleButton>
          <ToggleButton value="wall_v">│ Стена │</ToggleButton>
          <ToggleButton value="target">★ Цель</ToggleButton>
          <ToggleButton value="robot">🤖 Старт</ToggleButton>
        </ToggleButtonGroup>
      </Box>
    </Box>
  );

  // ─── Field + code below (shared component) ────────────────────────────────

  const FieldWithCode = ({ showSettings = true, codeHeight = 180 }: { showSettings?: boolean; codeHeight?: number }) => (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5, p: 1.5 }}>
      {showSettings && <FieldSettings />}

      {/* Canvas — scrollable if field is large */}
      <Box sx={{ overflow: "auto", maxWidth: "100%", height: state.rows > 20 ? 400 : "auto" }}>
        <GameCanvas
          state={state}
          editMode={editMode}
          onToggleWall={toggleWall}
          onToggleTarget={toggleTarget}
          onSetRobot={setRobot}
        />
      </Box>

      {/* Legend */}
      <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
        {[["#00FF88", "Робот"], ["#FFB800", "Закрашено"], ["#7C3AED", "Цель (★)"], ["#EF4444", "Стена"]].map(([c, l]) => (
          <Box key={l} sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
            <Box sx={{ width: 12, height: 12, bgcolor: c, borderRadius: 0.5 }} />
            <Typography variant="caption" sx={{ color: "#374151", fontSize: 11 }}>{l}</Typography>
          </Box>
        ))}
      </Box>

      {/* Code editor directly under field — no tab switch needed */}
      <Box sx={{ borderTop: "1px solid #1E2A3A", pt: 1 }}>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 0.5, px: 0.5 }}>
          <Typography variant="caption" sx={{ color: "#374151", fontFamily: "monospace", fontSize: 11 }}>
            Код программы:
          </Typography>
          {state.isRunning && isStepMode && (
            <Button size="small" variant="contained" startIcon={<SkipNext />}
              onClick={nextStep}
              sx={{
                ...BTN_SX, bgcolor: "#FFB800", color: "#0D1117", fontWeight: 700, fontSize: 11, py: 0.2,
                animation: "stepPulse 0.8s ease-in-out infinite",
                "@keyframes stepPulse": {
                  "0%,100%": { boxShadow: "0 0 0 0 rgba(255,184,0,0.5)" },
                  "50%": { boxShadow: "0 0 0 6px rgba(255,184,0,0)" },
                },
              }}>
              Шаг →
            </Button>
          )}
        </Box>
        <Box sx={{ mb: 0.5 }}>
          <CommandButtons />
        </Box>
        <Box sx={{ bgcolor: "#080D14", borderRadius: 1, border: "1px solid #1E2A3A" }}>
          <CodeEditor
            value={code}
            onChange={setCode}
            textareaRef={textareaRef}
            currentLine={state.currentLine}
            loopFlashLine={state.loopFlashLine}
            condFlashLine={state.condFlashLine}
            condFlashResult={state.condFlashResult}
            repeatIterLine={state.repeatIterLine}
            repeatIterCurrent={state.repeatIterCurrent}
            repeatIterTotal={state.repeatIterTotal}
            ifFlashLine={state.ifFlashLine}
            ifBranchLine={state.ifBranchLine}
            disabled={state.isRunning}
            minHeight={codeHeight}
            fontSize={12}
            autoGrow
            onCursorSave={(pos) => { lastCursorRef.current = pos; }}
          />
        </Box>
      </Box>
    </Box>
  );

  // ─── Library panel ────────────────────────────────────────────────────────

  const LibraryPanel = () => (
    <Box sx={{ p: 1.5 }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1.5 }}>
        <Typography sx={{ color: "#E2E8F0", fontFamily: "monospace", fontSize: 13, fontWeight: 700 }}>
          📚 Библиотека уровней
        </Typography>
        <Button size="small" startIcon={<AddIcon />} onClick={() => setSaveDialogOpen(true)}
          sx={{ ...BTN_SX, color: "#00FF88", borderColor: "#00FF88", fontSize: 11 }} variant="outlined">
          Сохранить текущий
        </Button>
      </Box>
      {loadingLibrary ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
          <CircularProgress size={24} sx={{ color: "#00FF88" }} />
        </Box>
      ) : libraryLevels.length === 0 ? (
        <Typography sx={{ color: "#374151", fontFamily: "monospace", fontSize: 12, textAlign: "center", py: 4 }}>
          Библиотека пуста. Создайте уровень и сохраните его!
        </Typography>
      ) : (
        libraryLevels.map((lvl) => (
          <Card key={lvl.id} sx={CARD_SX}>
            <CardContent sx={{ pb: 0.5 }}>
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <Box>
                  <Typography sx={{ color: "#E2E8F0", fontFamily: "monospace", fontSize: 13, fontWeight: 700 }}>
                    {lvl.name}
                  </Typography>
                  {lvl.description && (
                    <Typography sx={{ color: "#94A3B8", fontFamily: "monospace", fontSize: 11, mt: 0.3 }}>
                      {lvl.description}
                    </Typography>
                  )}
                  <Box sx={{ display: "flex", gap: 0.5, mt: 0.5, flexWrap: "wrap" }}>
                    <Chip label={`${lvl.rows}×${lvl.cols}`} size="small"
                      sx={{ bgcolor: "#1E2A3A", color: "#94A3B8", fontSize: 10, height: 18 }} />
                    <Chip label={`${lvl.run_count} запусков`} size="small"
                      sx={{ bgcolor: "#1E2A3A", color: "#60A5FA", fontSize: 10, height: 18 }} />
                    {lvl.is_public
                      ? <Chip icon={<PublicIcon sx={{ fontSize: 10 }} />} label="Публичный" size="small"
                          sx={{ bgcolor: "#00FF8815", color: "#00FF88", fontSize: 10, height: 18 }} />
                      : <Chip icon={<LockIcon sx={{ fontSize: 10 }} />} label="Личный" size="small"
                          sx={{ bgcolor: "#1E2A3A", color: "#374151", fontSize: 10, height: 18 }} />
                    }
                    <Chip label={lvl.author_name} size="small"
                      sx={{ bgcolor: "#1E2A3A", color: "#94A3B8", fontSize: 10, height: 18 }} />
                  </Box>
                </Box>
              </Box>
            </CardContent>
            <CardActions sx={{ pt: 0.5, pb: 1, px: 1.5 }}>
              <Button size="small" onClick={() => handleLoadLibraryLevel(lvl)}
                sx={{ ...BTN_SX, color: "#00FF88", fontSize: 11 }}>
                Загрузить
              </Button>
              <IconButton size="small" onClick={() => handleDeleteLevel(lvl.id)} sx={{ color: "#EF4444", ml: "auto" }}>
                <DeleteIcon fontSize="small" />
              </IconButton>
            </CardActions>
          </Card>
        ))
      )}
    </Box>
  );

  // ─── Trends panel ─────────────────────────────────────────────────────────

  const TrendsPanel = () => (
    <Box sx={{ p: 1.5 }}>
      <Typography sx={{ color: "#E2E8F0", fontFamily: "monospace", fontSize: 13, fontWeight: 700, mb: 1.5 }}>
        🔥 Тренды класса
      </Typography>
      {loadingTrends ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
          <CircularProgress size={24} sx={{ color: "#00FF88" }} />
        </Box>
      ) : trends.length === 0 ? (
        <Typography sx={{ color: "#374151", fontFamily: "monospace", fontSize: 12, textAlign: "center", py: 4 }}>
          Пока нет данных. Запустите несколько программ!
        </Typography>
      ) : (
        trends.map((t, i) => {
          const successRate = t.total_runs > 0 ? Math.round((t.success_runs / t.total_runs) * 100) : 0;
          const medalColor = ["#FFB800", "#94A3B8", "#CD7F32"][i] ?? "#374151";
          return (
            <Card key={t.level_id} sx={{ ...CARD_SX, borderLeft: i < 3 ? `3px solid ${medalColor}` : "1px solid #1E2A3A" }}>
              <CardContent sx={{ pb: "8px !important" }}>
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <Typography sx={{ color: medalColor, fontFamily: "monospace", fontSize: 16, fontWeight: 900, minWidth: 24 }}>
                      #{i + 1}
                    </Typography>
                    <Box>
                      <Typography sx={{ color: "#E2E8F0", fontFamily: "monospace", fontSize: 12, fontWeight: 700 }}>
                        {t.level_name}
                      </Typography>
                      <Typography sx={{ color: "#374151", fontFamily: "monospace", fontSize: 10 }}>
                        {t.unique_students} учеников · ср. {t.avg_steps} шагов
                      </Typography>
                    </Box>
                  </Box>
                  <Box sx={{ textAlign: "right" }}>
                    <Typography sx={{ color: "#60A5FA", fontFamily: "monospace", fontSize: 16, fontWeight: 900 }}>
                      {t.total_runs}
                    </Typography>
                    <Typography sx={{ color: "#374151", fontFamily: "monospace", fontSize: 10 }}>запусков</Typography>
                  </Box>
                </Box>
                <Box sx={{ mt: 1, height: 4, bgcolor: "#1E2A3A", borderRadius: 2, overflow: "hidden" }}>
                  <Box sx={{ height: "100%", width: `${successRate}%`, bgcolor: "#00FF88", borderRadius: 2, transition: "width 0.5s" }} />
                </Box>
                <Typography sx={{ color: "#374151", fontFamily: "monospace", fontSize: 10, mt: 0.3 }}>
                  {successRate}% выполнено ({t.success_runs}/{t.total_runs})
                </Typography>
              </CardContent>
            </Card>
          );
        })
      )}
    </Box>
  );

  // ─── History panel ────────────────────────────────────────────────────────

  const HistoryPanel = () => (
    <Box sx={{ p: 1.5 }}>
      <Typography sx={{ color: "#E2E8F0", fontFamily: "monospace", fontSize: 13, fontWeight: 700, mb: 1.5 }}>
        📋 Мои попытки
      </Typography>
      {loadingHistory ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
          <CircularProgress size={24} sx={{ color: "#00FF88" }} />
        </Box>
      ) : history.length === 0 ? (
        <Typography sx={{ color: "#374151", fontFamily: "monospace", fontSize: 12, textAlign: "center", py: 4 }}>
          Пока нет попыток. Запустите программу!
        </Typography>
      ) : (
        history.map((h) => (
          <Card key={h.id} sx={CARD_SX}>
            <CardContent sx={{ pb: "8px !important" }}>
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <Box>
                  <Typography sx={{ color: "#E2E8F0", fontFamily: "monospace", fontSize: 12, fontWeight: 700 }}>
                    {h.level_name}
                  </Typography>
                  <Typography sx={{ color: "#374151", fontFamily: "monospace", fontSize: 10 }}>
                    {fmtDate(h.created_at)}
                  </Typography>
                </Box>
                <Box sx={{ textAlign: "right" }}>
                  <Chip
                    label={h.success ? "✅ Выполнено" : "❌ Не выполнено"}
                    size="small"
                    sx={{
                      bgcolor: h.success ? "#00FF8820" : "#EF444420",
                      color: h.success ? "#00FF88" : "#EF4444",
                      fontFamily: "monospace", fontSize: 10, height: 20,
                    }}
                  />
                  <Typography sx={{ color: "#94A3B8", fontFamily: "monospace", fontSize: 10, mt: 0.3 }}>
                    {h.steps} шагов · {h.time_seconds}с
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        ))
      )}
    </Box>
  );

  // ─── Leaderboard panel ────────────────────────────────────────────────────

  const LeaderboardPanel = () => {
    const byLevel: Record<string, LeaderboardItem[]> = {};
    for (const item of leaderboard) {
      if (!byLevel[item.level_id]) byLevel[item.level_id] = [];
      byLevel[item.level_id].push(item);
    }
    return (
      <Box sx={{ p: 1.5 }}>
        <Typography sx={{ color: "#E2E8F0", fontFamily: "monospace", fontSize: 13, fontWeight: 700, mb: 1.5 }}>
          🏆 Рейтинг класса
        </Typography>
        {loadingLeaderboard ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
            <CircularProgress size={24} sx={{ color: "#00FF88" }} />
          </Box>
        ) : Object.keys(byLevel).length === 0 ? (
          <Typography sx={{ color: "#374151", fontFamily: "monospace", fontSize: 12, textAlign: "center", py: 4 }}>
            Пока нет успешных прохождений. Станьте первым!
          </Typography>
        ) : (
          Object.entries(byLevel).map(([levelId, items]) => (
            <Box key={levelId} sx={{ mb: 2 }}>
              <Typography sx={{ color: "#60A5FA", fontFamily: "monospace", fontSize: 12, fontWeight: 700, mb: 0.5 }}>
                {items[0].level_name}
              </Typography>
              {items.slice(0, 5).map((item, i) => (
                <Box key={`${item.student_name}-${i}`} sx={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  px: 1.5, py: 0.5, mb: 0.3,
                  bgcolor: i === 0 ? "#FFB80010" : "#111827",
                  borderRadius: 1, border: "1px solid #1E2A3A",
                }}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <Typography sx={{ color: i === 0 ? "#FFB800" : "#374151", fontFamily: "monospace", fontSize: 12, fontWeight: 700, minWidth: 20 }}>
                      {["🥇", "🥈", "🥉"][i] ?? `${i + 1}.`}
                    </Typography>
                    <Typography sx={{ color: "#E2E8F0", fontFamily: "monospace", fontSize: 12 }}>
                      {item.student_name}
                    </Typography>
                    {item.class_name && (
                      <Typography sx={{ color: "#374151", fontFamily: "monospace", fontSize: 10 }}>
                        ({item.class_name})
                      </Typography>
                    )}
                  </Box>
                  <Box sx={{ textAlign: "right" }}>
                    <Typography sx={{ color: "#00FF88", fontFamily: "monospace", fontSize: 12, fontWeight: 700 }}>
                      {item.best_steps} шагов
                    </Typography>
                    <Typography sx={{ color: "#374151", fontFamily: "monospace", fontSize: 10 }}>
                      {item.attempts_count} попыток
                    </Typography>
                  </Box>
                </Box>
              ))}
              <Divider sx={{ borderColor: "#1E2A3A", mt: 1 }} />
            </Box>
          ))
        )}
      </Box>
    );
  };

  // ─── Dialogs ──────────────────────────────────────────────────────────────

  const SaveDialog = () => (
    <Dialog open={saveDialogOpen} onClose={() => setSaveDialogOpen(false)} maxWidth="sm" fullWidth
      PaperProps={{ sx: { bgcolor: "#111827", border: "1px solid #1E2A3A", borderRadius: 2 } }}>
      <DialogTitle sx={{ color: "#E2E8F0", fontFamily: "monospace" }}>💾 Сохранить уровень в библиотеку</DialogTitle>
      <DialogContent>
        <TextField label="Название" value={saveName} onChange={(e) => setSaveName(e.target.value)}
          fullWidth size="small" sx={{ mb: 2, mt: 1 }}
          InputLabelProps={{ sx: { color: "#94A3B8" } }}
          InputProps={{ sx: { color: "#E2E8F0", fontFamily: "monospace" } }} />
        <TextField label="Описание (необязательно)" value={saveDesc} onChange={(e) => setSaveDesc(e.target.value)}
          fullWidth size="small" multiline rows={2} sx={{ mb: 2 }}
          InputLabelProps={{ sx: { color: "#94A3B8" } }}
          InputProps={{ sx: { color: "#E2E8F0", fontFamily: "monospace" } }} />

        <Typography sx={{ color: "#94A3B8", fontSize: 12, fontFamily: "monospace", mb: 0.5 }}>
          Видимость:
        </Typography>
        <RadioGroup value={saveVisibility} onChange={(e) => setSaveVisibility(e.target.value as "personal" | "class" | "school")}>
          <FormControlLabel value="personal" control={<Radio size="small" sx={{ color: "#374151", "&.Mui-checked": { color: "#00FF88" } }} />}
            label={
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                <LockIcon sx={{ fontSize: 14, color: "#374151" }} />
                <Typography sx={{ color: "#94A3B8", fontSize: 12, fontFamily: "monospace" }}>Только я</Typography>
              </Box>
            } />
          <FormControlLabel value="class" control={<Radio size="small" sx={{ color: "#374151", "&.Mui-checked": { color: "#00FF88" } }} />}
            label={
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                <PublicIcon sx={{ fontSize: 14, color: "#60A5FA" }} />
                <Typography sx={{ color: "#94A3B8", fontSize: 12, fontFamily: "monospace" }}>Виден моему классу</Typography>
              </Box>
            } />
          <FormControlLabel value="school" control={<Radio size="small" sx={{ color: "#374151", "&.Mui-checked": { color: "#00FF88" } }} />}
            label={
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                <SchoolIcon sx={{ fontSize: 14, color: "#A78BFA" }} />
                <Typography sx={{ color: "#94A3B8", fontSize: 12, fontFamily: "monospace" }}>Виден всей школе</Typography>
              </Box>
            } />
        </RadioGroup>

        <Typography sx={{ color: "#374151", fontSize: 11, fontFamily: "monospace", mt: 1.5 }}>
          Поле: {state.rows}×{state.cols} · Стен: {state.walls.horizontal.size + state.walls.vertical.size} · Целей: {state.targets.size}
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleSaveToLibrary} disabled={savingLevel}
          sx={{ ...BTN_SX, color: "#00FF88" }}>
          {savingLevel ? <CircularProgress size={16} /> : "Сохранить"}
        </Button>
        <Button onClick={() => setSaveDialogOpen(false)} sx={{ ...BTN_SX, color: "#94A3B8" }}>Отмена</Button>
      </DialogActions>
    </Dialog>
  );

  const ShareDialog = () => (
    <Dialog open={shareOpen} onClose={() => setShareOpen(false)} maxWidth="sm" fullWidth
      PaperProps={{ sx: { bgcolor: "#111827", border: "1px solid #1E2A3A", borderRadius: 2 } }}>
      <DialogTitle sx={{ color: "#E2E8F0", fontFamily: "monospace" }}>📤 Поделиться уровнем</DialogTitle>
      <DialogContent>
        <TextField label="Название уровня" value={levelName} onChange={(e) => setLevelName(e.target.value)}
          fullWidth size="small" sx={{ mb: 2, mt: 1 }}
          InputLabelProps={{ sx: { color: "#94A3B8" } }}
          InputProps={{ sx: { color: "#E2E8F0", fontFamily: "monospace" } }} />
        <TextField label="Ссылка" value={shareURL} fullWidth size="small" multiline rows={3}
          InputProps={{ readOnly: true, sx: { color: "#00FF88", fontFamily: "monospace", fontSize: 11 } }} />
      </DialogContent>
      <DialogActions>
        <Button onClick={() => navigator.clipboard.writeText(shareURL).catch(() => {})}
          sx={{ ...BTN_SX, color: "#00FF88" }}>Скопировать</Button>
        <Button onClick={() => setShareOpen(false)} sx={{ ...BTN_SX, color: "#94A3B8" }}>Закрыть</Button>
      </DialogActions>
    </Dialog>
  );

  // ─── MOBILE LAYOUT (< 640px) ──────────────────────────────────────────────

  if (isMobile) {
    return (
      <Box sx={{ height: "100dvh", display: "flex", flexDirection: "column", bgcolor: "#0D1117", overflow: "hidden" }}>
        {/* Header */}
        <Box sx={{ px: 1.5, py: 1, bgcolor: "#080D14", borderBottom: "1px solid #1E2A3A", display: "flex", alignItems: "center", gap: 1 }}>
          <Tooltip title="Назад">
            <IconButton size="small" onClick={() => window.history.back()}
              sx={{ color: "#94A3B8", "&:hover": { color: "#E2E8F0", bgcolor: "#1E2A3A" } }}>
              <ArrowBack sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
          <RobotIcon sx={{ color: "#00FF88", fontSize: 20 }} />
          <Typography sx={{ color: "#E2E8F0", fontFamily: "monospace", fontSize: 14, fontWeight: 700, flex: 1 }}>
            Робот-Исполнитель
          </Typography>
          {/* Step button in header when step mode active */}
          {state.isRunning && isStepMode && (
            <Button size="small" variant="contained" startIcon={<SkipNext />} onClick={nextStep}
              sx={{
                ...BTN_SX, bgcolor: "#FFB800", color: "#0D1117", fontWeight: 700, fontSize: 12, py: 0.4,
                animation: "stepPulse 0.8s ease-in-out infinite",
                "@keyframes stepPulse": {
                  "0%,100%": { boxShadow: "0 0 0 0 rgba(255,184,0,0.5)" },
                  "50%": { boxShadow: "0 0 0 6px rgba(255,184,0,0)" },
                },
              }}>
              Шаг →
            </Button>
          )}
          {!state.isRunning && (
            <>
              <Button size="small" variant="contained" onClick={() => handleRun(false)}
                sx={{ ...BTN_SX, bgcolor: "#00FF88", color: "#0D1117", fontWeight: 700, fontSize: 12, py: 0.4 }}>
                ▶
              </Button>
              <Button size="small" variant="outlined" onClick={() => handleRun(true)}
                sx={{ ...BTN_SX, color: "#FFB800", borderColor: "#FFB800", fontSize: 12, py: 0.4 }}>
                ⏭
              </Button>
            </>
          )}
          {state.isRunning && !isStepMode && (
            <Button size="small" variant="outlined" onClick={handleStop}
              sx={{ ...BTN_SX, color: "#EF4444", borderColor: "#EF4444", fontSize: 12, py: 0.4 }}>
              ■
            </Button>
          )}
          <IconButton size="small" onClick={handleReset} disabled={state.isRunning} sx={{ color: "#94A3B8" }}>
            <Replay fontSize="small" />
          </IconButton>
          <IconButton size="small" onClick={() => setSaveDialogOpen(true)} sx={{ color: "#A78BFA" }}>
            <SaveIcon fontSize="small" />
          </IconButton>
          <IconButton size="small" onClick={handleShare} sx={{ color: "#60A5FA" }}>
            <Share fontSize="small" />
          </IconButton>
        </Box>

        <StatusBar />

        {/* Tab content */}
        <Box sx={{ flex: 1, overflow: "auto" }}>
          {mobileTab === 0 && (
            <Box>
              <Box sx={{ p: 1.5 }}>
                <FieldSettings compact />
              </Box>
              {/* Canvas with scroll */}
              <Box sx={{ px: 1.5, pb: 0.5, overflow: "auto", height: state.rows > 20 ? 350 : "auto" }}>
                <GameCanvas state={state} editMode={editMode} onToggleWall={toggleWall} onToggleTarget={toggleTarget} onSetRobot={setRobot} />
              </Box>
              {/* Code directly under field */}
              <Box sx={{ px: 1.5, pb: 1.5 }}>
                <Box sx={{ display: "flex", gap: 0.5, mb: 0.5, flexWrap: "wrap" }}>
                  <CommandButtons />
                </Box>
                <Box sx={{ bgcolor: "#080D14", borderRadius: 1, border: "1px solid #1E2A3A" }}>
                   <CodeEditor value={code} onChange={setCode} textareaRef={textareaRef}
                     currentLine={state.currentLine} loopFlashLine={state.loopFlashLine}
                     condFlashLine={state.condFlashLine} condFlashResult={state.condFlashResult}
                     repeatIterLine={state.repeatIterLine} repeatIterCurrent={state.repeatIterCurrent}
                     repeatIterTotal={state.repeatIterTotal} ifFlashLine={state.ifFlashLine}
                     ifBranchLine={state.ifBranchLine}
                     disabled={state.isRunning} minHeight={160} fontSize={12} autoGrow
                     onCursorSave={(pos) => { lastCursorRef.current = pos; }} />
                </Box>
              </Box>
            </Box>
          )}
          {mobileTab === 1 && (
            <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
              <Box sx={{ p: 1, borderBottom: "1px solid #1E2A3A" }}>
                <CommandButtons size="medium" fs={13} />
              </Box>
              <Box sx={{ flex: 1, overflow: "auto", bgcolor: "#080D14" }}>
                 <CodeEditor value={code} onChange={setCode} textareaRef={textareaRef}
                   currentLine={state.currentLine} loopFlashLine={state.loopFlashLine}
                   condFlashLine={state.condFlashLine} condFlashResult={state.condFlashResult}
                   repeatIterLine={state.repeatIterLine} repeatIterCurrent={state.repeatIterCurrent}
                   repeatIterTotal={state.repeatIterTotal} ifFlashLine={state.ifFlashLine}
                   ifBranchLine={state.ifBranchLine}
                   disabled={state.isRunning} minHeight={300} fontSize={14} autoGrow
                   onCursorSave={(pos) => { lastCursorRef.current = pos; }} />
              </Box>
            </Box>
          )}
          {mobileTab === 2 && <LibraryPanel />}
          {mobileTab === 3 && <TrendsPanel />}
          {mobileTab === 4 && <HistoryPanel />}
          {mobileTab === 5 && <LeaderboardPanel />}
        </Box>

        {/* Bottom nav */}
        <Box sx={{ bgcolor: "#080D14", borderTop: "1px solid #1E2A3A" }}>
          <Tabs value={mobileTab} onChange={(_, v) => setMobileTab(v)} variant="scrollable" scrollButtons={false}
            sx={mkTabSx(10)}>
            <Tab icon={<RobotIcon sx={{ fontSize: 18 }} />} label="Поле" sx={{ minWidth: 52 }} />
            <Tab icon={<CodeIcon sx={{ fontSize: 18 }} />} label="Код" sx={{ minWidth: 52 }} />
            <Tab icon={<LibraryIcon sx={{ fontSize: 18 }} />} label="Библ." sx={{ minWidth: 52 }} />
            <Tab icon={<TrendingUpIcon sx={{ fontSize: 18 }} />} label="Тренды" sx={{ minWidth: 52 }} />
            <Tab icon={<HistoryIcon sx={{ fontSize: 18 }} />} label="История" sx={{ minWidth: 52 }} />
            <Tab icon={<EmojiEventsIcon sx={{ fontSize: 18 }} />} label="Рейтинг" sx={{ minWidth: 52 }} />
          </Tabs>
        </Box>

        <SaveDialog />
        <ShareDialog />
      </Box>
    );
  }

  // ─── TABLET LAYOUT (640–1100px) ───────────────────────────────────────────

  if (isTablet) {
    return (
      <Box sx={{ height: "100dvh", display: "flex", flexDirection: "column", bgcolor: "#0D1117", overflow: "hidden" }}>
        <Box sx={{ px: 2, py: 1.5, bgcolor: "#080D14", borderBottom: "1px solid #1E2A3A", display: "flex", alignItems: "center", gap: 1.5 }}>
          <Tooltip title="Назад">
            <IconButton size="small" onClick={() => window.history.back()}
              sx={{ color: "#94A3B8", "&:hover": { color: "#E2E8F0", bgcolor: "#1E2A3A" } }}>
              <ArrowBack sx={{ fontSize: 20 }} />
            </IconButton>
          </Tooltip>
          <RobotIcon sx={{ color: "#00FF88", fontSize: 22 }} />
          <Typography sx={{ color: "#E2E8F0", fontFamily: "monospace", fontSize: 15, fontWeight: 700, flex: 1 }}>
            Робот-Исполнитель
          </Typography>
          <RunControls compact />
        </Box>
        <StatusBar />

        <Box sx={{ flex: 1, display: "flex", overflow: "hidden" }}>
          {/* Left: field + code below */}
          <Box sx={{ width: "55%", borderRight: "1px solid #1E2A3A", overflow: "auto" }}>
            <FieldWithCode codeHeight={150} />
          </Box>

          {/* Right: tabs */}
          <Box sx={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <Tabs value={tabletTab} onChange={(_, v) => setTabletTab(v)} sx={mkTabSx(12)} variant="scrollable" scrollButtons={false}>
              <Tab icon={<LibraryIcon sx={{ fontSize: 15 }} />} iconPosition="start" label="Библ." />
              <Tab icon={<TrendingUpIcon sx={{ fontSize: 15 }} />} iconPosition="start" label="Тренды" />
              <Tab icon={<HistoryIcon sx={{ fontSize: 15 }} />} iconPosition="start" label="История" />
              <Tab icon={<EmojiEventsIcon sx={{ fontSize: 15 }} />} iconPosition="start" label="Рейтинг" />
            </Tabs>
            <Box sx={{ flex: 1, overflow: "auto" }}>
              {tabletTab === 0 && <LibraryPanel />}
              {tabletTab === 1 && <TrendsPanel />}
              {tabletTab === 2 && <HistoryPanel />}
              {tabletTab === 3 && <LeaderboardPanel />}
            </Box>
          </Box>
        </Box>
        <SaveDialog />
        <ShareDialog />
      </Box>
    );
  }

  // ─── DESKTOP LAYOUT (> 1100px) ────────────────────────────────────────────

  return (
    <Box sx={{ height: "100dvh", display: "flex", flexDirection: "column", bgcolor: "#0D1117", overflow: "hidden" }}>
      <Box sx={{ px: 2, py: 1.5, bgcolor: "#080D14", borderBottom: "1px solid #1E2A3A", display: "flex", alignItems: "center", gap: 1 }}>
        <Tooltip title="Назад">
          <IconButton
            size="small"
            onClick={() => window.history.back()}
            sx={{ color: "#94A3B8", mr: 0.5, "&:hover": { color: "#E2E8F0", bgcolor: "#1E2A3A" } }}
          >
            <ArrowBack fontSize="small" />
          </IconButton>
        </Tooltip>
        <RobotIcon sx={{ color: "#00FF88", fontSize: 26 }} />
        <Typography sx={{ color: "#E2E8F0", fontFamily: "monospace", fontSize: 17, fontWeight: 700 }}>
          Робот-Исполнитель
        </Typography>
        <Box sx={{ flex: 1 }} />
        <RunControls />
      </Box>
      <StatusBar />

      {/* Three columns */}
      <Box sx={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Column 1: Commands + Code editor (full height) */}
        <Box sx={{ width: 360, display: "flex", flexDirection: "column", borderRight: "1px solid #1E2A3A", overflow: "hidden" }}>
          <Box sx={{ p: 1.5, borderBottom: "1px solid #1E2A3A" }}>
            <Typography variant="caption" sx={{ color: "#374151", fontFamily: "monospace", fontSize: 11 }}>
              Команды (вставка по курсору):
            </Typography>
            <Box sx={{ mt: 0.5 }}>
              <CommandButtons size="medium" fs={12} />
            </Box>
          </Box>
          <Box sx={{ flex: 1, overflow: "auto", bgcolor: "#080D14" }}>
            <CodeEditor
              value={code}
              onChange={setCode}
              textareaRef={textareaRef}
              currentLine={state.currentLine}
              loopFlashLine={state.loopFlashLine}
              condFlashLine={state.condFlashLine}
              condFlashResult={state.condFlashResult}
              repeatIterLine={state.repeatIterLine}
              repeatIterCurrent={state.repeatIterCurrent}
              repeatIterTotal={state.repeatIterTotal}
              ifFlashLine={state.ifFlashLine}
              ifBranchLine={state.ifBranchLine}
              disabled={state.isRunning}
              minHeight={300}
              fontSize={14}
              autoGrow
              onCursorSave={(pos) => { lastCursorRef.current = pos; }}
            />
          </Box>
        </Box>

        {/* Column 2: Field + code below */}
        <Box sx={{ flex: 1, display: "flex", flexDirection: "column", overflow: "auto" }}>
          <FieldWithCode showSettings codeHeight={160} />
        </Box>

        {/* Column 3: Right tabs */}
        <Box sx={{ width: 380, display: "flex", flexDirection: "column", borderLeft: "1px solid #1E2A3A", overflow: "hidden" }}>
          <Tabs value={rightTab} onChange={(_, v) => setRightTab(v)} sx={mkTabSx(13)} variant="scrollable" scrollButtons={false}>
            <Tab icon={<LibraryIcon sx={{ fontSize: 16 }} />} iconPosition="start" label="Библиотека" />
            <Tab icon={<TrendingUpIcon sx={{ fontSize: 16 }} />} iconPosition="start" label="Тренды" />
            <Tab icon={<HistoryIcon sx={{ fontSize: 16 }} />} iconPosition="start" label="История" />
            <Tab icon={<EmojiEventsIcon sx={{ fontSize: 16 }} />} iconPosition="start" label="Рейтинг" />
          </Tabs>
          <Box sx={{ flex: 1, overflow: "auto" }}>
            {rightTab === 0 && <LibraryPanel />}
            {rightTab === 1 && <TrendsPanel />}
            {rightTab === 2 && <HistoryPanel />}
            {rightTab === 3 && <LeaderboardPanel />}
          </Box>
        </Box>
      </Box>

      <SaveDialog />
      <ShareDialog />
    </Box>
  );
}
