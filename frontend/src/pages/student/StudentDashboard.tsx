import { useEffect, useMemo, useState } from "react";
import {
  Box, Typography, Card, CardContent, Button, Alert, CircularProgress,
  LinearProgress, Chip, Divider, Avatar, AppBar, Toolbar, IconButton,
  Tab, Tabs, Badge,
} from "@mui/material";
import { Link, useNavigate } from "react-router-dom";
import LogoutIcon from "@mui/icons-material/Logout";
import AssignmentIcon from "@mui/icons-material/Assignment";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import HistoryIcon from "@mui/icons-material/History";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import SmartToyIcon from "@mui/icons-material/SmartToy";
import { getStudentMe, getStudentAssignments, getStudentSchedule, getMyAttempts, sendHeartbeat } from "../../api";
import { setStudentToken } from "../../auth";

type StudentMe = { id: number; name: string; code: string; class_id: number; class_name: string };
type Assignment = { id: string; title: string; description_latex: string; max_score: number };
type ScheduleItem = { date: string; assignment_id: string; title: string; max_score: number };
type AttemptItem = {
  attempt_id: number;
  assignment_id: string;
  assignment_title: string;
  submitted_at: string;
  total_score: number;
  max_score: number;
  percent: number;
};

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"] as const;
const MONTHS = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"] as const;

function pad2(n: number) { return n < 10 ? `0${n}` : String(n); }
function fmtYMD(d: Date) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }

export default function StudentDashboard() {
  const navigate = useNavigate();
  const [me, setMe] = useState<StudentMe | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [schedule, setSchedule] = useState<ScheduleItem[]>([]);
  const [attempts, setAttempts] = useState<AttemptItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState(0);
  const [monthCursor, setMonthCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDay, setSelectedDay] = useState(() => fmtYMD(new Date()));

  const today = useMemo(() => fmtYMD(new Date()), []);

  const loadAll = async () => {
    setLoading(true);
    setError("");
    try {
      const [meData, assignData, schedData, attData] = await Promise.all([
        getStudentMe(),
        getStudentAssignments(),
        getStudentSchedule(),
        getMyAttempts(),
      ]);
      setMe(meData);
      setAssignments(assignData);
      setSchedule(schedData);
      setAttempts(attData);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(msg || "Ошибка загрузки данных");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAll(); }, []);

  // Хеартбит каждые 60 секунд пока дашборд открыт
  useEffect(() => {
    sendHeartbeat().catch(() => {});
    const timer = setInterval(() => {
      sendHeartbeat().catch(() => {});
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  const handleLogout = () => {
    setStudentToken(null);
    navigate("/login");
  };

  const scheduleByDate = useMemo(() => {
    const m = new Map<string, ScheduleItem[]>();
    for (const it of schedule) {
      const arr = m.get(it.date) ?? [];
      arr.push(it);
      m.set(it.date, arr);
    }
    return m;
  }, [schedule]);

  const selectedItems = useMemo(() => scheduleByDate.get(selectedDay) ?? [], [scheduleByDate, selectedDay]);

  const calendarCells = useMemo(() => {
    const y = monthCursor.getFullYear();
    const m = monthCursor.getMonth();
    const first = new Date(y, m, 1);
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const firstDow = (first.getDay() + 6) % 7;
    const cells: Array<{ kind: "empty" } | { kind: "day"; day: number; ymd: string }> = [];
    for (let i = 0; i < firstDow; i++) cells.push({ kind: "empty" });
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ kind: "day", day: d, ymd: fmtYMD(new Date(y, m, d)) });
    }
    while (cells.length % 7 !== 0) cells.push({ kind: "empty" });
    return cells;
  }, [monthCursor]);

  const monthTitle = `${MONTHS[monthCursor.getMonth()]} ${monthCursor.getFullYear()}`;

  // Задания на сегодня
  const todayAssignments = assignments;
  const todayCount = todayAssignments.length;

  // Попытки по заданиям (для отображения статуса)
  const attemptsByAssignment = useMemo(() => {
    const m = new Map<string, AttemptItem[]>();
    for (const a of attempts) {
      const arr = m.get(a.assignment_id) ?? [];
      arr.push(a);
      m.set(a.assignment_id, arr);
    }
    return m;
  }, [attempts]);

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default" }}>
      {/* AppBar */}
      <AppBar position="sticky" elevation={0} sx={{ borderBottom: "1px solid", borderColor: "divider", bgcolor: "background.paper" }}>
        <Toolbar>
          <Avatar sx={{ bgcolor: "primary.main", mr: 1.5, width: 36, height: 36 }}>
            {me?.name?.charAt(0) || "?"}
          </Avatar>
          <Box sx={{ flex: 1 }}>
            <Typography variant="subtitle1" fontWeight={600} color="text.primary" lineHeight={1.2}>
              {me?.name || "Загрузка..."}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {me?.class_name} · {me?.code}
            </Typography>
          </Box>
          <IconButton onClick={handleLogout} color="default">
            <LogoutIcon />
          </IconButton>
        </Toolbar>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ px: 2, minHeight: 40 }}>
          <Tab
            label={
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                <AssignmentIcon fontSize="small" />
                <span>Задания</span>
                {todayCount > 0 && <Badge badgeContent={todayCount} color="primary" sx={{ ml: 0.5 }} />}
              </Box>
            }
            sx={{ minHeight: 40 }}
          />
          <Tab
            label={
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                <CalendarMonthIcon fontSize="small" />
                <span>Календарь</span>
              </Box>
            }
            sx={{ minHeight: 40 }}
          />
          <Tab
            label={
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                <HistoryIcon fontSize="small" />
                <span>История</span>
                {attempts.length > 0 && <Badge badgeContent={attempts.length} color="default" sx={{ ml: 0.5 }} />}
              </Box>
            }
            sx={{ minHeight: 40 }}
          />
        </Tabs>
      </AppBar>

      <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 700, mx: "auto" }}>
        {loading && <LinearProgress sx={{ mb: 2 }} />}
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        {/* Вкладка: Задания на сегодня */}
        {tab === 0 && (
          <Box>
            <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>
              Задания на сегодня
            </Typography>
            {todayAssignments.length === 0 ? (
              <Card>
                <CardContent sx={{ textAlign: "center", py: 4 }}>
                  <AssignmentIcon sx={{ fontSize: 48, color: "text.disabled", mb: 1 }} />
                  <Typography color="text.secondary">На сегодня заданий нет</Typography>
                </CardContent>
              </Card>
            ) : (
              <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {todayAssignments.map((a) => {
                  const myAttempts = attemptsByAssignment.get(a.id) ?? [];
                  const bestAttempt = myAttempts.length > 0
                    ? myAttempts.reduce((best, cur) => cur.total_score > best.total_score ? cur : best)
                    : null;
                  const isDone = bestAttempt !== null;

                  return (
                    <Card
                      key={a.id}
                      sx={{
                        borderLeft: "4px solid",
                        borderColor: isDone ? "success.main" : "primary.main",
                      }}
                    >
                      <CardContent>
                        <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 2 }}>
                          <Box sx={{ flex: 1 }}>
                            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
                              {isDone && <CheckCircleIcon color="success" fontSize="small" />}
                              <Typography variant="subtitle1" fontWeight={600}>{a.title}</Typography>
                            </Box>
                            <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                              <Chip label={`${a.max_score} баллов`} size="small" variant="outlined" />
                              {isDone && bestAttempt && (
                                <Chip
                                  label={`Лучший: ${bestAttempt.total_score}/${bestAttempt.max_score} (${bestAttempt.percent}%)`}
                                  size="small"
                                  color="success"
                                  variant="outlined"
                                />
                              )}
                              {myAttempts.length > 0 && (
                                <Chip label={`Попыток: ${myAttempts.length}`} size="small" variant="outlined" />
                              )}
                            </Box>
                            {isDone && bestAttempt && (
                              <LinearProgress
                                variant="determinate"
                                value={bestAttempt.percent}
                                color="success"
                                sx={{ mt: 1, height: 4, borderRadius: 2 }}
                              />
                            )}
                          </Box>
                          <Box sx={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 100 }}>
                            <Button
                              variant="contained"
                              component={Link}
                              to={`/assignment/${a.id}`}
                              size="small"
                            >
                              {isDone ? "Повторить" : "Открыть"}
                            </Button>
                            {isDone && bestAttempt && (
                              <Button
                                variant="outlined"
                                size="small"
                                component={Link}
                                to={`/attempts/${bestAttempt.attempt_id}`}
                              >
                                Разбор
                              </Button>
                            )}
                          </Box>
                        </Box>
                      </CardContent>
                    </Card>
                  );
                })}
              </Box>
            )}
          </Box>
        )}

        {/* Вкладка: Календарь */}
        {tab === 1 && (
          <Box>
            <Card>
              <CardContent>
                {/* Навигация по месяцу */}
                <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2 }}>
                  <Typography variant="h6" fontWeight={600}>{monthTitle}</Typography>
                  <Box sx={{ display: "flex", gap: 1 }}>
                    <Button size="small" variant="outlined" onClick={() => setMonthCursor((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))}>
                      ←
                    </Button>
                    <Button size="small" variant="contained" onClick={() => {
                      const now = new Date();
                      setMonthCursor(new Date(now.getFullYear(), now.getMonth(), 1));
                      setSelectedDay(fmtYMD(now));
                    }}>
                      Сегодня
                    </Button>
                    <Button size="small" variant="outlined" onClick={() => setMonthCursor((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))}>
                      →
                    </Button>
                  </Box>
                </Box>

                {/* Дни недели */}
                <Box sx={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 0.5, mb: 0.5 }}>
                  {WEEKDAYS.map((w) => (
                    <Box key={w} sx={{ textAlign: "center", fontSize: 12, color: "text.secondary", py: 0.5 }}>
                      {w}
                    </Box>
                  ))}
                </Box>

                {/* Ячейки */}
                <Box sx={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 0.5 }}>
                  {calendarCells.map((c, idx) => {
                    if (c.kind === "empty") return <Box key={idx} sx={{ height: 44 }} />;
                    const hasTasks = (scheduleByDate.get(c.ymd)?.length ?? 0) > 0;
                    const isToday = c.ymd === today;
                    const isSelected = c.ymd === selectedDay;
                    return (
                      <Box
                        key={c.ymd}
                        onClick={() => setSelectedDay(c.ymd)}
                        sx={{
                          cursor: "pointer", height: 44, borderRadius: 2,
                          border: isToday ? "2px solid" : "1px solid",
                          borderColor: isToday ? "primary.main" : "divider",
                          bgcolor: isSelected ? "primary.main" : "transparent",
                          color: isSelected ? "white" : "text.primary",
                          display: "flex", alignItems: "center", justifyContent: "space-between",
                          px: 1, transition: "all 0.1s",
                          "&:hover": { bgcolor: isSelected ? "primary.dark" : "action.hover" },
                        }}
                      >
                        <Typography variant="body2" fontWeight={isToday || isSelected ? 700 : 400}>
                          {c.day}
                        </Typography>
                        {hasTasks && (
                          <Box sx={{
                            width: 6, height: 6, borderRadius: "50%",
                            bgcolor: isSelected ? "white" : "primary.main",
                          }} />
                        )}
                      </Box>
                    );
                  })}
                </Box>

                <Divider sx={{ my: 2 }} />

                <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>
                  {selectedDay === today ? "Сегодня" : new Date(selectedDay + "T00:00:00").toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}
                </Typography>

                {selectedItems.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">На этот день ничего не назначено</Typography>
                ) : (
                  <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                    {selectedItems.map((it) => (
                      <Box
                        key={`${it.date}:${it.assignment_id}`}
                        sx={{ p: 1.5, borderRadius: 2, border: "1px solid", borderColor: "divider", display: "flex", justifyContent: "space-between", alignItems: "center" }}
                      >
                        <Box>
                          <Typography variant="body2" fontWeight={500}>{it.title}</Typography>
                          <Typography variant="caption" color="text.secondary">{it.max_score} баллов</Typography>
                        </Box>
                        <Button size="small" variant="contained" component={Link} to={`/assignment/${it.assignment_id}`}>
                          Открыть
                        </Button>
                      </Box>
                    ))}
                  </Box>
                )}
              </CardContent>
            </Card>
          </Box>
        )}

        {/* Вкладка: История */}
        {tab === 2 && (
          <Box>
            <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>
              История попыток
            </Typography>
            {attempts.length === 0 ? (
              <Card>
                <CardContent sx={{ textAlign: "center", py: 4 }}>
                  <HistoryIcon sx={{ fontSize: 48, color: "text.disabled", mb: 1 }} />
                  <Typography color="text.secondary">Попыток пока нет</Typography>
                </CardContent>
              </Card>
            ) : (
              <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
                {attempts.map((a) => {
                  const pct = a.percent;
                  const color = pct >= 90 ? "success" : pct >= 60 ? "primary" : pct >= 30 ? "warning" : "error";
                  return (
                    <Card key={a.attempt_id}>
                      <CardContent sx={{ py: 1.5, "&:last-child": { pb: 1.5 } }}>
                        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2 }}>
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography variant="body2" fontWeight={600} noWrap>{a.assignment_title}</Typography>
                            <Typography variant="caption" color="text.secondary">
                              {new Date(a.submitted_at).toLocaleString("ru-RU", {
                                day: "2-digit", month: "2-digit", year: "2-digit",
                                hour: "2-digit", minute: "2-digit",
                              })}
                            </Typography>
                            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 0.5 }}>
                              <LinearProgress
                                variant="determinate"
                                value={pct}
                                color={color}
                                sx={{ flex: 1, height: 4, borderRadius: 2 }}
                              />
                              <Typography variant="caption" fontWeight={700} color={`${color}.main`}>
                                {a.total_score}/{a.max_score}
                              </Typography>
                            </Box>
                          </Box>
                          <Button
                            size="small"
                            variant="outlined"
                            component={Link}
                            to={`/attempts/${a.attempt_id}`}
                          >
                            Разбор
                          </Button>
                        </Box>
                      </CardContent>
                    </Card>
                  );
                })}
              </Box>
            )}
          </Box>
        )}
      </Box>

      {/* Плавающая кнопка Робот-Исполнитель */}
      <Box
        sx={{
          position: "fixed", bottom: 24, right: 24,
          zIndex: 1200,
        }}
      >
        <Button
          variant="contained"
          startIcon={<SmartToyIcon />}
          component={Link}
          to="/robot"
          sx={{
            bgcolor: "#00C853", color: "#fff",
            fontWeight: 700, borderRadius: 3, px: 2.5, py: 1.2,
            boxShadow: "0 4px 20px rgba(0,200,83,0.4)",
            "&:hover": { bgcolor: "#00A846" },
          }}
        >
          Робот-Исполнитель
        </Button>
      </Box>
    </Box>
  );
}
