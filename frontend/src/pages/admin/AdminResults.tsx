import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Box, Typography, Card, CardContent, Alert, CircularProgress,
  FormControl, InputLabel, Select, MenuItem, Paper, Chip,
  IconButton, Tooltip, LinearProgress, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Avatar,
  Divider, Stack, Tabs, Tab, TextField, InputAdornment,
} from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CancelIcon from "@mui/icons-material/Cancel";
import RemoveCircleOutlineIcon from "@mui/icons-material/RemoveCircleOutline";
import VisibilityIcon from "@mui/icons-material/Visibility";
import SearchIcon from "@mui/icons-material/Search";
import DeleteIcon from "@mui/icons-material/Delete";
import GridOnIcon from "@mui/icons-material/GridOn";
import ListAltIcon from "@mui/icons-material/ListAlt";
import { useNavigate, useLocation } from "react-router-dom";
import { getClasses, getSchedule, api } from "../../api";
import { InlineMath } from "react-katex";
import "katex/dist/katex.min.css";

// ─── Типы ────────────────────────────────────────────────────────────────────

interface ClassRoom { id: number; name: string; }

interface ScheduleItem {
  id: number;
  class_id: number;
  assignment_id: string;
  assignment_title: string;
  date: string;
}

interface CellAnswer {
  is_correct: boolean;
  score: number;
  max_score: number;
  student_answer: unknown;
  correct_answer: unknown;
  qtype: string;
  attempt_id: number | null;
}

interface StudentRow {
  student_id: number;
  student_name: string;
  student_code: string;
  attempt_id: number | null;
  total_score: number;
  max_score: number;
  percent: number;
  submitted_at: string | null;
  cells: Record<string, CellAnswer | null>;
}

interface QuestionCol {
  question_key: string;
  prompt_latex: string;
  qtype: string;
  max_score: number;
  correct_count: number;
  total_count: number;
  avg_score: number;
  percent_correct: number;
}

interface ResultMatrix {
  class_id: number;
  class_name: string;
  assignment_id: string;
  assignment_title: string;
  questions: QuestionCol[];
  rows: StudentRow[];
  students_attempted: number;
  students_total: number;
  avg_percent: number;
  max_score: number;
}

// ─── Вспомогательные компоненты ──────────────────────────────────────────────

/** Рендерит строку с LaTeX-формулами ($...$) как React-элемент */
function renderLatexStr(text: string): React.ReactNode {
  if (!text) return text;
  const parts = text.split(/(\$[^$]+\$)/g);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith("$") && part.endsWith("$") ? (
          <InlineMath key={i} math={part.slice(1, -1)} />
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

/** Форматирует любой ответ в читаемую строку */
function formatAnswer(val: unknown): string {
  if (val === null || val === undefined) return "—";
  if (typeof val === "string") return val;
  if (typeof val === "number") return String(val);
  if (Array.isArray(val)) return val.map((v) => formatAnswer(v)).join(", ");
  if (typeof val === "object") {
    // drag_drop / matching: {зона: [элементы]}
    return Object.entries(val as Record<string, unknown>)
      .map(([k, v]) => `${k}: ${formatAnswer(v)}`)
      .join(" | ");
  }
  return String(val);
}

/** Рендерит ответ с LaTeX-поддержкой */
function renderAnswerNode(val: unknown): React.ReactNode {
  if (val === null || val === undefined) return "—";
  if (typeof val === "string") return renderLatexStr(val);
  if (typeof val === "number") return String(val);
  if (Array.isArray(val)) {
    return (
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.25 }}>
        {val.map((v, i) => (
          <Chip key={i} label={renderLatexStr(String(v))} size="small" variant="outlined" sx={{ height: "auto", py: 0.25, "& .MuiChip-label": { display: "flex", alignItems: "center" } }} />
        ))}
      </Box>
    );
  }
  if (typeof val === "object") {
    // drag_drop / matching: {зона: [элементы]}
    return (
      <Box>
        {Object.entries(val as Record<string, unknown>).map(([k, v]) => (
          <Box key={k} sx={{ mb: 0.25 }}>
            <Typography variant="caption" fontWeight={700} component="span">{k}: </Typography>
            <Typography variant="caption" component="span">
              {Array.isArray(v) ? v.join(", ") : String(v)}
            </Typography>
          </Box>
        ))}
      </Box>
    );
  }
  return String(val);
}

/** Иконка результата ячейки */
function CellIcon({ cell }: { cell: CellAnswer | null }) {
  if (!cell) {
    return (
      <RemoveCircleOutlineIcon
        sx={{ fontSize: 20, color: "text.disabled" }}
      />
    );
  }
  if (cell.max_score === 0) {
    return <RemoveCircleOutlineIcon sx={{ fontSize: 20, color: "grey.400" }} />;
  }
  if (cell.is_correct) {
    return <CheckCircleIcon sx={{ fontSize: 20, color: "success.main" }} />;
  }
  if (cell.score > 0) {
    // Частично верно
    return (
      <Box
        sx={{
          width: 20, height: 20, borderRadius: "50%",
          bgcolor: "warning.main", display: "flex",
          alignItems: "center", justifyContent: "center",
        }}
      >
        <Typography variant="caption" sx={{ color: "white", fontSize: 9, fontWeight: 700, lineHeight: 1 }}>
          {cell.score}
        </Typography>
      </Box>
    );
  }
  return <CancelIcon sx={{ fontSize: 20, color: "error.main" }} />;
}

/** Тултип с деталями ответа */
function CellTooltipContent({ cell, qnum }: { cell: CellAnswer; qnum: number }) {
  return (
    <Box sx={{ p: 0.5, maxWidth: 300 }}>
      <Typography variant="caption" fontWeight={700} display="block" mb={0.5}>
        Вопрос {qnum}
      </Typography>
      <Typography variant="caption" display="block" color="text.secondary">
        Балл: {cell.score} / {cell.max_score}
      </Typography>
      <Divider sx={{ my: 0.5 }} />
      <Typography variant="caption" display="block" mb={0.25}>
        <b>Ответ ученика:</b>
      </Typography>
      <Box
        sx={{
          color: cell.is_correct ? "success.main" : cell.score > 0 ? "warning.main" : "error.main",
          wordBreak: "break-word",
          mb: 0.75,
          fontSize: 12,
        }}
      >
        {renderAnswerNode(cell.student_answer)}
      </Box>
      <Typography variant="caption" display="block" mb={0.25}>
        <b>Правильный ответ:</b>
      </Typography>
      <Box sx={{ color: "success.dark", wordBreak: "break-word", fontSize: 12 }}>
        {renderAnswerNode(cell.correct_answer)}
      </Box>
    </Box>
  );
}

/** Полоска процента */
function PercentBar({ value, compact = false }: { value: number; compact?: boolean }) {
  const color = value >= 90 ? "success" : value >= 60 ? "primary" : value >= 30 ? "warning" : "error";
  if (compact) {
    return (
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, minWidth: 72 }}>
        <LinearProgress
          variant="determinate"
          value={value}
          color={color}
          sx={{ flex: 1, height: 5, borderRadius: 3 }}
        />
        <Typography variant="caption" fontWeight={600} sx={{ minWidth: 28, fontSize: 10 }}>
          {value}%
        </Typography>
      </Box>
    );
  }
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 100 }}>
      <LinearProgress
        variant="determinate"
        value={value}
        color={color}
        sx={{ flex: 1, height: 6, borderRadius: 3 }}
      />
      <Typography variant="caption" fontWeight={600} sx={{ minWidth: 36 }}>
        {value}%
      </Typography>
    </Box>
  );
}

interface AttemptListItem {
  id: number;
  student_id: number;
  student_name: string;
  student_code: string;
  class_name: string;
  assignment_id: string;
  assignment_title: string;
  submitted_at: string | null;
  total_score: number;
  max_score: number;
  percent: number;
  time_spent_seconds: number | null;
}

function formatDuration(seconds: number | null): string {
  if (seconds === null || seconds === undefined) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m} мин ${s} с` : `${s} с`;
}

// ─── Главный компонент ────────────────────────────────────────────

export default function AdminResults() {
  const navigate = useNavigate();
  const location = useLocation();
  const locState = (location.state as { classId?: number; assignmentId?: string } | null);
  const [classes, setClasses] = useState<ClassRoom[]>([]);
  const [activeTab, setActiveTab] = useState(0);
  const [scheduleItems, setScheduleItems] = useState<ScheduleItem[]>([]);
  const [selectedClass, setSelectedClass] = useState<number | "">(locState?.classId ?? "");
  const [selectedAssignment, setSelectedAssignment] = useState<string>(locState?.assignmentId ?? "");
  const [matrix, setMatrix] = useState<ResultMatrix | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Вкладка "Все попытки"
  const [allAttempts, setAllAttempts] = useState<AttemptListItem[]>([]);
  const [attemptsLoading, setAttemptsLoading] = useState(false);
  const [attemptsError, setAttemptsError] = useState("");
  const [attemptsSearch, setAttemptsSearch] = useState("");
  const [attemptsClassFilter, setAttemptsClassFilter] = useState<number | "">(locState?.classId ?? "");
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // Загружаем классы при старте
  useEffect(() => {
    getClasses().then((cls: ClassRoom[]) => {
      setClasses(cls);
    });
  }, []);

  // Загружаем расписание при смене класса
  useEffect(() => {
    if (!selectedClass) {
      setScheduleItems([]);
      setSelectedAssignment("");
      setMatrix(null);
      return;
    }
    getSchedule(selectedClass as number).then((items: ScheduleItem[]) => {
      // Убираем дубликаты по assignment_id
      const seen = new Set<string>();
      const unique = items.filter((it) => {
        if (seen.has(it.assignment_id)) return false;
        seen.add(it.assignment_id);
        return true;
      });
      setScheduleItems(unique);
      setSelectedAssignment("");
      setMatrix(null);
    });
  }, [selectedClass]);

  // Загружаем матрицу при выборе задания
  const loadMatrix = useCallback(async () => {
    if (!selectedClass || !selectedAssignment) return;
    setLoading(true);
    setError("");
    try {
      const data: ResultMatrix = await api
        .get("/api/admin/results/matrix", {
          params: { class_id: selectedClass, assignment_id: selectedAssignment },
        })
        .then((r) => r.data);
      setMatrix(data);
    } catch {
      setError("Ошибка загрузки матрицы результатов");
    } finally {
      setLoading(false);
    }
  }, [selectedClass, selectedAssignment]);

  useEffect(() => {
    loadMatrix();
  }, [loadMatrix]);

  // Автообновление каждые 30 секунд
  useEffect(() => {
    if (!selectedClass || !selectedAssignment) return;
    const timer = setInterval(() => {
      loadMatrix();
    }, 30000);
    return () => clearInterval(timer);
  }, [selectedClass, selectedAssignment, loadMatrix]);

  // Загрузка всех попыток
  const loadAllAttempts = useCallback(async () => {
    setAttemptsLoading(true);
    setAttemptsError("");
    try {
      const params: Record<string, unknown> = {};
      if (attemptsClassFilter) params.class_id = attemptsClassFilter;
      const data = await api.get("/api/admin/attempts", { params }).then((r) => r.data);
      setAllAttempts(data);
    } catch {
      setAttemptsError("Ошибка загрузки попыток");
    } finally {
      setAttemptsLoading(false);
    }
  }, [attemptsClassFilter]);

  useEffect(() => {
    if (activeTab === 1) loadAllAttempts();
  }, [activeTab, loadAllAttempts]);

  const handleDeleteAttempt = async (id: number) => {
    setDeletingId(id);
    try {
      await api.delete(`/api/admin/attempts/${id}`);
      setAllAttempts((prev) => prev.filter((a) => a.id !== id));
    } catch {
      setAttemptsError("Ошибка удаления");
    } finally {
      setDeletingId(null);
    }
  };

  const filteredAttempts = useMemo(() => {
    const q = attemptsSearch.toLowerCase();
    return allAttempts.filter((a) =>
      !q ||
      a.student_name.toLowerCase().includes(q) ||
      a.student_code.toLowerCase().includes(q) ||
      a.assignment_title.toLowerCase().includes(q) ||
      a.assignment_id.toLowerCase().includes(q) ||
      a.class_name.toLowerCase().includes(q)
    );
  }, [allAttempts, attemptsSearch]);

  // ─── Рендер ───────────────────────────────────────────────────────────────

  return (
    <Box>
      {/* Заголовок */}
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2 }}>
        <Typography variant="h5" fontWeight={700}>Результаты</Typography>
        <IconButton
          onClick={activeTab === 0 ? loadMatrix : loadAllAttempts}
          disabled={(activeTab === 0 && (loading || !selectedAssignment)) || (activeTab === 1 && attemptsLoading)}
        >
          <RefreshIcon />
        </IconButton>
      </Box>

      {/* Вкладки */}
      <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)} sx={{ mb: 3, borderBottom: 1, borderColor: "divider" }}>
        <Tab icon={<GridOnIcon />} iconPosition="start" label="Матрица ответов" />
        <Tab icon={<ListAltIcon />} iconPosition="start" label="Все попытки" />
      </Tabs>

      {error && <Alert severity="error" onClose={() => setError("")} sx={{ mb: 2 }}>{error}</Alert>}

      {/* Вкладка 1: Матрица ответов */}
      {activeTab === 0 && (
        <Box>
      <Card sx={{ mb: 3 }}>
        <CardContent sx={{ pb: "12px !important" }}>
          <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
            <FormControl size="small" sx={{ minWidth: 180 }}>
              <InputLabel>Класс</InputLabel>
              <Select
                value={selectedClass}
                label="Класс"
                onChange={(e) => setSelectedClass(e.target.value as number | "")}
              >
                <MenuItem value="">— выберите класс —</MenuItem>
                {classes.map((c) => (
                  <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
                ))}
              </Select>
            </FormControl>

            {scheduleItems.length > 0 && (
              <FormControl size="small" sx={{ minWidth: 280 }}>
                <InputLabel>Задание</InputLabel>
                <Select
                  value={selectedAssignment}
                  label="Задание"
                  onChange={(e) => setSelectedAssignment(e.target.value as string)}
                >
                  <MenuItem value="">— выберите задание —</MenuItem>
                  {scheduleItems.map((it) => (
                    <MenuItem key={it.assignment_id} value={it.assignment_id}>
                      {it.assignment_title || it.assignment_id}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}
          </Stack>
        </CardContent>
      </Card>

      {/* Состояния загрузки */}
      {loading && (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress />
        </Box>
      )}

      {!loading && !matrix && selectedClass && !selectedAssignment && (
        <Alert severity="info">Выберите задание для просмотра результатов.</Alert>
      )}

      {!loading && !matrix && !selectedClass && (
        <Alert severity="info">Выберите класс и задание для просмотра результатов.</Alert>
      )}

      {/* Матрица результатов */}
      {!loading && matrix && (
        <>
          {/* Сводные карточки */}
          <Box sx={{ display: "flex", gap: 2, mb: 3, flexWrap: "wrap" }}>
            {[
              {
                label: "Сдали задание",
                value: `${matrix.students_attempted} / ${matrix.students_total}`,
                color: "primary.main",
              },
              {
                label: "Средний результат",
                value: `${matrix.avg_percent}%`,
                color: matrix.avg_percent >= 70 ? "success.main" : matrix.avg_percent >= 40 ? "warning.main" : "error.main",
              },
              {
                label: "Максимум баллов",
                value: matrix.max_score,
                color: "text.primary",
              },
              {
                label: "Вопросов",
                value: matrix.questions.length,
                color: "text.primary",
              },
            ].map((s) => (
              <Card key={s.label} sx={{ flex: "1 1 130px", minWidth: 130 }}>
                <CardContent sx={{ py: 1.5, "&:last-child": { pb: 1.5 } }}>
                  <Typography variant="h5" fontWeight={700} color={s.color}>
                    {s.value}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {s.label}
                  </Typography>
                </CardContent>
              </Card>
            ))}
          </Box>

          {/* Легенда */}
          <Box sx={{ display: "flex", gap: 2, mb: 2, flexWrap: "wrap", alignItems: "center" }}>
            <Typography variant="caption" color="text.secondary" fontWeight={600}>
              Легенда:
            </Typography>
            {[
              { icon: <CheckCircleIcon sx={{ fontSize: 16, color: "success.main" }} />, label: "Верно" },
              { icon: <CancelIcon sx={{ fontSize: 16, color: "error.main" }} />, label: "Неверно" },
              {
                icon: (
                  <Box sx={{ width: 16, height: 16, borderRadius: "50%", bgcolor: "warning.main", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Typography sx={{ fontSize: 8, color: "white", fontWeight: 700 }}>n</Typography>
                  </Box>
                ),
                label: "Частично",
              },
              { icon: <RemoveCircleOutlineIcon sx={{ fontSize: 16, color: "text.disabled" }} />, label: "Не отвечал" },
            ].map((l) => (
              <Box key={l.label} sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                {l.icon}
                <Typography variant="caption" color="text.secondary">{l.label}</Typography>
              </Box>
            ))}
            <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
              · Наведите на ячейку для просмотра ответа
            </Typography>
          </Box>

          {/* Таблица */}
          <TableContainer
            component={Paper}
            sx={{ overflowX: "auto", maxHeight: "calc(100vh - 340px)" }}
          >
            <Table
              size="small"
              stickyHeader
              sx={{ borderCollapse: "separate", borderSpacing: 0 }}
            >
              <TableHead>
                {/* Строка заголовков вопросов */}
                <TableRow>
                  {/* Фиксированный столбец — имя ученика */}
                  <TableCell
                    sx={{
                      fontWeight: 700,
                      minWidth: 180,
                      position: "sticky",
                      left: 0,
                      zIndex: 3,
                      bgcolor: "grey.50",
                      borderRight: "2px solid",
                      borderColor: "divider",
                    }}
                  >
                    Ученик
                  </TableCell>
                  {/* Столбцы вопросов */}
                  {matrix.questions.map((q, idx) => (
                    <Tooltip
                      key={q.question_key}
                      title={
                        <Box sx={{ p: 0.5, maxWidth: 300 }}>
                          <Typography variant="caption" fontWeight={700} display="block">
                            Вопрос {idx + 1}: {q.question_key}
                          </Typography>
                          <Typography variant="caption" display="block" sx={{ mt: 0.5, wordBreak: "break-word" }}>
                            {renderLatexStr(q.prompt_latex || "—")}
                          </Typography>
                          <Divider sx={{ my: 0.5 }} />
                          <Typography variant="caption" display="block">
                            Тип: {q.qtype} · Макс: {q.max_score} б.
                          </Typography>
                          <Typography variant="caption" display="block">
                            Верно: {q.correct_count} / {q.total_count} ({q.percent_correct}%)
                          </Typography>
                        </Box>
                      }
                      placement="top"
                      arrow
                    >
                      <TableCell
                        align="center"
                        sx={{
                          fontWeight: 600,
                          minWidth: 52,
                          maxWidth: 52,
                          px: 0.5,
                          bgcolor: "grey.50",
                          cursor: "default",
                          borderBottom: "2px solid",
                          borderColor: "divider",
                        }}
                      >
                        <Typography variant="caption" fontWeight={700}>
                          {idx + 1}
                        </Typography>
                        <Typography
                          variant="caption"
                          display="block"
                          sx={{ fontSize: 9, color: "text.secondary", lineHeight: 1.2 }}
                        >
                          {q.max_score}б
                        </Typography>
                      </TableCell>
                    </Tooltip>
                  ))}
                  {/* Итог */}
                  <TableCell
                    align="center"
                    sx={{
                      fontWeight: 700,
                      minWidth: 110,
                      position: "sticky",
                      right: 0,
                      zIndex: 3,
                      bgcolor: "grey.50",
                      borderLeft: "2px solid",
                      borderColor: "divider",
                    }}
                  >
                    Итог
                  </TableCell>
                </TableRow>
              </TableHead>

              <TableBody>
                {/* Строки учеников */}
                {matrix.rows.map((row) => (
                  <TableRow
                    key={row.student_id}
                    hover
                    sx={{
                      "&:hover": { bgcolor: "action.hover" },
                      opacity: row.attempt_id ? 1 : 0.55,
                    }}
                  >
                    {/* Имя ученика (фиксированный) */}
                    <TableCell
                      sx={{
                        position: "sticky",
                        left: 0,
                        zIndex: 1,
                        bgcolor: "background.paper",
                        borderRight: "2px solid",
                        borderColor: "divider",
                        py: 0.75,
                      }}
                    >
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        <Avatar
                          sx={{
                            width: 28,
                            height: 28,
                            fontSize: 12,
                            bgcolor: row.attempt_id
                              ? row.percent >= 70 ? "success.light" : row.percent >= 40 ? "warning.light" : "error.light"
                              : "grey.200",
                            color: row.attempt_id ? "text.primary" : "text.disabled",
                          }}
                        >
                          {row.student_name.charAt(0).toUpperCase()}
                        </Avatar>
                        <Box>
                          <Typography variant="body2" fontWeight={500} lineHeight={1.2}>
                            {row.student_name}
                          </Typography>
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{ fontFamily: "monospace", fontSize: 10 }}
                          >
                            {row.student_code}
                          </Typography>
                        </Box>
                      </Box>
                    </TableCell>

                    {/* Ячейки вопросов */}
                    {matrix.questions.map((q, idx) => {
                      const cell = row.cells[q.question_key] ?? null;
                      return (
                        <TableCell
                          key={q.question_key}
                          align="center"
                          sx={{ px: 0.5, py: 0.5 }}
                        >
                          {cell ? (
                            <Tooltip
                              title={<CellTooltipContent cell={cell} qnum={idx + 1} />}
                              placement="top"
                              arrow
                              componentsProps={{
                                tooltip: {
                                  sx: {
                                    bgcolor: "background.paper",
                                    color: "text.primary",
                                    boxShadow: 3,
                                    border: "1px solid",
                                    borderColor: "divider",
                                    maxWidth: 300,
                                  },
                                },
                                arrow: { sx: { color: "divider" } },
                              }}
                            >
                              <Box
                                sx={{
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  cursor: "default",
                                }}
                              >
                                <CellIcon cell={cell} />
                              </Box>
                            </Tooltip>
                          ) : (
                            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                              <CellIcon cell={null} />
                            </Box>
                          )}
                        </TableCell>
                      );
                    })}

                    {/* Итоговый балл (фиксированный справа) */}
                    <TableCell
                      align="center"
                      sx={{
                        position: "sticky",
                        right: 0,
                        zIndex: 1,
                        bgcolor: "background.paper",
                        borderLeft: "2px solid",
                        borderColor: "divider",
                        py: 0.75,
                        px: 1,
                      }}
                    >
                      {row.attempt_id ? (
                        <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 0.5 }}>
                          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                            <Typography variant="body2" fontWeight={700}>
                              {row.total_score}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              / {row.max_score}
                            </Typography>
                            <Tooltip title="Посмотреть разбор">
                              <IconButton
                                size="small"
                                sx={{ p: 0.25 }}
                                onClick={() => navigate(`/admin/attempts/${row.attempt_id}`, { state: { classId: selectedClass, assignmentId: selectedAssignment } })}
                              >
                                <VisibilityIcon sx={{ fontSize: 14 }} />
                              </IconButton>
                            </Tooltip>
                          </Box>
                          <PercentBar value={row.percent} compact />
                        </Box>
                      ) : (
                        <Chip label="Не сдал" size="small" variant="outlined" color="default" sx={{ fontSize: 10 }} />
                      )}
                    </TableCell>
                  </TableRow>
                ))}

                {/* Строка статистики по вопросам */}
                <TableRow
                  sx={{
                    bgcolor: "grey.50",
                    "& td": { borderTop: "2px solid", borderColor: "divider" },
                  }}
                >
                  <TableCell
                    sx={{
                      position: "sticky",
                      left: 0,
                      zIndex: 1,
                      bgcolor: "grey.50",
                      borderRight: "2px solid",
                      borderColor: "divider",
                      py: 1,
                    }}
                  >
                    <Typography variant="caption" fontWeight={700} color="text.secondary">
                      % верных ответов
                    </Typography>
                  </TableCell>
                  {matrix.questions.map((q) => (
                    <TableCell key={q.question_key} align="center" sx={{ px: 0.5, py: 1 }}>
                      {q.total_count > 0 ? (
                        <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 0.25 }}>
                          <Typography
                            variant="caption"
                            fontWeight={700}
                            sx={{
                              color: q.percent_correct >= 70
                                ? "success.main"
                                : q.percent_correct >= 40
                                ? "warning.main"
                                : "error.main",
                              fontSize: 11,
                            }}
                          >
                            {q.percent_correct}%
                          </Typography>
                          <Box
                            sx={{
                              width: 32,
                              height: 4,
                              borderRadius: 2,
                              bgcolor: q.percent_correct >= 70
                                ? "success.light"
                                : q.percent_correct >= 40
                                ? "warning.light"
                                : "error.light",
                              overflow: "hidden",
                            }}
                          >
                            <Box
                              sx={{
                                width: `${q.percent_correct}%`,
                                height: "100%",
                                bgcolor: q.percent_correct >= 70
                                  ? "success.main"
                                  : q.percent_correct >= 40
                                  ? "warning.main"
                                  : "error.main",
                              }}
                            />
                          </Box>
                        </Box>
                      ) : (
                        <Typography variant="caption" color="text.disabled">—</Typography>
                      )}
                    </TableCell>
                  ))}
                  <TableCell
                    align="center"
                    sx={{
                      position: "sticky",
                      right: 0,
                      zIndex: 1,
                      bgcolor: "grey.50",
                      borderLeft: "2px solid",
                      borderColor: "divider",
                    }}
                  >
                    <Typography variant="caption" fontWeight={700}>
                      Ср. {matrix.avg_percent}%
                    </Typography>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </TableContainer>

          {/* Детальная статистика по вопросам */}
          <Box sx={{ mt: 3 }}>
            <Typography variant="subtitle1" fontWeight={700} mb={1.5}>
              Статистика по вопросам
            </Typography>
            {matrix.questions.filter((q) => q.total_count > 0 && q.max_score > 0).length === 0 && (
              <Typography variant="body2" color="text.secondary">
                Нет данных — ни один ученик ещё не сдал это задание.
              </Typography>
            )}
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1.5 }}>
              {matrix.questions
                .map((q, origIdx) => ({ q, origIdx }))
                .filter(({ q }) => q.total_count > 0 && q.max_score > 0)
                .map(({ q, origIdx: idx }) => (
                <Card
                  key={q.question_key}
                  sx={{
                    flex: "1 1 200px",
                    minWidth: 180,
                    maxWidth: 260,
                    borderLeft: "4px solid",
                    borderColor: q.percent_correct >= 70
                      ? "success.main"
                      : q.percent_correct >= 40
                      ? "warning.main"
                      : q.total_count > 0
                      ? "error.main"
                      : "grey.300",
                  }}
                >
                  <CardContent sx={{ py: 1.5, "&:last-child": { pb: 1.5 } }}>
                    <Typography variant="caption" fontWeight={700} color="text.secondary">
                      Вопрос {idx + 1}
                    </Typography>
                    <Typography
                      variant="body2"
                      sx={{
                        mt: 0.25,
                        mb: 1,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        fontSize: 12,
                        lineHeight: 1.4,
                      }}
                    >
                      {renderLatexStr(q.prompt_latex || q.question_key)}
                    </Typography>
                    <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <Typography
                        variant="h6"
                        fontWeight={800}
                        sx={{
                          color: q.percent_correct >= 70
                            ? "success.main"
                            : q.percent_correct >= 40
                            ? "warning.main"
                            : q.total_count > 0
                            ? "error.main"
                            : "text.disabled",
                        }}
                      >
                        {q.total_count > 0 ? `${q.percent_correct}%` : "—"}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {q.correct_count}/{q.total_count} верно
                      </Typography>
                    </Box>
                    <LinearProgress
                      variant="determinate"
                      value={q.percent_correct}
                      color={
                        q.percent_correct >= 70 ? "success" : q.percent_correct >= 40 ? "warning" : "error"
                      }
                      sx={{ mt: 0.5, height: 4, borderRadius: 2 }}
                    />
                  </CardContent>
                </Card>
              ))}
            </Box>
          </Box>
        </>
      )}
        </Box>
      )} {/* end activeTab === 0 */}

      {/* Вкладка 2: Все попытки */}
      {activeTab === 1 && (
        <Box>
          {attemptsError && <Alert severity="error" onClose={() => setAttemptsError("")} sx={{ mb: 2 }}>{attemptsError}</Alert>}

          {/* Фильтры */}
          <Card sx={{ mb: 2 }}>
            <CardContent sx={{ pb: "12px !important" }}>
              <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
                <FormControl size="small" sx={{ minWidth: 180 }}>
                  <InputLabel>Класс</InputLabel>
                  <Select
                    value={attemptsClassFilter}
                    label="Класс"
                    onChange={(e) => setAttemptsClassFilter(e.target.value as number | "")}
                  >
                    <MenuItem value="">— все классы —</MenuItem>
                    {classes.map((c) => (
                      <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <TextField
                  size="small"
                  placeholder="Поиск по ученику, заданию, классу..."
                  value={attemptsSearch}
                  onChange={(e) => setAttemptsSearch(e.target.value)}
                  InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
                  sx={{ minWidth: 280 }}
                />
              </Stack>
            </CardContent>
          </Card>

          {attemptsLoading ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
              <CircularProgress />
            </Box>
          ) : filteredAttempts.length === 0 ? (
            <Paper sx={{ p: 4, textAlign: "center", color: "text.secondary" }}>
              Попыток не найдено
            </Paper>
          ) : (
            <TableContainer component={Paper}>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: "grey.50" }}>
                    <TableCell sx={{ fontWeight: 700 }}>Ученик</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Класс</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Задание</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Дата</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Время</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 700 }}>Результат</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>Действия</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredAttempts.map((att) => (
                    <TableRow key={att.id} hover>
                      <TableCell>
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                          <Avatar
                            sx={{
                              width: 28, height: 28, fontSize: 12,
                              bgcolor: att.percent >= 70 ? "success.light" : att.percent >= 40 ? "warning.light" : "error.light",
                            }}
                          >
                            {att.student_name.charAt(0)}
                          </Avatar>
                          <Box>
                            <Typography variant="body2" fontWeight={500}>{att.student_name}</Typography>
                            <Typography variant="caption" color="text.secondary" sx={{ fontFamily: "monospace", fontSize: 10 }}>
                              {att.student_code}
                            </Typography>
                          </Box>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Chip label={att.class_name} size="small" color="primary" variant="outlined" />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" fontWeight={500}>{att.assignment_title || att.assignment_id}</Typography>
                        <Typography variant="caption" color="text.secondary">{att.assignment_id}</Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">
                          {att.submitted_at ? new Date(att.submitted_at + "Z").toLocaleString("ru-RU") : "—"}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">{formatDuration(att.time_spent_seconds)}</Typography>
                      </TableCell>
                      <TableCell align="center">
                        <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 0.5 }}>
                          <Typography variant="body2" fontWeight={700}>
                            {att.total_score} / {att.max_score}
                          </Typography>
                          <LinearProgress
                            variant="determinate"
                            value={att.percent}
                            color={att.percent >= 70 ? "success" : att.percent >= 40 ? "warning" : "error"}
                            sx={{ height: 4, borderRadius: 2, width: 80 }}
                          />
                          <Typography variant="caption" color="text.secondary">{att.percent}%</Typography>
                        </Box>
                      </TableCell>
                      <TableCell align="right">
                        <Tooltip title="Посмотреть разбор">
                          <IconButton
                            size="small"
                            onClick={() => navigate(`/admin/attempts/${att.id}`, { state: { classId: attemptsClassFilter, assignmentId: att.assignment_id } })}
                          >
                            <VisibilityIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Удалить попытку">
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => handleDeleteAttempt(att.id)}
                            disabled={deletingId === att.id}
                          >
                            {deletingId === att.id ? <CircularProgress size={16} /> : <DeleteIcon fontSize="small" />}
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Box>
      )}
    </Box>
  );
}
