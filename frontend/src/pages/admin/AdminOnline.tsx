import { useState, useEffect, useCallback } from "react";
import {
  Box, Typography, Paper, Select, MenuItem, FormControl, InputLabel,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Chip, IconButton, Tooltip, CircularProgress, Alert, Badge,
} from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";
import FiberManualRecordIcon from "@mui/icons-material/FiberManualRecord";
import { getClasses, getClassOnline } from "../../api";

interface ClassRoom {
  id: number;
  name: string;
}

interface StudentOnline {
  id: number;
  name: string;
  code: string;
  is_online: boolean;
  last_seen: string | null;
  assignment_id: string | null;
  assignment_title: string | null;
}

function formatLastSeen(lastSeen: string | null): string {
  if (!lastSeen) return "Никогда";
  const dt = new Date(lastSeen + "Z"); // UTC
  const now = new Date();
  const diffSec = Math.floor((now.getTime() - dt.getTime()) / 1000);
  if (diffSec < 10) return "только что";
  if (diffSec < 60) return `${diffSec} сек. назад`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)} мин. назад`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} ч. назад`;
  return dt.toLocaleString("ru-RU");
}

export default function AdminOnline() {
  const [classes, setClasses] = useState<ClassRoom[]>([]);
  const [selectedClass, setSelectedClass] = useState<number | "">("");
  const [students, setStudents] = useState<StudentOnline[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [tick, setTick] = useState(0); // для перерисовки таймеров

  useEffect(() => {
    getClasses().then((cls: ClassRoom[]) => setClasses(cls));
  }, []);

  const loadOnline = useCallback(async () => {
    if (!selectedClass) return;
    setLoading(true);
    setError("");
    try {
      const data = await getClassOnline(selectedClass as number);
      setStudents(data);
      setLastRefresh(new Date());
    } catch {
      setError("Ошибка загрузки данных");
    } finally {
      setLoading(false);
    }
  }, [selectedClass]);

  // Обновляем при смене класса
  useEffect(() => {
    if (selectedClass) loadOnline();
    else setStudents([]);
  }, [selectedClass, loadOnline]);

  // Автообновление каждые 10 секунд
  useEffect(() => {
    if (!selectedClass) return;
    const timer = setInterval(() => {
      loadOnline();
    }, 10000);
    return () => clearInterval(timer);
  }, [selectedClass, loadOnline]);

  // Перерисовываем таймеры каждые 5 секунд
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 5000);
    return () => clearInterval(timer);
  }, []);

  const onlineCount = students.filter((s) => s.is_online).length;
  const offlineCount = students.length - onlineCount;

  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 3, flexWrap: "wrap" }}>
        <Typography variant="h5" fontWeight={700}>
          Онлайн-класс
        </Typography>
        {lastRefresh && (
          <Typography variant="caption" color="text.secondary">
            Обновлено: {lastRefresh.toLocaleTimeString("ru-RU")}
          </Typography>
        )}
        <Box sx={{ flex: 1 }} />
        <Tooltip title="Обновить">
          <IconButton onClick={loadOnline} disabled={!selectedClass || loading}>
            {loading ? <CircularProgress size={20} /> : <RefreshIcon />}
          </IconButton>
        </Tooltip>
      </Box>

      <Box sx={{ display: "flex", gap: 2, mb: 3, flexWrap: "wrap" }}>
        <FormControl sx={{ minWidth: 200 }}>
          <InputLabel>Класс</InputLabel>
          <Select
            value={selectedClass}
            label="Класс"
            onChange={(e) => setSelectedClass(e.target.value as number | "")}
          >
            <MenuItem value="">— Выберите класс —</MenuItem>
            {classes.map((c) => (
              <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
            ))}
          </Select>
        </FormControl>

        {students.length > 0 && (
          <Box sx={{ display: "flex", gap: 1.5, alignItems: "center" }}>
            <Chip
              icon={<FiberManualRecordIcon sx={{ color: "#4caf50 !important", fontSize: 14 }} />}
              label={`Онлайн: ${onlineCount}`}
              sx={{ bgcolor: "#e8f5e9", color: "#2e7d32", fontWeight: 600 }}
            />
            <Chip
              icon={<FiberManualRecordIcon sx={{ color: "#f44336 !important", fontSize: 14 }} />}
              label={`Оффлайн: ${offlineCount}`}
              sx={{ bgcolor: "#ffebee", color: "#c62828", fontWeight: 600 }}
            />
          </Box>
        )}
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {!selectedClass && (
        <Paper sx={{ p: 4, textAlign: "center", color: "text.secondary" }}>
          Выберите класс для просмотра онлайн-статуса учеников
        </Paper>
      )}

      {selectedClass && students.length === 0 && !loading && (
        <Paper sx={{ p: 4, textAlign: "center", color: "text.secondary" }}>
          В классе нет учеников
        </Paper>
      )}

      {students.length > 0 && (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: "grey.50" }}>
                <TableCell sx={{ fontWeight: 700 }}>Статус</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Ученик</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Код</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Последняя активность</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Задание</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {students
                .slice()
                .sort((a, b) => {
                  if (a.is_online !== b.is_online) return a.is_online ? -1 : 1;
                  return a.name.localeCompare(b.name, "ru");
                })
                .map((s) => (
                  <TableRow
                    key={s.id}
                    sx={{
                      bgcolor: s.is_online ? "rgba(76,175,80,0.04)" : "transparent",
                      "&:hover": { bgcolor: s.is_online ? "rgba(76,175,80,0.08)" : "grey.50" },
                    }}
                  >
                    <TableCell>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        <Box
                          sx={{
                            width: 12,
                            height: 12,
                            borderRadius: "50%",
                            bgcolor: s.is_online ? "#4caf50" : "#f44336",
                            animation: s.is_online ? "pulse 1.5s infinite" : "none",
                            "@keyframes pulse": {
                              "0%": { boxShadow: "0 0 0 0 rgba(76,175,80,0.5)" },
                              "70%": { boxShadow: "0 0 0 6px rgba(76,175,80,0)" },
                              "100%": { boxShadow: "0 0 0 0 rgba(76,175,80,0)" },
                            },
                          }}
                        />
                        <Typography variant="body2" sx={{ color: s.is_online ? "#2e7d32" : "#c62828", fontWeight: 600 }}>
                          {s.is_online ? "Онлайн" : "Оффлайн"}
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" fontWeight={500}>{s.name}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontFamily: "monospace", color: "text.secondary" }}>
                        {s.code}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {/* tick is used to force re-render for time updates */}
                        {tick >= 0 && formatLastSeen(s.last_seen)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      {s.assignment_id ? (
                        <Chip
                          label={s.assignment_title || s.assignment_id}
                          size="small"
                          color="primary"
                          variant="outlined"
                          sx={{ fontSize: 11 }}
                        />
                      ) : (
                        <Typography variant="body2" color="text.disabled">—</Typography>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
}
