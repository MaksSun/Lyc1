import { useState, useEffect } from "react";
import {
  Box, Typography, Button, Card, CardContent, Alert, CircularProgress,
  FormControl, InputLabel, Select, MenuItem, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Paper, IconButton,
  Chip, Dialog, DialogTitle, DialogContent, DialogActions, TextField,
  Switch, FormControlLabel, Tooltip, Divider,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import SettingsIcon from "@mui/icons-material/Settings";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import {
  getClasses, getSchedule, addScheduleItem, deleteScheduleItem,
  getAdminAssignments, getAssignConfig, setAssignConfig,
} from "../../api";

interface ClassRoom { id: number; name: string; }
interface Assignment { id: string; title: string; max_score: number; }
interface ScheduleItem {
  id: number; class_id: number; class_name: string;
  date: string; assignment_id: string; title: string; max_score: number;
}
interface AssignConfig { student_assign_limit: number; student_assign_random: boolean; }

export default function AdminSchedule() {
  const [classes, setClasses] = useState<ClassRoom[]>([]);
  const [selectedClass, setSelectedClass] = useState<number | "">("");
  const [schedule, setSchedule] = useState<ScheduleItem[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Диалог добавления
  const [addOpen, setAddOpen] = useState(false);
  const [newDate, setNewDate] = useState(new Date().toISOString().slice(0, 10));
  const [newAssignId, setNewAssignId] = useState("");
  const [saving, setSaving] = useState(false);

  // Диалог настроек
  const [configOpen, setConfigOpen] = useState(false);
  const [config, setConfig] = useState<AssignConfig>({ student_assign_limit: 0, student_assign_random: false });

  const loadClasses = async () => {
    const cls: ClassRoom[] = await getClasses();
    setClasses(cls);
  };

  const loadSchedule = async () => {
    setLoading(true);
    try {
      const data: ScheduleItem[] = await getSchedule(selectedClass || undefined);
      setSchedule(data);
    } catch {
      setError("Ошибка загрузки расписания");
    } finally {
      setLoading(false);
    }
  };

  const loadAssignments = async () => {
    if (!selectedClass) return;
    const cls = classes.find((c) => c.id === selectedClass);
    if (!cls) return;
    try {
      const data: Assignment[] = await getAdminAssignments(cls.name);
      setAssignments(data);
    } catch {
      setAssignments([]);
    }
  };

  const loadConfig = async () => {
    if (!selectedClass) return;
    try {
      const data: AssignConfig = await getAssignConfig(selectedClass as number);
      setConfig(data);
    } catch {
      setConfig({ student_assign_limit: 0, student_assign_random: false });
    }
  };

  useEffect(() => { loadClasses(); }, []);
  useEffect(() => {
    loadSchedule();
    loadAssignments();
    loadConfig();
  }, [selectedClass]);

  const handleAdd = async () => {
    if (!selectedClass || !newDate || !newAssignId) return;
    setSaving(true);
    try {
      await addScheduleItem({ class_id: selectedClass as number, date: newDate, assignment_id: newAssignId });
      setAddOpen(false);
      setNewAssignId("");
      setSuccess("Задание добавлено в расписание");
      await loadSchedule();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(msg || "Ошибка добавления");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteScheduleItem(id);
      setSuccess("Запись удалена");
      await loadSchedule();
    } catch {
      setError("Ошибка удаления");
    }
  };

  const handleSaveConfig = async () => {
    if (!selectedClass) return;
    setSaving(true);
    try {
      await setAssignConfig(selectedClass as number, config);
      setConfigOpen(false);
      setSuccess("Настройки сохранены");
    } catch {
      setError("Ошибка сохранения настроек");
    } finally {
      setSaving(false);
    }
  };

  // Группируем расписание по дате
  const grouped = schedule.reduce<Record<string, ScheduleItem[]>>((acc, item) => {
    if (!acc[item.date]) acc[item.date] = [];
    acc[item.date].push(item);
    return acc;
  }, {});
  const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  const formatDate = (d: string) => {
    const dt = new Date(d + "T00:00:00");
    return dt.toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" });
  };

  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 3 }}>
        <Box>
          <Typography variant="h5" fontWeight={700}>Расписание заданий</Typography>
          <Typography variant="body2" color="text.secondary">
            Назначайте задания классам на конкретные даты
          </Typography>
        </Box>
        <Box sx={{ display: "flex", gap: 1 }}>
          {selectedClass && (
            <Tooltip title="Настройки выдачи заданий">
              <IconButton onClick={() => setConfigOpen(true)} color="default">
                <SettingsIcon />
              </IconButton>
            </Tooltip>
          )}
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setAddOpen(true)}
            disabled={!selectedClass}
          >
            Добавить задание
          </Button>
        </Box>
      </Box>

      {error && <Alert severity="error" onClose={() => setError("")} sx={{ mb: 2 }}>{error}</Alert>}
      {success && <Alert severity="success" onClose={() => setSuccess("")} sx={{ mb: 2 }}>{success}</Alert>}

      {/* Фильтр по классу */}
      <Card sx={{ mb: 3 }}>
        <CardContent sx={{ pb: "12px !important" }}>
          <FormControl size="small" sx={{ minWidth: 200 }}>
            <InputLabel>Выберите класс</InputLabel>
            <Select
              value={selectedClass}
              label="Выберите класс"
              onChange={(e) => setSelectedClass(e.target.value as number | "")}
            >
              <MenuItem value="">Все классы</MenuItem>
              {classes.map((c) => (
                <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </CardContent>
      </Card>

      {/* Расписание */}
      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
          <CircularProgress />
        </Box>
      ) : schedule.length === 0 ? (
        <Card>
          <CardContent sx={{ textAlign: "center", py: 6 }}>
            <CalendarMonthIcon sx={{ fontSize: 64, color: "text.disabled", mb: 2 }} />
            <Typography variant="h6" color="text.secondary">Расписание пусто</Typography>
            <Typography variant="body2" color="text.disabled" sx={{ mb: 2 }}>
              {selectedClass ? "Выберите задание и добавьте его в расписание" : "Выберите класс для просмотра расписания"}
            </Typography>
          </CardContent>
        </Card>
      ) : (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {sortedDates.map((date) => (
            <Card key={date}>
              <CardContent sx={{ pb: "12px !important" }}>
                <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1.5, textTransform: "capitalize" }}>
                  {formatDate(date)}
                </Typography>
                <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                  {grouped[date].map((item) => (
                    <Box
                      key={item.id}
                      sx={{
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        p: 1.5, borderRadius: 2, bgcolor: "grey.50",
                        border: "1px solid", borderColor: "divider",
                      }}
                    >
                      <Box>
                        <Typography variant="body2" fontWeight={500}>{item.title}</Typography>
                        <Box sx={{ display: "flex", gap: 1, mt: 0.5 }}>
                          <Chip label={item.class_name} size="small" color="primary" variant="outlined" />
                          <Chip label={`${item.max_score} баллов`} size="small" variant="outlined" />
                          <Chip label={item.assignment_id} size="small" variant="outlined" sx={{ fontFamily: "monospace" }} />
                        </Box>
                      </Box>
                      <IconButton size="small" color="error" onClick={() => handleDelete(item.id)}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Box>
                  ))}
                </Box>
              </CardContent>
            </Card>
          ))}
        </Box>
      )}

      {/* Диалог добавления */}
      <Dialog open={addOpen} onClose={() => setAddOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Добавить задание в расписание</DialogTitle>
        <DialogContent>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}>
            <TextField
              fullWidth type="date" label="Дата"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
            <FormControl fullWidth>
              <InputLabel>Задание</InputLabel>
              <Select
                value={newAssignId}
                label="Задание"
                onChange={(e) => setNewAssignId(e.target.value)}
              >
                {assignments.length === 0 ? (
                  <MenuItem disabled>Нет доступных заданий</MenuItem>
                ) : (
                  assignments.map((a) => (
                    <MenuItem key={a.id} value={a.id}>
                      {a.title} ({a.max_score} б.)
                    </MenuItem>
                  ))
                )}
              </Select>
            </FormControl>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddOpen(false)}>Отмена</Button>
          <Button variant="contained" onClick={handleAdd} disabled={saving || !newAssignId}>
            {saving ? <CircularProgress size={20} /> : "Добавить"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Диалог настроек */}
      <Dialog open={configOpen} onClose={() => setConfigOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Настройки выдачи заданий</DialogTitle>
        <DialogContent>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}>
            <TextField
              fullWidth type="number" label="Максимум заданий на ученика"
              value={config.student_assign_limit}
              onChange={(e) => setConfig({ ...config, student_assign_limit: parseInt(e.target.value) || 0 })}
              helperText="0 — показывать все задания"
              inputProps={{ min: 0, max: 100 }}
            />
            <FormControlLabel
              control={
                <Switch
                  checked={config.student_assign_random}
                  onChange={(e) => setConfig({ ...config, student_assign_random: e.target.checked })}
                />
              }
              label="Случайный порядок заданий"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfigOpen(false)}>Отмена</Button>
          <Button variant="contained" onClick={handleSaveConfig} disabled={saving}>
            {saving ? <CircularProgress size={20} /> : "Сохранить"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
