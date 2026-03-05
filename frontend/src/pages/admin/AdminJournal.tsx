import { useState, useEffect } from "react";
import {
  Box, Typography, Card, CardContent, Alert, CircularProgress,
  FormControl, InputLabel, Select, MenuItem, TextField,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Paper, Chip, Tooltip, IconButton, Badge,
} from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CancelIcon from "@mui/icons-material/Cancel";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import StarIcon from "@mui/icons-material/Star";
import { getClasses, getClassJournal } from "../../api";

interface ClassRoom { id: number; name: string; }

interface JournalRow {
  student_id: number;
  student_name: string;
  student_code: string;
  assignment_id: string;
  assignment_title: string;
  attempts_count: number;
  best_score: number;
  max_score: number;
  best_percent: number;
  last_submitted_at: string | null;
  status: "not_started" | "in_progress" | "done" | "perfect";
}

interface JournalData {
  class_id: number;
  class_name: string;
  date: string | null;
  assignments: string[];
  assignment_titles: Record<string, string>;
  rows: JournalRow[];
}

const STATUS_CONFIG = {
  not_started: { color: "#e0e0e0", label: "—", textColor: "#9e9e9e" },
  in_progress: { color: "#fff3e0", label: "В процессе", textColor: "#e65100" },
  done: { color: "#e8f5e9", label: "Сдано", textColor: "#2e7d32" },
  perfect: { color: "#e3f2fd", label: "Отлично", textColor: "#1565c0" },
};

function ScoreCell({ row, onClick }: { row: JournalRow; onClick: () => void }) {
  const cfg = STATUS_CONFIG[row.status];
  if (row.status === "not_started") {
    return (
      <TableCell align="center" sx={{ p: 0.5 }}>
        <Box sx={{ width: 60, mx: "auto", textAlign: "center", color: "text.disabled", fontSize: 18 }}>—</Box>
      </TableCell>
    );
  }
  return (
    <TableCell align="center" sx={{ p: 0.5 }}>
      <Tooltip
        title={
          <Box>
            <Typography variant="caption" display="block">{row.assignment_title}</Typography>
            <Typography variant="caption" display="block">Попыток: {row.attempts_count}</Typography>
            <Typography variant="caption" display="block">
              Лучший результат: {row.best_score}/{row.max_score} ({row.best_percent}%)
            </Typography>
            {row.last_submitted_at && (
              <Typography variant="caption" display="block">
                Последняя: {new Date(row.last_submitted_at).toLocaleString("ru-RU")}
              </Typography>
            )}
          </Box>
        }
        arrow
      >
        <Box
          onClick={onClick}
          sx={{
            width: 60, mx: "auto", py: 0.5, px: 0.5,
            borderRadius: 1.5, cursor: "pointer",
            bgcolor: cfg.color, color: cfg.textColor,
            display: "flex", flexDirection: "column", alignItems: "center",
            transition: "transform 0.1s",
            "&:hover": { transform: "scale(1.08)", filter: "brightness(0.95)" },
          }}
        >
          <Typography variant="caption" fontWeight={700} lineHeight={1.2}>
            {row.best_score}/{row.max_score}
          </Typography>
          <Typography sx={{ fontSize: 10, lineHeight: 1.2 }}>
            {row.best_percent}%
          </Typography>
          {row.attempts_count > 1 && (
            <Badge
              badgeContent={row.attempts_count}
              color="default"
              sx={{ "& .MuiBadge-badge": { fontSize: 9, minWidth: 14, height: 14, top: -2, right: -2 } }}
            />
          )}
        </Box>
      </Tooltip>
    </TableCell>
  );
}

export default function AdminJournal() {
  const [classes, setClasses] = useState<ClassRoom[]>([]);
  const [selectedClass, setSelectedClass] = useState<number | "">("");
  const [dateFilter, setDateFilter] = useState("");
  const [journal, setJournal] = useState<JournalData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadClasses = async () => {
    const cls: ClassRoom[] = await getClasses();
    setClasses(cls);
  };

  const loadJournal = async () => {
    if (!selectedClass) return;
    setLoading(true);
    setError("");
    try {
      const data = await getClassJournal(selectedClass as number, dateFilter || undefined);
      setJournal(data);
    } catch {
      setError("Ошибка загрузки журнала");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadClasses(); }, []);
  useEffect(() => { loadJournal(); }, [selectedClass, dateFilter]);

  // Получаем уникальных учеников
  const students = journal
    ? Array.from(new Map(journal.rows.map((r) => [r.student_id, r])).values())
    : [];

  // Строим матрицу: student_id -> assignment_id -> row
  const matrix: Record<number, Record<string, JournalRow>> = {};
  if (journal) {
    for (const row of journal.rows) {
      if (!matrix[row.student_id]) matrix[row.student_id] = {};
      matrix[row.student_id][row.assignment_id] = row;
    }
  }

  // Статистика по заданиям
  const assignmentStats = journal?.assignments.map((aid) => {
    const rows = journal.rows.filter((r) => r.assignment_id === aid && r.status !== "not_started");
    const total = students.length;
    const done = rows.length;
    const avgPct = done > 0 ? rows.reduce((s, r) => s + r.best_percent, 0) / done : 0;
    return { aid, done, total, avgPct: Math.round(avgPct) };
  }) ?? [];

  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 3 }}>
        <Box>
          <Typography variant="h5" fontWeight={700}>Журнал</Typography>
          <Typography variant="body2" color="text.secondary">
            Прогресс учеников по заданиям
          </Typography>
        </Box>
        <IconButton onClick={loadJournal} disabled={loading || !selectedClass}>
          <RefreshIcon />
        </IconButton>
      </Box>

      {error && <Alert severity="error" onClose={() => setError("")} sx={{ mb: 2 }}>{error}</Alert>}

      {/* Фильтры */}
      <Card sx={{ mb: 3 }}>
        <CardContent sx={{ pb: "12px !important" }}>
          <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
            <FormControl size="small" sx={{ minWidth: 180 }}>
              <InputLabel>Класс</InputLabel>
              <Select
                value={selectedClass}
                label="Класс"
                onChange={(e) => setSelectedClass(e.target.value as number | "")}
              >
                <MenuItem value="">Выберите класс</MenuItem>
                {classes.map((c) => (
                  <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              size="small" type="date" label="Дата (фильтр)"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              InputLabelProps={{ shrink: true }}
              sx={{ minWidth: 180 }}
            />
          </Box>
        </CardContent>
      </Card>

      {/* Легенда */}
      <Box sx={{ display: "flex", gap: 1.5, mb: 2, flexWrap: "wrap" }}>
        {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
          <Box key={key} sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
            <Box sx={{ width: 14, height: 14, borderRadius: 0.5, bgcolor: cfg.color, border: "1px solid #ccc" }} />
            <Typography variant="caption" color="text.secondary">{cfg.label}</Typography>
          </Box>
        ))}
      </Box>

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
          <CircularProgress />
        </Box>
      ) : !journal ? (
        <Card>
          <CardContent sx={{ textAlign: "center", py: 6 }}>
            <Typography color="text.secondary">Выберите класс для просмотра журнала</Typography>
          </CardContent>
        </Card>
      ) : journal.assignments.length === 0 ? (
        <Card>
          <CardContent sx={{ textAlign: "center", py: 6 }}>
            <Typography color="text.secondary">Нет заданий в расписании</Typography>
          </CardContent>
        </Card>
      ) : (
        <TableContainer component={Paper} sx={{ overflowX: "auto" }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell
                  sx={{
                    fontWeight: 700, minWidth: 160, position: "sticky", left: 0,
                    bgcolor: "background.paper", zIndex: 3, borderRight: "2px solid",
                    borderColor: "divider",
                  }}
                >
                  Ученик
                </TableCell>
                {journal.assignments.map((aid, idx) => {
                  const stat = assignmentStats[idx];
                  return (
                    <TableCell
                      key={aid}
                      align="center"
                      sx={{ fontWeight: 600, minWidth: 80, maxWidth: 100, p: 1 }}
                    >
                      <Tooltip title={journal.assignment_titles[aid] || aid} arrow>
                        <Box>
                          <Typography variant="caption" display="block" fontWeight={600} noWrap sx={{ maxWidth: 80 }}>
                            {journal.assignment_titles[aid]?.slice(0, 12) || aid}
                          </Typography>
                          <Typography sx={{ fontSize: 10, color: "text.secondary" }}>
                            {stat.done}/{stat.total} · {stat.avgPct}%
                          </Typography>
                        </Box>
                      </Tooltip>
                    </TableCell>
                  );
                })}
                <TableCell align="center" sx={{ fontWeight: 700, minWidth: 80 }}>Итого</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {students.map((s) => {
                const studentRows = matrix[s.student_id] || {};
                const doneCount = Object.values(studentRows).filter((r) => r.status !== "not_started").length;
                const totalPct = Object.values(studentRows).filter((r) => r.status !== "not_started")
                  .reduce((sum, r) => sum + r.best_percent, 0);
                const avgPct = doneCount > 0 ? Math.round(totalPct / doneCount) : 0;

                return (
                  <TableRow key={s.student_id} hover>
                    <TableCell
                      sx={{
                        position: "sticky", left: 0, bgcolor: "background.paper",
                        zIndex: 1, borderRight: "2px solid", borderColor: "divider",
                      }}
                    >
                      <Box>
                        <Typography variant="body2" fontWeight={500}>{s.student_name}</Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ fontFamily: "monospace" }}>
                          {s.student_code}
                        </Typography>
                      </Box>
                    </TableCell>
                    {journal.assignments.map((aid) => {
                      const row = studentRows[aid];
                      if (!row) {
                        return (
                          <TableCell key={aid} align="center" sx={{ p: 0.5 }}>
                            <Box sx={{ color: "text.disabled", textAlign: "center" }}>—</Box>
                          </TableCell>
                        );
                      }
                      return (
                        <ScoreCell
                          key={aid}
                          row={row}
                          onClick={() => {}}
                        />
                      );
                    })}
                    <TableCell align="center">
                      <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                        <Typography variant="body2" fontWeight={700}>
                          {doneCount}/{journal.assignments.length}
                        </Typography>
                        {doneCount > 0 && (
                          <Typography variant="caption" color="text.secondary">
                            {avgPct}%
                          </Typography>
                        )}
                      </Box>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
}
