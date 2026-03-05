// ============================================================
// GAME CANVAS — Robot Executor (v22 integration)
// Mobile-first: touch events, auto-scale via CSS transform only
//
// FIX: No useState for scale — scale is computed in drawRef and
// applied via CSS transform. This prevents React re-renders from
// causing canvas flicker/jitter on mobile during animation.
// Crash animation removed (was causing extra re-renders).
// All drawing goes through a single requestAnimationFrame loop.
// ============================================================

import React, { useRef, useEffect, useCallback } from "react";
import { GameState, wallKey, posKey } from "../lib/gameTypes";

interface Props {
  state: GameState;
  editMode: "none" | "wall_h" | "wall_v" | "target" | "robot";
  onToggleWall?: (wall: string) => void;
  onToggleTarget?: (pos: { row: number; col: number }) => void;
  onSetRobot?: (pos: { row: number; col: number }) => void;
}

const BASE_CELL = 52;
const PADDING = 20;
const WALL_THICKNESS = 5;

const COLORS = {
  bg: "#0D1117",
  grid: "#1E2A3A",
  cell: "#111827",
  wall: "#EF4444",
  wallHover: "#F87171",
  robotBody: "#00FF88",
  robotEye: "#0D1117",
  robotGlow: "rgba(0,255,136,0.25)",
  text: "#94A3B8",
  targetBorder: "#7C3AED",
};

export default function GameCanvas({ state, editMode, onToggleWall, onToggleTarget, onSetRobot }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  // Scroll wrapper for large fields
  const scrollRef = useRef<HTMLDivElement>(null);
  const hoverRef = useRef<{ type: string; key: string } | null>(null);
  // Store scale in a ref — never triggers re-render
  const scaleRef = useRef(1);
  // RAF id for the draw loop
  const rafRef = useRef<number | null>(null);
  // Latest state in a ref so the draw loop always has fresh data
  const stateRef = useRef(state);
  stateRef.current = state;
  // Large field: use scroll + camera instead of CSS scale
  const isLargeField = state.rows > 20 || state.cols > 20;

  const CELL = BASE_CELL;
  const canvasW = state.cols * CELL + PADDING * 2;
  const canvasH = state.rows * CELL + PADDING * 2;

  // ─── Draw function (pure, no React state reads) ───────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const s = stateRef.current;
    const W = s.cols * CELL + PADDING * 2;
    const H = s.rows * CELL + PADDING * 2;

    // Resize canvas if field size changed
    if (canvas.width !== W || canvas.height !== H) {
      canvas.width = W;
      canvas.height = H;
    }

    ctx.clearRect(0, 0, W, H);

    // Background
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, W, H);

    // Cells
    for (let r = 0; r < s.rows; r++) {
      for (let c = 0; c < s.cols; c++) {
        const x = PADDING + c * CELL;
        const y = PADDING + r * CELL;
        const key = posKey({ row: r, col: c });

        ctx.fillStyle = COLORS.cell;
        ctx.fillRect(x + 1, y + 1, CELL - 2, CELL - 2);

        // Painted
        if (s.painted.has(key)) {
          ctx.fillStyle = "#FFB800";
          ctx.globalAlpha = 0.35;
          ctx.fillRect(x + 1, y + 1, CELL - 2, CELL - 2);
          ctx.globalAlpha = 1;
        }

        // Flash cell (condition check highlight)
        if (s.flashCell === key) {
          const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 80);
          ctx.fillStyle = `rgba(0,200,255,${0.25 + pulse * 0.35})`;
          ctx.fillRect(x + 1, y + 1, CELL - 2, CELL - 2);
          ctx.strokeStyle = `rgba(0,200,255,${0.7 + pulse * 0.3})`;
          ctx.lineWidth = 2;
          ctx.strokeRect(x + 2, y + 2, CELL - 4, CELL - 4);
        }

        // Target
        if (s.targets.has(key)) {
          ctx.fillStyle = "#7C3AED33";
          ctx.fillRect(x + 1, y + 1, CELL - 2, CELL - 2);
          ctx.strokeStyle = COLORS.targetBorder;
          ctx.lineWidth = 2;
          ctx.setLineDash([4, 4]);
          ctx.strokeRect(x + 4, y + 4, CELL - 8, CELL - 8);
          ctx.setLineDash([]);
          ctx.fillStyle = COLORS.targetBorder;
          ctx.font = `${CELL * 0.38}px sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("★", x + CELL / 2, y + CELL / 2);
        }

        // Hover highlight
        if (editMode !== "none" && editMode !== "wall_h" && editMode !== "wall_v") {
          if (hoverRef.current?.key === key) {
            ctx.fillStyle = "#00FF8822";
            ctx.fillRect(x + 1, y + 1, CELL - 2, CELL - 2);
          }
        }
      }
    }

    // Grid lines
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    for (let r = 0; r <= s.rows; r++) {
      ctx.beginPath();
      ctx.moveTo(PADDING, PADDING + r * CELL);
      ctx.lineTo(PADDING + s.cols * CELL, PADDING + r * CELL);
      ctx.stroke();
    }
    for (let c = 0; c <= s.cols; c++) {
      ctx.beginPath();
      ctx.moveTo(PADDING + c * CELL, PADDING);
      ctx.lineTo(PADDING + c * CELL, PADDING + s.rows * CELL);
      ctx.stroke();
    }

    // Outer border
    ctx.strokeStyle = "#334155";
    ctx.lineWidth = 3;
    ctx.strokeRect(PADDING, PADDING, s.cols * CELL, s.rows * CELL);

    // Horizontal walls
    for (const key of Array.from(s.walls.horizontal)) {
      const parts = key.split(":");
      const r = parseInt(parts[1]);
      const c = parseInt(parts[2]);
      const x = PADDING + c * CELL;
      const y = PADDING + (r + 1) * CELL;
      const isHover = hoverRef.current?.key === key;
      ctx.strokeStyle = isHover ? COLORS.wallHover : COLORS.wall;
      ctx.lineWidth = WALL_THICKNESS;
      ctx.lineCap = "round";
      ctx.shadowColor = COLORS.wall;
      ctx.shadowBlur = isHover ? 8 : 4;
      ctx.beginPath();
      ctx.moveTo(x + 3, y);
      ctx.lineTo(x + CELL - 3, y);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // Vertical walls
    for (const key of Array.from(s.walls.vertical)) {
      const parts = key.split(":");
      const r = parseInt(parts[1]);
      const c = parseInt(parts[2]);
      const x = PADDING + (c + 1) * CELL;
      const y = PADDING + r * CELL;
      const isHover = hoverRef.current?.key === key;
      ctx.strokeStyle = isHover ? COLORS.wallHover : COLORS.wall;
      ctx.lineWidth = WALL_THICKNESS;
      ctx.lineCap = "round";
      ctx.shadowColor = COLORS.wall;
      ctx.shadowBlur = isHover ? 8 : 4;
      ctx.beginPath();
      ctx.moveTo(x, y + 3);
      ctx.lineTo(x, y + CELL - 3);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

        // ─── Robot ──────────────────────────────────
    const rx = PADDING + s.robot.col * CELL + CELL / 2;
    const ry = PADDING + s.robot.row * CELL + CELL / 2;
    // robotFlash: pulse scale animation when useRobot step fires
    const flashPulse = s.robotFlash ? (1 + 0.35 * Math.abs(Math.sin(Date.now() / 60))) : 1;
    const rSize = CELL * 0.38 * flashPulse;

    // Glow — extra bright during flash
    const glowRadius = s.robotFlash ? rSize * 3.5 : rSize * 2.2;
    const glowColor = s.robotFlash ? "rgba(0,255,136,0.55)" : COLORS.robotGlow;
    const grd = ctx.createRadialGradient(rx, ry, 0, rx, ry, glowRadius);
    grd.addColorStop(0, glowColor);
    grd.addColorStop(1, "transparent");
    ctx.fillStyle = grd;
    ctx.fillRect(rx - glowRadius, ry - glowRadius, glowRadius * 2, glowRadius * 2);

    // Extra ring during flash
    if (s.robotFlash) {
      const ringPulse = 0.5 + 0.5 * Math.sin(Date.now() / 80);
      ctx.strokeStyle = `rgba(0,255,136,${0.4 + ringPulse * 0.5})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(rx, ry, rSize * 1.6, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Body gradient
    const bodyGrd = ctx.createLinearGradient(rx - rSize, ry - rSize, rx + rSize, ry + rSize);
    bodyGrd.addColorStop(0, s.robotFlash ? "#80FFBB" : "#00FF88");
    bodyGrd.addColorStop(1, s.robotFlash ? "#00FF88" : "#00CC6A");
    ctx.fillStyle = bodyGrd;
    ctx.beginPath();
    ctx.roundRect(rx - rSize, ry - rSize, rSize * 2, rSize * 2, 7);
    ctx.fill();

    // Antenna
    ctx.strokeStyle = "#00FF88";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(rx, ry - rSize);
    ctx.lineTo(rx, ry - rSize - 8);
    ctx.stroke();
    ctx.fillStyle = "#00FF88";
    ctx.beginPath();
    ctx.arc(rx, ry - rSize - 10, 3, 0, Math.PI * 2);
    ctx.fill();

    // Eyes
    ctx.fillStyle = COLORS.robotEye;
    ctx.beginPath(); ctx.arc(rx - rSize * 0.3, ry - rSize * 0.15, rSize * 0.18, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(rx + rSize * 0.3, ry - rSize * 0.15, rSize * 0.18, 0, Math.PI * 2); ctx.fill();
    // Eye shine
    ctx.fillStyle = "#ffffff88";
    ctx.beginPath(); ctx.arc(rx - rSize * 0.3 + 2, ry - rSize * 0.15 - 2, rSize * 0.07, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(rx + rSize * 0.3 + 2, ry - rSize * 0.15 - 2, rSize * 0.07, 0, Math.PI * 2); ctx.fill();
    // Smile
    ctx.strokeStyle = COLORS.robotEye;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(rx, ry + rSize * 0.1, rSize * 0.3, 0.2, Math.PI - 0.2);
    ctx.stroke();
    // Direction arrow
    ctx.fillStyle = "#0D111788";
    ctx.font = `${CELL * 0.22}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const dirArrow = s.robotDir === "up" ? "↑" : s.robotDir === "down" ? "↓" : s.robotDir === "left" ? "←" : "→";
    ctx.fillText(dirArrow, rx, ry + rSize * 0.45);

    // Row/col labels
    ctx.fillStyle = COLORS.text;
    ctx.font = "10px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let c = 0; c < s.cols; c++) {
      ctx.fillText(String(c + 1), PADDING + c * CELL + CELL / 2, PADDING / 2);
    }
    ctx.textAlign = "right";
    for (let r = 0; r < s.rows; r++) {
      ctx.fillText(String(r + 1), PADDING - 5, PADDING + r * CELL + CELL / 2);
    }
  }, [CELL, editMode]);

  // ─── RAF loop: runs while isRunning or animating, single frame otherwise ──
  useEffect(() => {
    const needsAnimation = state.isRunning || state.robotFlash || !!state.flashCell;
    if (needsAnimation) {
      // Continuous loop during execution/animation for smooth rendering
      const loop = () => {
        draw();
        rafRef.current = requestAnimationFrame(loop);
      };
      rafRef.current = requestAnimationFrame(loop);
      return () => {
        if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      };
    } else {
      // Single draw for static state
      draw();
    }
  }, [state, draw]);

  // ─── Scale: CSS transform only, no React state ───────────────
  useEffect(() => {
    const updateScale = () => {
      if (!containerRef.current || !canvasRef.current) return;
      const containerW = containerRef.current.clientWidth;
      const W = stateRef.current.cols * CELL + PADDING * 2;
      const newScale = containerW > 0 && W > containerW ? containerW / W : 1;
      if (Math.abs(newScale - scaleRef.current) > 0.001) {
        scaleRef.current = newScale;
        if (canvasRef.current) {
          canvasRef.current.style.transform = `scale(${newScale})`;
          canvasRef.current.style.transformOrigin = "top left";
          // Adjust wrapper height to match scaled canvas
          const H = stateRef.current.rows * CELL + PADDING * 2;
          containerRef.current.style.height = `${H * newScale}px`;
        }
      }
    };
    updateScale();
    const ro = new ResizeObserver(updateScale);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [CELL, canvasW, canvasH]);

  // ─── Coordinate helpers ───────────────────────────────────────
  const getCellFromXY = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    // rect already accounts for CSS transform scale
    const cssW = rect.width;
    const cssH = rect.height;
    const scaleX = canvas.width / cssW;
    const scaleY = canvas.height / cssH;
    const mx = (clientX - rect.left) * scaleX;
    const my = (clientY - rect.top) * scaleY;
    const col = Math.floor((mx - PADDING) / CELL);
    const row = Math.floor((my - PADDING) / CELL);
    const fx = mx - PADDING - col * CELL;
    const fy = my - PADDING - row * CELL;
    return { row, col, fx, fy };
  };

  const processInteraction = (clientX: number, clientY: number) => {
    if (state.isRunning) return;
    const res = getCellFromXY(clientX, clientY);
    if (!res) return;
    const { row, col, fx, fy } = res;
    if (row < 0 || row >= state.rows || col < 0 || col >= state.cols) return;

    if (editMode === "target") { onToggleTarget?.({ row, col }); return; }
    if (editMode === "robot") { onSetRobot?.({ row, col }); return; }

    if (editMode === "wall_h") {
      if (fy > CELL * 0.6 && row < state.rows - 1) onToggleWall?.(wallKey("h", row, col));
      else if (fy < CELL * 0.4 && row > 0) onToggleWall?.(wallKey("h", row - 1, col));
    }
    if (editMode === "wall_v") {
      if (fx > CELL * 0.6 && col < state.cols - 1) onToggleWall?.(wallKey("v", row, col));
      else if (fx < CELL * 0.4 && col > 0) onToggleWall?.(wallKey("v", row, col - 1));
    }
  };

  // ─── Mouse events ─────────────────────────────────────────────
  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    processInteraction(e.clientX, e.clientY);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (editMode === "none" || state.isRunning) return;
    const res = getCellFromXY(e.clientX, e.clientY);
    if (!res) return;
    const { row, col, fx, fy } = res;
    if (row < 0 || row >= state.rows || col < 0 || col >= state.cols) {
      hoverRef.current = null; draw(); return;
    }
    if (editMode === "wall_h") {
      if (fy > CELL * 0.6 && row < state.rows - 1) hoverRef.current = { type: "h", key: wallKey("h", row, col) };
      else if (fy < CELL * 0.4 && row > 0) hoverRef.current = { type: "h", key: wallKey("h", row - 1, col) };
      else hoverRef.current = null;
    } else if (editMode === "wall_v") {
      if (fx > CELL * 0.6 && col < state.cols - 1) hoverRef.current = { type: "v", key: wallKey("v", row, col) };
      else if (fx < CELL * 0.4 && col > 0) hoverRef.current = { type: "v", key: wallKey("v", row, col - 1) };
      else hoverRef.current = null;
    } else {
      hoverRef.current = { type: editMode, key: posKey({ row, col }) };
    }
    draw();
  };

  // ─── Touch events ─────────────────────────────────────────────
  const lastTouchRef = useRef<{ x: number; y: number; time: number } | null>(null);

  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length === 1) {
      const t = e.touches[0];
      lastTouchRef.current = { x: t.clientX, y: t.clientY, time: Date.now() };
    }
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.changedTouches.length === 1 && lastTouchRef.current) {
      const t = e.changedTouches[0];
      const dx = Math.abs(t.clientX - lastTouchRef.current.x);
      const dy = Math.abs(t.clientY - lastTouchRef.current.y);
      const dt = Date.now() - lastTouchRef.current.time;
      if (dx < 10 && dy < 10 && dt < 400) {
        e.preventDefault();
        processInteraction(t.clientX, t.clientY);
      }
      lastTouchRef.current = null;
    }
  };

   const cursor = editMode !== "none" && !state.isRunning ? "crosshair" : "default";

  // Camera: scroll to keep robot centered for large fields — always follow robot
  const scrollToRobot = useCallback((smooth: boolean) => {
    if (!isLargeField) return;
    const scroll = scrollRef.current;
    if (!scroll) return;
    const { row, col } = state.robot;
    const raf = requestAnimationFrame(() => {
      const robotX = PADDING + col * CELL + CELL / 2;
      const robotY = PADDING + row * CELL + CELL / 2;
      const viewW = scroll.clientWidth;
      const viewH = scroll.clientHeight;
      if (viewW === 0 || viewH === 0) return;
      const targetScrollX = robotX - viewW / 2;
      const targetScrollY = robotY - viewH / 2;
      scroll.scrollTo({
        left: Math.max(0, targetScrollX),
        top: Math.max(0, targetScrollY),
        behavior: smooth ? "smooth" : "instant",
      });
    });
    return () => cancelAnimationFrame(raf);
  }, [state.robot, isLargeField, CELL]);

  // Follow robot on every move
  useEffect(() => {
    return scrollToRobot(true);
  }, [scrollToRobot]);

  // Jump to robot immediately when program starts
  const prevIsRunningRef = useRef(false);
  useEffect(() => {
    if (state.isRunning && !prevIsRunningRef.current) {
      scrollToRobot(false);
    }
    prevIsRunningRef.current = state.isRunning;
  }, [state.isRunning, scrollToRobot]);;

  if (isLargeField) {
    return (
      <div
        ref={scrollRef}
        style={{ width: "100%", height: "400px", overflow: "auto", position: "relative",
          scrollbarWidth: "thin", scrollbarColor: "#1E2A3A #080D14",
          background: COLORS.bg, borderRadius: 8, border: "1px solid #1E2A3A" }}
      >
        <canvas
          ref={canvasRef}
          width={canvasW}
          height={canvasH}
          onClick={handleClick}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => { hoverRef.current = null; draw(); }}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          style={{
            cursor,
            display: "block",
            borderRadius: 8,
            border: "1px solid #1E2A3A",
            touchAction: editMode !== "none" ? "none" : "auto",
          }}
        />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", position: "relative", overflow: "hidden" }}
    >
      <canvas
        ref={canvasRef}
        width={canvasW}
        height={canvasH}
        onClick={handleClick}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => { hoverRef.current = null; draw(); }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        style={{
          cursor,
          display: "block",
          borderRadius: 8,
          border: "1px solid #1E2A3A",
          touchAction: editMode !== "none" ? "none" : "auto",
          // transform and transformOrigin set imperatively by ResizeObserver
        }}
      />
    </div>
  );
}
