import { useState, useEffect } from "react";
import {
  Box, Typography, Button, Card, CardContent, CardActions,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField,
  MenuItem, Select, FormControl, InputLabel, Alert, Chip,
  IconButton, Tooltip, CircularProgress, Divider, Switch,
  FormControlLabel, Table, TableBody, TableCell, TableHead, TableRow,
  Paper, Tabs, Tab,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import PollIcon from "@mui/icons-material/Poll";
import AssignmentIcon from "@mui/icons-material/Assignment";
import BarChartIcon from "@mui/icons-material/BarChart";
import { getAdminSurveys, createSurvey, deleteSurvey, getSurveyResults, getClasses } from "../../api";

type Survey = {
  id: number;
  title: string;
  description?: string;
  survey_type: "test" | "survey";
  access_code: string;
  is_active: boolean;
  time_limit_minutes?: number;
  show_results: boolean;
  assignment_file?: string;
  created_at: string;
  participant_count?: number;
};

type SurveyResult = {
  id: number;
  participant_name: string;
  participant_email?: string;
  total_score?: number;
  max_score?: number;
  time_spent_seconds?: number;
  submitted_at: string;
};

export default function AdminSurveys() {
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [resultsOpen, setResultsOpen] = useState(false);
  const [selectedSurvey, setSelectedSurvey] = useState<Survey | null>(null);
  const [results, setResults] = useState<SurveyResult[]>([]);
  const [resultsLoading, setResultsLoading] = useState(false);
  const [tab, setTab] = useState(0);
  const [classes, setClasses] = useState<{ id: number; name: string }[]>([]);
  const [copied, setCopied] = useState<string | null>(null);

  const [form, setForm] = useState({
    title: "",
    description: "",
    survey_type: "test" as "test" | "survey",
    time_limit_minutes: "" as number | "",
    show_results: true,
    assignment_file: "",
    is_active: true,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadData();
  }, [tab]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [sv, cls] = await Promise.all([
        getAdminSurveys({ survey_type: tab === 0 ? "test" : "survey" }),
        getClasses(),
      ]);
      setSurveys(sv);
      setClasses(cls);
    } catch {
      setError("Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    setForm({ title: "", description: "", survey_type: tab === 0 ? "test" : "survey", time_limit_minutes: "", show_results: true, assignment_file: "", is_active: true });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      await createSurvey({
        title: form.title,
        description: form.description || undefined,
        survey_type: form.survey_type,
        time_limit_minutes: form.time_limit_minutes || undefined,
        show_results: form.show_results,
        assignment_file: form.assignment_file || undefined,
        is_active: form.is_active,
      });
      setDialogOpen(false);
      loadData();
    } catch {
      setError("Ошибка создания");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Удалить тест/анкету и все результаты?")) return;
    try {
      await deleteSurvey(id);
      loadData();
    } catch {
      setError("Ошибка удаления");
    }
  };

  const openResults = async (survey: Survey) => {
    setSelectedSurvey(survey);
    setResultsOpen(true);
    setResultsLoading(true);
    try {
      const res = await getSurveyResults(survey.id);
      setResults(res);
    } catch {
      setError("Ошибка загрузки результатов");
    } finally {
      setResultsLoading(false);
    }
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopied(code);
    setTimeout(() => setCopied(null), 2000);
  };

  const copyLink = (code: string) => {
    const link = `${window.location.origin}/survey?code=${code}`;
    navigator.clipboard.writeText(link);
    setCopied(`link-${code}`);
    setTimeout(() => setCopied(null), 2000);
  };

  const formatTime = (sec?: number) => {
    if (!sec) return "—";
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  return (
    <Box>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 3 }}>
        <Typography variant="h5" fontWeight={700}>
          <PollIcon sx={{ mr: 1, verticalAlign: "middle" }} />
          Тесты и анкеты
        </Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
          Создать
        </Button>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>{error}</Alert>}

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 3 }}>
        <Tab label="Тесты" icon={<AssignmentIcon />} iconPosition="start" />
        <Tab label="Анкеты" icon={<PollIcon />} iconPosition="start" />
      </Tabs>

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
          <CircularProgress />
        </Box>
      ) : surveys.length === 0 ? (
        <Box sx={{ textAlign: "center", py: 8, color: "text.secondary" }}>
          <PollIcon sx={{ fontSize: 64, mb: 2, opacity: 0.3 }} />
          <Typography variant="h6">
            {tab === 0 ? "Тестов пока нет" : "Анкет пока нет"}
          </Typography>
          <Typography variant="body2">Нажмите «Создать» для добавления</Typography>
        </Box>
      ) : (
        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 2 }}>
          {surveys.map((s) => (
            <Card key={s.id} sx={{ display: "flex", flexDirection: "column", opacity: s.is_active ? 1 : 0.6 }}>
              <CardContent sx={{ flex: 1 }}>
                <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", mb: 1 }}>
                  <Typography variant="subtitle1" fontWeight={600}>{s.title}</Typography>
                  <Chip
                    label={s.is_active ? "Активен" : "Закрыт"}
                    size="small"
                    color={s.is_active ? "success" : "default"}
                  />
                </Box>
                {s.description && (
                  <Typography variant="body2" color="text.secondary" mb={1}>{s.description}</Typography>
                )}
                <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 1.5 }}>
                  {s.time_limit_minutes && (
                    <Chip label={`⏱ ${s.time_limit_minutes} мин.`} size="small" variant="outlined" />
                  )}
                  {s.show_results && (
                    <Chip label="Показывать результаты" size="small" color="info" variant="outlined" />
                  )}
                  <Chip label={`${s.participant_count ?? 0} участников`} size="small" variant="outlined" />
                </Box>

                {/* Код доступа */}
                <Paper
                  variant="outlined"
                  sx={{ p: 1.5, display: "flex", alignItems: "center", justifyContent: "space-between", bgcolor: "grey.50" }}
                >
                  <Box>
                    <Typography variant="caption" color="text.secondary" display="block">Код доступа</Typography>
                    <Typography variant="h6" fontWeight={700} letterSpacing={3} color="primary.main">
                      {s.access_code}
                    </Typography>
                  </Box>
                  <Box sx={{ display: "flex", gap: 0.5 }}>
                    <Tooltip title={copied === s.access_code ? "Скопировано!" : "Копировать код"}>
                      <IconButton size="small" onClick={() => copyCode(s.access_code)}>
                        <ContentCopyIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title={copied === `link-${s.access_code}` ? "Скопировано!" : "Копировать ссылку"}>
                      <IconButton size="small" onClick={() => copyLink(s.access_code)}>
                        <ContentCopyIcon fontSize="small" color="primary" />
                      </IconButton>
                    </Tooltip>
                  </Box>
                </Paper>
              </CardContent>
              <Divider />
              <CardActions sx={{ justifyContent: "space-between" }}>
                <Button
                  size="small"
                  startIcon={<BarChartIcon />}
                  onClick={() => openResults(s)}
                >
                  Результаты ({s.participant_count ?? 0})
                </Button>
                <Tooltip title="Удалить">
                  <IconButton size="small" color="error" onClick={() => handleDelete(s.id)}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </CardActions>
            </Card>
          ))}
        </Box>
      )}

      {/* Диалог создания */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{tab === 0 ? "Создать тест" : "Создать анкету"}</DialogTitle>
        <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 2 }}>
          <TextField
            label="Название *"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            fullWidth
            autoFocus
          />
          <TextField
            label="Описание"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            fullWidth
            multiline
            rows={2}
          />
          <TextField
            label="Файл задания (YAML)"
            value={form.assignment_file}
            onChange={(e) => setForm({ ...form, assignment_file: e.target.value })}
            fullWidth
            placeholder="Например: surveys/teacher_survey_01.yml"
            helperText="Путь к YAML-файлу с вопросами относительно папки assignments/"
          />
          <TextField
            label="Ограничение времени (минуты)"
            type="number"
            value={form.time_limit_minutes}
            onChange={(e) => setForm({ ...form, time_limit_minutes: e.target.value ? Number(e.target.value) : "" })}
            sx={{ width: 250 }}
            placeholder="Без ограничения"
          />
          <FormControlLabel
            control={
              <Switch
                checked={form.show_results}
                onChange={(e) => setForm({ ...form, show_results: e.target.checked })}
              />
            }
            label="Показывать результаты участнику после сдачи"
          />
          <FormControlLabel
            control={
              <Switch
                checked={form.is_active}
                onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
              />
            }
            label="Активен (принимает ответы)"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Отмена</Button>
          <Button variant="contained" onClick={handleSave} disabled={saving || !form.title.trim()}>
            {saving ? <CircularProgress size={20} /> : "Создать"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Диалог результатов */}
      <Dialog open={resultsOpen} onClose={() => setResultsOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          Результаты: {selectedSurvey?.title}
          <Typography variant="body2" color="text.secondary">{results.length} участников</Typography>
        </DialogTitle>
        <DialogContent>
          {resultsLoading ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
              <CircularProgress />
            </Box>
          ) : results.length === 0 ? (
            <Typography color="text.secondary" textAlign="center" py={3}>
              Пока никто не прошёл
            </Typography>
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Участник</TableCell>
                  <TableCell>Email</TableCell>
                  {selectedSurvey?.survey_type === "test" && <TableCell align="center">Результат</TableCell>}
                  <TableCell align="center">Время</TableCell>
                  <TableCell>Дата</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {results.map((r) => {
                  const pct = r.max_score ? Math.round(((r.total_score ?? 0) / r.max_score) * 100) : null;
                  return (
                    <TableRow key={r.id} hover>
                      <TableCell fontWeight={600}>{r.participant_name}</TableCell>
                      <TableCell>{r.participant_email || "—"}</TableCell>
                      {selectedSurvey?.survey_type === "test" && (
                        <TableCell align="center">
                          {pct !== null ? (
                            <Chip
                              label={`${r.total_score}/${r.max_score} (${pct}%)`}
                              size="small"
                              color={pct >= 90 ? "success" : pct >= 60 ? "primary" : pct >= 30 ? "warning" : "error"}
                            />
                          ) : "—"}
                        </TableCell>
                      )}
                      <TableCell align="center">{formatTime(r.time_spent_seconds)}</TableCell>
                      <TableCell>{new Date(r.submitted_at).toLocaleString("ru-RU")}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setResultsOpen(false)}>Закрыть</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
