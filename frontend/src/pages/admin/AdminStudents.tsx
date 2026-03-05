import { useState, useEffect } from "react";
import {
  Box, Typography, Button, Card, CardContent, TextField,
  Dialog, DialogTitle, DialogContent, DialogActions,
  IconButton, Alert, CircularProgress, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Paper,
  FormControl, InputLabel, Select, MenuItem, Chip,
  Tabs, Tab, Tooltip, InputAdornment, Checkbox, Stack,
  Divider, LinearProgress,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import DeleteSweepIcon from "@mui/icons-material/DeleteSweep";
import EditIcon from "@mui/icons-material/Edit";
import SearchIcon from "@mui/icons-material/Search";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import BadgeIcon from "@mui/icons-material/Badge";
import PrintIcon from "@mui/icons-material/Print";
import HistoryIcon from "@mui/icons-material/History";
import LoginIcon from "@mui/icons-material/Login";
import CheckBoxIcon from "@mui/icons-material/CheckBox";
import CheckBoxOutlineBlankIcon from "@mui/icons-material/CheckBoxOutlineBlank";
import {
  getClasses, getStudents, createStudent, deleteStudent,
  updateStudent, bulkCreateStudents, api,
} from "../../api";

interface ClassRoom { id: number; name: string; }
interface Student { id: number; name: string; code: string; class_id: number; class_name: string; }
interface AttemptSummary {
  id: number;
  assignment_id: string;
  assignment_title: string;
  class_name: string;
  submitted_at: string | null;
  started_at: string | null;
  time_spent_seconds: number | null;
  total_score: number;
  max_score: number;
  percent: number;
}
interface LoginLogEntry {
  id: number;
  student_name: string;
  class_name: string;
  logged_in_at: string;
  ip_address: string | null;
  device_type: string | null;
  browser: string | null;
  os: string | null;
}

function formatDuration(seconds: number | null): string {
  if (seconds === null || seconds === undefined) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m} мин ${s} с` : `${s} с`;
}

export default function AdminStudents() {
  const [classes, setClasses] = useState<ClassRoom[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedClass, setSelectedClass] = useState<number | "">("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Выбор для массового удаления
  const [selected, setSelected] = useState<Set<number>>(new Set());

  // Диалог добавления
  const [addOpen, setAddOpen] = useState(false);
  const [addTab, setAddTab] = useState(0);
  const [newName, setNewName] = useState("");
  const [newCode, setNewCode] = useState("");
  const [newClassId, setNewClassId] = useState<number | "">("");
  const [bulkText, setBulkText] = useState("");
  const [saving, setSaving] = useState(false);

  // Диалог редактирования
  const [editOpen, setEditOpen] = useState(false);
  const [editStudent, setEditStudent] = useState<Student | null>(null);
  const [editName, setEditName] = useState("");
  const [editCode, setEditCode] = useState("");

  // Диалог удаления одного
  const [deleteId, setDeleteId] = useState<number | null>(null);

  // Диалог массового удаления
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // Диалог истории попыток
  const [attemptsStudent, setAttemptsStudent] = useState<Student | null>(null);
  const [attempts, setAttempts] = useState<AttemptSummary[]>([]);
  const [attemptsLoading, setAttemptsLoading] = useState(false);

  // Диалог журнала входов
  const [logsOpen, setLogsOpen] = useState(false);
  const [logs, setLogs] = useState<LoginLogEntry[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsClass, setLogsClass] = useState<number | "">("");

  // Диалог 10 карточек на листе
  const [cards10Open, setCards10Open] = useState(false);
  const [cards10Url, setCards10Url] = useState("");
  const [cards10Loading, setCards10Loading] = useState(false);

  const loadClasses = async () => {
    const cls: ClassRoom[] = await getClasses();
    setClasses(cls);
  };

  const loadStudents = async () => {
    setLoading(true);
    try {
      const data: Student[] = await getStudents(selectedClass || undefined);
      setStudents(data);
      setSelected(new Set());
    } catch {
      setError("Ошибка загрузки учеников");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadClasses(); }, []);
  useEffect(() => { loadStudents(); }, [selectedClass]);

  const filtered = students.filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.code.toLowerCase().includes(search.toLowerCase())
  );

  // ─── Добавление ──────────────────────────────────────────────────────────────
  const handleAdd = async () => {
    if (!newName.trim() || !newCode.trim() || !newClassId) return;
    setSaving(true);
    try {
      await createStudent({ name: newName.trim(), code: newCode.trim().toUpperCase(), class_id: newClassId as number });
      setAddOpen(false);
      setNewName(""); setNewCode(""); setNewClassId("");
      setSuccess("Ученик добавлен");
      await loadStudents();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(msg || "Ошибка добавления");
    } finally {
      setSaving(false);
    }
  };

  const handleBulkAdd = async () => {
    if (!newClassId || !bulkText.trim()) return;
    setSaving(true);
    try {
      const lines = bulkText.trim().split("\n").filter(Boolean);
      const items = lines.map((line) => {
        const parts = line.split(/[\t,;]+/);
        return { name: parts[0]?.trim() || "", code: parts[1]?.trim() || undefined };
      }).filter((i) => i.name);
      const result = await bulkCreateStudents(newClassId as number, items);
      setAddOpen(false);
      setBulkText(""); setNewClassId("");
      setSuccess(`Добавлено: ${result.created_count} учеников`);
      await loadStudents();
    } catch {
      setError("Ошибка массового добавления");
    } finally {
      setSaving(false);
    }
  };

  // ─── Редактирование ───────────────────────────────────────────────────────────
  const handleEdit = async () => {
    if (!editStudent) return;
    setSaving(true);
    try {
      await updateStudent(editStudent.id, { name: editName.trim(), code: editCode.trim().toUpperCase() });
      setEditOpen(false);
      setSuccess("Данные обновлены");
      await loadStudents();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(msg || "Ошибка обновления");
    } finally {
      setSaving(false);
    }
  };

  // ─── Удаление одного ─────────────────────────────────────────────────────────
  const handleDelete = async (id: number) => {
    try {
      await deleteStudent(id);
      setDeleteId(null);
      setSuccess("Ученик удалён");
      await loadStudents();
    } catch {
      setError("Ошибка удаления");
    }
  };

  // ─── Массовое удаление ───────────────────────────────────────────────────────
  const handleBulkDelete = async () => {
    if (selected.size === 0) return;
    setBulkDeleting(true);
    try {
      await api.post("/api/admin/students/bulk-delete", { student_ids: Array.from(selected) });
      setBulkDeleteOpen(false);
      setSelected(new Set());
      setSuccess(`Удалено ${selected.size} учеников`);
      await loadStudents();
    } catch {
      setError("Ошибка массового удаления");
    } finally {
      setBulkDeleting(false);
    }
  };

  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((s) => s.id)));
    }
  };

  // ─── Карточки ────────────────────────────────────────────────────────────────
  const downloadCard = (studentId: number) => {
    const token = localStorage.getItem("ltp_admin_token");
    const url = `/api/admin/students/${studentId}/card`;
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.blob())
      .then((blob) => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `student_card_${studentId}.pdf`;
        a.click();
      });
  };

  const downloadClassCards = (classId: number) => {
    const token = localStorage.getItem("ltp_admin_token");
    const url = `/api/admin/classes/${classId}/cards`;
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.blob())
      .then((blob) => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `class_cards_${classId}.pdf`;
        a.click();
      });
  };

  const openCards10Dialog = async () => {
    setCards10Open(true);
    // Автоматически получаем IP сервера
    try {
      const token = localStorage.getItem("ltp_admin_token");
      const data = await fetch("/api/admin/server-info", {
        headers: { Authorization: `Bearer ${token}` },
      }).then((r) => r.json());
      if (data.frontend_url) {
        setCards10Url(data.frontend_url);
      } else {
        // Fallback: используем текущий origin браузера
        setCards10Url(window.location.origin);
      }
    } catch {
      setCards10Url(window.location.origin);
    }
  };

  const downloadClassCards10 = (classId: number) => {
    setCards10Loading(true);
    const token = localStorage.getItem("ltp_admin_token");
    const encodedUrl = encodeURIComponent(cards10Url.trim());
    const url = `/api/admin/classes/${classId}/cards10?base_url=${encodedUrl}`;
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.blob())
      .then((blob) => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `cards10_class_${classId}.pdf`;
        a.click();
        setCards10Open(false);
      })
      .catch(() => setError("Ошибка генерации PDF"))
      .finally(() => setCards10Loading(false));
  };

  // ─── История попыток ─────────────────────────────────────────────────────────
  const openAttempts = async (s: Student) => {
    setAttemptsStudent(s);
    setAttempts([]);
    setAttemptsLoading(true);
    try {
      const token = localStorage.getItem("ltp_admin_token");
      const data = await fetch(`/api/admin/students/${s.id}/attempts`, {
        headers: { Authorization: `Bearer ${token}` },
      }).then((r) => r.json());
      setAttempts(data);
    } catch {
      setError("Ошибка загрузки попыток");
    } finally {
      setAttemptsLoading(false);
    }
  };

  // ─── Журнал входов ───────────────────────────────────────────────────────────
  const openLogs = async () => {
    setLogsOpen(true);
    setLogsLoading(true);
    try {
      const token = localStorage.getItem("ltp_admin_token");
      const params = logsClass ? `?class_id=${logsClass}&limit=200` : "?limit=200";
      const data = await fetch(`/api/admin/login-logs${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      }).then((r) => r.json());
      setLogs(data);
    } catch {
      setError("Ошибка загрузки журнала");
    } finally {
      setLogsLoading(false);
    }
  };

  const openEdit = (s: Student) => {
    setEditStudent(s);
    setEditName(s.name);
    setEditCode(s.code);
    setEditOpen(true);
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setSuccess("Код скопирован");
  };

  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 3 }}>
        <Box>
          <Typography variant="h5" fontWeight={700}>Ученики</Typography>
          <Typography variant="body2" color="text.secondary">
            {filtered.length} из {students.length} учеников
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Tooltip title="Журнал входов">
            <Button variant="outlined" startIcon={<LoginIcon />} onClick={openLogs}>
              Журнал
            </Button>
          </Tooltip>
          {selectedClass && (
            <>
              <Tooltip title="Карточки класса (4 на листе)">
                <Button variant="outlined" startIcon={<PrintIcon />} onClick={() => downloadClassCards(selectedClass as number)}>
                  4 на листе
                </Button>
              </Tooltip>
              <Tooltip title="Карточки класса (10 на листе) — с QR-ссылкой">
                <Button variant="outlined" color="secondary" startIcon={<PrintIcon />} onClick={openCards10Dialog}>
                  10 на листе
                </Button>
              </Tooltip>
            </>
          )}
          {selected.size > 0 && (
            <Button
              variant="outlined"
              color="error"
              startIcon={<DeleteSweepIcon />}
              onClick={() => setBulkDeleteOpen(true)}
            >
              Удалить выбранных ({selected.size})
            </Button>
          )}
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setAddOpen(true)}>
            Добавить
          </Button>
        </Stack>
      </Box>

      {error && <Alert severity="error" onClose={() => setError("")} sx={{ mb: 2 }}>{error}</Alert>}
      {success && <Alert severity="success" onClose={() => setSuccess("")} sx={{ mb: 2 }}>{success}</Alert>}

      {/* Фильтры */}
      <Card sx={{ mb: 2 }}>
        <CardContent sx={{ pb: "12px !important" }}>
          <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
            <FormControl size="small" sx={{ minWidth: 160 }}>
              <InputLabel>Класс</InputLabel>
              <Select
                value={selectedClass}
                label="Класс"
                onChange={(e) => setSelectedClass(e.target.value as number | "")}
              >
                <MenuItem value="">Все классы</MenuItem>
                {classes.map((c) => (
                  <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              size="small"
              placeholder="Поиск по имени или коду..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
              sx={{ minWidth: 240 }}
            />
          </Box>
        </CardContent>
      </Card>

      {/* Таблица */}
      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ bgcolor: "grey.50" }}>
              <TableCell padding="checkbox">
                <Checkbox
                  size="small"
                  checked={filtered.length > 0 && selected.size === filtered.length}
                  indeterminate={selected.size > 0 && selected.size < filtered.length}
                  onChange={toggleSelectAll}
                  icon={<CheckBoxOutlineBlankIcon fontSize="small" />}
                  checkedIcon={<CheckBoxIcon fontSize="small" />}
                />
              </TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Имя</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Код входа</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Класс</TableCell>
              <TableCell align="right" sx={{ fontWeight: 600 }}>Действия</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} align="center" sx={{ py: 4 }}>
                  <CircularProgress size={32} />
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} align="center" sx={{ py: 4, color: "text.secondary" }}>
                  Ученики не найдены
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((s) => (
                <TableRow key={s.id} hover selected={selected.has(s.id)}>
                  <TableCell padding="checkbox">
                    <Checkbox
                      size="small"
                      checked={selected.has(s.id)}
                      onChange={() => toggleSelect(s.id)}
                    />
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" fontWeight={500}>{s.name}</Typography>
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                      <Chip
                        label={s.code}
                        size="small"
                        variant="outlined"
                        sx={{ fontFamily: "monospace", fontWeight: 600, fontSize: 13 }}
                      />
                      <Tooltip title="Скопировать код">
                        <IconButton size="small" onClick={() => copyCode(s.code)}>
                          <ContentCopyIcon sx={{ fontSize: 14 }} />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Chip label={s.class_name} size="small" color="primary" variant="outlined" />
                  </TableCell>
                  <TableCell align="right">
                    <Tooltip title="История попыток">
                      <IconButton size="small" onClick={() => openAttempts(s)}>
                        <HistoryIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Скачать карточку (PDF)">
                      <IconButton size="small" onClick={() => downloadCard(s.id)}>
                        <BadgeIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Редактировать">
                      <IconButton size="small" onClick={() => openEdit(s)}>
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Удалить">
                      <IconButton size="small" color="error" onClick={() => setDeleteId(s.id)}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* ─── Диалог добавления ─────────────────────────────────────────────── */}
      <Dialog open={addOpen} onClose={() => setAddOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Добавить ученика</DialogTitle>
        <DialogContent>
          <Tabs value={addTab} onChange={(_, v) => setAddTab(v)} sx={{ mb: 2 }}>
            <Tab label="Один ученик" />
            <Tab label="Список (массово)" icon={<UploadFileIcon />} iconPosition="end" />
          </Tabs>

          {addTab === 0 ? (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <FormControl fullWidth>
                <InputLabel>Класс</InputLabel>
                <Select value={newClassId} label="Класс" onChange={(e) => setNewClassId(e.target.value as number)}>
                  {classes.map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
                </Select>
              </FormControl>
              <TextField
                fullWidth label="Имя ученика"
                placeholder="Иванов Иван"
                value={newName} onChange={(e) => setNewName(e.target.value)}
              />
              <TextField
                fullWidth label="Код входа (7 символов)"
                placeholder="ABC1234"
                value={newCode}
                onChange={(e) => setNewCode(e.target.value.toUpperCase().slice(0, 7))}
                inputProps={{ maxLength: 7 }}
                helperText="Оставьте пустым для автогенерации"
              />
            </Box>
          ) : (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <FormControl fullWidth>
                <InputLabel>Класс</InputLabel>
                <Select value={newClassId} label="Класс" onChange={(e) => setNewClassId(e.target.value as number)}>
                  {classes.map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
                </Select>
              </FormControl>
              <TextField
                fullWidth multiline rows={8}
                label="Список учеников"
                placeholder={"Иванов Иван\nПетров Пётр ABC1234\nСидорова Мария"}
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                helperText="Один ученик на строку. Формат: «Имя» или «Имя КОД». Код генерируется автоматически если не указан."
              />
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddOpen(false)}>Отмена</Button>
          <Button
            variant="contained"
            onClick={addTab === 0 ? handleAdd : handleBulkAdd}
            disabled={saving}
          >
            {saving ? <CircularProgress size={20} /> : "Добавить"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ─── Диалог редактирования ─────────────────────────────────────────── */}
      <Dialog open={editOpen} onClose={() => setEditOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Редактировать ученика</DialogTitle>
        <DialogContent>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}>
            <TextField fullWidth label="Имя" value={editName} onChange={(e) => setEditName(e.target.value)} />
            <TextField
              fullWidth label="Код входа"
              value={editCode}
              onChange={(e) => setEditCode(e.target.value.toUpperCase().slice(0, 7))}
              inputProps={{ maxLength: 7 }}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditOpen(false)}>Отмена</Button>
          <Button variant="contained" onClick={handleEdit} disabled={saving}>
            {saving ? <CircularProgress size={20} /> : "Сохранить"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ─── Диалог удаления одного ────────────────────────────────────────── */}
      <Dialog open={deleteId !== null} onClose={() => setDeleteId(null)}>
        <DialogTitle>Удалить ученика?</DialogTitle>
        <DialogContent>
          <Typography>Все попытки и результаты ученика будут удалены.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteId(null)}>Отмена</Button>
          <Button color="error" variant="contained" onClick={() => deleteId && handleDelete(deleteId)}>
            Удалить
          </Button>
        </DialogActions>
      </Dialog>

      {/* ─── Диалог массового удаления ─────────────────────────────────────── */}
      <Dialog open={bulkDeleteOpen} onClose={() => setBulkDeleteOpen(false)}>
        <DialogTitle>Удалить {selected.size} учеников?</DialogTitle>
        <DialogContent>
          <Typography>Все попытки и результаты выбранных учеников будут удалены. Это действие необратимо.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBulkDeleteOpen(false)}>Отмена</Button>
          <Button color="error" variant="contained" onClick={handleBulkDelete} disabled={bulkDeleting}>
            {bulkDeleting ? <CircularProgress size={20} /> : `Удалить ${selected.size}`}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ─── Диалог истории попыток ────────────────────────────────────────── */}
      <Dialog
        open={attemptsStudent !== null}
        onClose={() => setAttemptsStudent(null)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          История попыток — {attemptsStudent?.name}
          <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
            {attemptsStudent?.class_name}
          </Typography>
        </DialogTitle>
        <DialogContent>
          {attemptsLoading ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
              <CircularProgress />
            </Box>
          ) : attempts.length === 0 ? (
            <Typography color="text.secondary" sx={{ py: 2 }}>Попыток нет</Typography>
          ) : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: "grey.50" }}>
                    <TableCell sx={{ fontWeight: 600 }}>Задание</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Дата</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Время</TableCell>
                    <TableCell sx={{ fontWeight: 600 }} align="center">Результат</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {attempts.map((att) => (
                    <TableRow key={att.id} hover>
                      <TableCell>
                        <Typography variant="body2" fontWeight={500}>{att.assignment_title || att.assignment_id}</Typography>
                        <Typography variant="caption" color="text.secondary">{att.class_name}</Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">
                          {att.submitted_at ? new Date(att.submitted_at).toLocaleString("ru-RU") : "—"}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">{formatDuration(att.time_spent_seconds)}</Typography>
                      </TableCell>
                      <TableCell align="center">
                        <Box>
                          <Typography variant="body2" fontWeight={700}>
                            {att.total_score} / {att.max_score}
                          </Typography>
                          <LinearProgress
                            variant="determinate"
                            value={att.percent}
                            color={att.percent >= 70 ? "success" : att.percent >= 40 ? "warning" : "error"}
                            sx={{ height: 4, borderRadius: 2, mt: 0.5 }}
                          />
                          <Typography variant="caption" color="text.secondary">{att.percent}%</Typography>
                        </Box>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAttemptsStudent(null)}>Закрыть</Button>
        </DialogActions>
      </Dialog>

      {/* ─── Диалог журнала входов ─────────────────────────────────────────── */}
      <Dialog open={logsOpen} onClose={() => setLogsOpen(false)} maxWidth="lg" fullWidth>
        <DialogTitle>
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <Typography variant="h6" fontWeight={700}>Журнал входов</Typography>
            <Stack direction="row" spacing={1} alignItems="center">
              <FormControl size="small" sx={{ minWidth: 140 }}>
                <InputLabel>Класс</InputLabel>
                <Select
                  value={logsClass}
                  label="Класс"
                  onChange={(e) => setLogsClass(e.target.value as number | "")}
                >
                  <MenuItem value="">Все классы</MenuItem>
                  {classes.map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
                </Select>
              </FormControl>
              <Button size="small" variant="outlined" onClick={openLogs}>Обновить</Button>
            </Stack>
          </Box>
        </DialogTitle>
        <Divider />
        <DialogContent sx={{ p: 0 }}>
          {logsLoading ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
              <CircularProgress />
            </Box>
          ) : logs.length === 0 ? (
            <Typography color="text.secondary" sx={{ py: 3, textAlign: "center" }}>
              Записей нет
            </Typography>
          ) : (
            <TableContainer>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600 }}>Ученик</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Класс</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Дата и время</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>IP-адрес</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Устройство</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Браузер / ОС</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {logs.map((log) => (
                    <TableRow key={log.id} hover>
                      <TableCell>
                        <Typography variant="body2" fontWeight={500}>{log.student_name}</Typography>
                      </TableCell>
                      <TableCell>
                        <Chip label={log.class_name} size="small" variant="outlined" color="primary" />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">
                          {new Date(log.logged_in_at).toLocaleString("ru-RU")}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontFamily: "monospace" }}>
                          {log.ip_address || "—"}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={log.device_type || "—"}
                          size="small"
                          variant="outlined"
                          color={log.device_type === "mobile" ? "warning" : "default"}
                        />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">
                          {[log.browser, log.os].filter(Boolean).join(" / ") || "—"}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLogsOpen(false)}>Закрыть</Button>
        </DialogActions>
      </Dialog>

      {/* ─── Диалог 10 карточек на листе ─────────────────────────────────── */}
      <Dialog open={cards10Open} onClose={() => setCards10Open(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          <Typography variant="h6" fontWeight={700}>
            Карточки класса (10 на листе A4)
          </Typography>
        </DialogTitle>
        <Divider />
        <DialogContent sx={{ pt: 2 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            QR-код на карточке будет содержать ссылку для входа ученика. Укажите адрес сайта,
            доступный с телефонов учеников (например, IP вашего сервера в локальной сети).
          </Typography>
          <TextField
            fullWidth
            label="Адрес сайта для QR-кода"
            placeholder="например: http://192.168.1.100:8000"
            value={cards10Url}
            onChange={(e) => setCards10Url(e.target.value)}
            helperText="Адрес автоматически определён. Отредактируйте при необходимости."
            sx={{ mb: 1 }}
          />
          <Typography variant="caption" color="text.secondary">
            Итоговая ссылка в QR: <strong>{cards10Url.trim()}/login?code=XXXXXXX</strong>
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCards10Open(false)}>Отмена</Button>
          <Button
            variant="contained"
            startIcon={cards10Loading ? <CircularProgress size={16} color="inherit" /> : <PrintIcon />}
            disabled={!cards10Url.trim() || cards10Loading || !selectedClass}
            onClick={() => downloadClassCards10(selectedClass as number)}
          >
            Скачать PDF
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
