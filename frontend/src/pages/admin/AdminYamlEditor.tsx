import { useState, useEffect } from "react";
import {
  Box, Typography, Button, Card, CardContent, Alert, Chip,
  TextField, Select, MenuItem, FormControl, InputLabel,
  Dialog, DialogTitle, DialogContent, DialogActions,
  List, ListItem, ListItemButton, ListItemText, ListItemIcon,
  Divider, CircularProgress, Paper, Tabs, Tab, IconButton,
  Tooltip,
} from "@mui/material";
import CodeIcon from "@mui/icons-material/Code";
import AddIcon from "@mui/icons-material/Add";
import FolderIcon from "@mui/icons-material/Folder";
import InsertDriveFileIcon from "@mui/icons-material/InsertDriveFile";
import SaveIcon from "@mui/icons-material/Save";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DeleteIcon from "@mui/icons-material/Delete";
import PreviewIcon from "@mui/icons-material/Preview";
import { getYamlFiles, getYamlFile, saveYamlFile, deleteYamlFile, getClasses } from "../../api";

// Шаблоны для разных типов заданий
const TEMPLATES: Record<string, string> = {
  math_basic: `# Математическое задание — базовый шаблон
id: math_01
title: "Алгебра — линейные уравнения"
description_latex: "Решите следующие уравнения"
time_limit_minutes: 20
randomize: true
random_count: 5

questions:
  - id: q1
    type: number
    prompt: "Решите уравнение: $2x + 4 = 10$"
    answer: 3
    points: 1
    hint: "Перенесите 4 в правую часть"

  - id: q2
    type: number
    prompt: "Найдите x: $3x - 6 = 9$"
    answer: 5
    points: 1

  - id: q3
    type: choice
    prompt: "Какое из чисел является решением $x^2 = 9$?"
    options:
      - id: a
        label: "x = 2"
      - id: b
        label: "x = 3"
      - id: c
        label: "x = 4"
      - id: d
        label: "x = 9"
    answer: b
    points: 1
    hint: "Извлеките квадратный корень"

  - id: q4
    type: multichoice
    prompt: "Выберите все решения уравнения $x^2 - 4 = 0$"
    options:
      - id: a
        label: "x = -2"
      - id: b
        label: "x = 0"
      - id: c
        label: "x = 2"
      - id: d
        label: "x = 4"
    answer: [a, c]
    points: 2
`,

  drag_drop: `# Задание с перетаскиванием
id: drag_01
title: "Классификация — перетащи в нужную группу"
time_limit_minutes: 15

questions:
  - id: q1
    type: drag_drop
    prompt: "Распределите числа по группам"
    zones:
      - id: even
        label: "Чётные"
      - id: odd
        label: "Нечётные"
    items:
      - id: n2
        label: "2"
      - id: n3
        label: "3"
      - id: n4
        label: "4"
      - id: n5
        label: "5"
      - id: n6
        label: "6"
      - id: n7
        label: "7"
    answer:
      even: [n2, n4, n6]
      odd: [n3, n5, n7]
    points: 3
`,

  matching: `# Задание на соответствие
id: match_01
title: "Установите соответствие"
time_limit_minutes: 10

questions:
  - id: q1
    type: matching
    prompt: "Установите соответствие между понятием и определением"
    left_items:
      - id: l1
        label: "Периметр"
      - id: l2
        label: "Площадь"
      - id: l3
        label: "Диагональ"
    right_items:
      - id: r1
        label: "Отрезок, соединяющий противоположные вершины"
      - id: r2
        label: "Сумма длин всех сторон фигуры"
      - id: r3
        label: "Мера плоской фигуры в квадратных единицах"
    answer:
      l1: r2
      l2: r3
      l3: r1
    points: 3
`,

  ordering: `# Задание на упорядочивание
id: order_01
title: "Расставьте в правильном порядке"
time_limit_minutes: 10

questions:
  - id: q1
    type: ordering
    prompt: "Расставьте шаги решения квадратного уравнения в правильном порядке"
    items:
      - id: s1
        label: "Записать уравнение в стандартной форме ax² + bx + c = 0"
      - id: s2
        label: "Вычислить дискриминант D = b² - 4ac"
      - id: s3
        label: "Если D < 0 — нет вещественных корней"
      - id: s4
        label: "Найти корни по формуле x = (-b ± √D) / 2a"
    answer: [s1, s2, s3, s4]
    points: 2
`,

  survey: `# Анкета
id: survey_01
title: "Анкета удовлетворённости"
description: "Пожалуйста, ответьте на несколько вопросов"

questions:
  - id: q1
    type: rating
    prompt: "Оцените урок"
    rating_min: 1
    rating_max: 5
    rating_label_min: "Плохо"
    rating_label_max: "Отлично"
    points: 0

  - id: q2
    type: choice
    prompt: "Что понравилось больше всего?"
    options:
      - id: a
        label: "Объяснение материала"
      - id: b
        label: "Практические задания"
      - id: c
        label: "Работа в группах"
      - id: d
        label: "Самостоятельная работа"
    points: 0

  - id: q3
    type: text_long
    prompt: "Что бы вы хотели улучшить?"
    points: 0
`,

  mixed: `# Смешанное задание
id: mixed_01
title: "Комплексное задание"
description_latex: "Задание включает разные типы вопросов"
time_limit_minutes: 30
randomize: false

questions:
  - id: q1
    type: number
    prompt: "Вычислите: $\\\\frac{15}{3} + 2^3$"
    answer: 13
    points: 2

  - id: q2
    type: text
    prompt: "Как называется прямоугольный треугольник с двумя равными катетами?"
    answer: "равнобедренный"
    points: 1
    hint: "Подсказка: два катета равны"

  - id: q3
    type: choice
    prompt: "Выберите правильную формулу площади круга"
    options:
      - id: a
        label: "$S = \\\\pi r$"
      - id: b
        label: "$S = 2\\\\pi r$"
      - id: c
        label: "$S = \\\\pi r^2$"
      - id: d
        label: "$S = \\\\pi d$"
    answer: c
    points: 1

  - id: q4
    type: drag_drop
    prompt: "Распределите фигуры по типам"
    zones:
      - id: polygon
        label: "Многоугольники"
      - id: round
        label: "Круглые фигуры"
    items:
      - id: square
        label: "Квадрат"
      - id: circle
        label: "Круг"
      - id: triangle
        label: "Треугольник"
      - id: ellipse
        label: "Эллипс"
    answer:
      polygon: [square, triangle]
      round: [circle, ellipse]
    points: 2
`,
};

export default function AdminYamlEditor() {
  const [files, setFiles] = useState<{ path: string; size: number; modified: string }[]>([]);
  const [classes, setClasses] = useState<{ id: number; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [originalContent, setOriginalContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [tab, setTab] = useState(0); // 0=редактор, 1=шаблоны
  const [newFileDialog, setNewFileDialog] = useState(false);
  const [newFileName, setNewFileName] = useState("");
  const [newFileClass, setNewFileClass] = useState("");
  const [newFileTemplate, setNewFileTemplate] = useState("math_basic");
  const [deleteDialog, setDeleteDialog] = useState(false);

  useEffect(() => {
    loadFiles();
  }, []);

  const loadFiles = async () => {
    setLoading(true);
    try {
      const [f, cls] = await Promise.all([getYamlFiles(), getClasses()]);
      setFiles(f);
      setClasses(cls);
    } catch {
      setError("Ошибка загрузки файлов");
    } finally {
      setLoading(false);
    }
  };

  const openFile = async (path: string) => {
    try {
      const text = await getYamlFile(path);
      setContent(text);
      setOriginalContent(text);
      setSelectedFile(path);
      setTab(0);
    } catch {
      setError("Ошибка открытия файла");
    }
  };

  const handleSave = async () => {
    if (!selectedFile) return;
    setSaving(true);
    setError("");
    try {
      await saveYamlFile(selectedFile, content);
      setOriginalContent(content);
      setSuccess("Файл сохранён!");
      setTimeout(() => setSuccess(""), 3000);
      loadFiles();
    } catch {
      setError("Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  };

  const handleCreate = async () => {
    if (!newFileName.trim()) return;
    const className = newFileClass || "common";
    const path = `${className}/${newFileName.trim().replace(/\.yml$/, "")}.yml`;
    const templateContent = TEMPLATES[newFileTemplate] || TEMPLATES.math_basic;
    setSaving(true);
    try {
      await saveYamlFile(path, templateContent);
      setNewFileDialog(false);
      setNewFileName("");
      await loadFiles();
      await openFile(path);
    } catch {
      setError("Ошибка создания файла");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedFile) return;
    try {
      await deleteYamlFile(selectedFile);
      setDeleteDialog(false);
      setSelectedFile(null);
      setContent("");
      loadFiles();
    } catch {
      setError("Ошибка удаления");
    }
  };

  const isDirty = content !== originalContent;

  // Группируем файлы по папкам
  const fileTree: Record<string, typeof files> = {};
  files.forEach((f) => {
    const parts = f.path.split("/");
    const dir = parts.length > 1 ? parts[0] : "(корень)";
    if (!fileTree[dir]) fileTree[dir] = [];
    fileTree[dir].push(f);
  });

  return (
    <Box sx={{ display: "flex", height: "calc(100vh - 48px)", gap: 0 }}>
      {/* Файловое дерево */}
      <Box
        sx={{
          width: 260,
          flexShrink: 0,
          borderRight: "1px solid",
          borderColor: "divider",
          display: "flex",
          flexDirection: "column",
          bgcolor: "grey.50",
        }}
      >
        <Box sx={{ p: 1.5, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Typography variant="subtitle2" fontWeight={700}>
            <CodeIcon sx={{ mr: 0.5, verticalAlign: "middle", fontSize: 18 }} />
            YAML файлы
          </Typography>
          <Tooltip title="Создать файл">
            <IconButton size="small" onClick={() => setNewFileDialog(true)}>
              <AddIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
        <Divider />
        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
            <CircularProgress size={24} />
          </Box>
        ) : (
          <List dense sx={{ flex: 1, overflowY: "auto", py: 0 }}>
            {Object.entries(fileTree).map(([dir, dirFiles]) => (
              <Box key={dir}>
                <ListItem sx={{ py: 0.5, px: 1.5 }}>
                  <ListItemIcon sx={{ minWidth: 24 }}>
                    <FolderIcon fontSize="small" color="warning" />
                  </ListItemIcon>
                  <ListItemText
                    primary={dir}
                    primaryTypographyProps={{ variant: "caption", fontWeight: 700, color: "text.secondary" }}
                  />
                </ListItem>
                {dirFiles.map((f) => {
                  const name = f.path.split("/").pop() || f.path;
                  return (
                    <ListItem key={f.path} disablePadding>
                      <ListItemButton
                        selected={selectedFile === f.path}
                        onClick={() => openFile(f.path)}
                        sx={{ pl: 3, py: 0.5 }}
                      >
                        <ListItemIcon sx={{ minWidth: 24 }}>
                          <InsertDriveFileIcon fontSize="small" color="primary" />
                        </ListItemIcon>
                        <ListItemText
                          primary={name}
                          primaryTypographyProps={{ variant: "caption", fontFamily: "monospace" }}
                        />
                      </ListItemButton>
                    </ListItem>
                  );
                })}
              </Box>
            ))}
            {files.length === 0 && (
              <Box sx={{ p: 2, textAlign: "center" }}>
                <Typography variant="caption" color="text.secondary">
                  Нет файлов. Создайте первый!
                </Typography>
              </Box>
            )}
          </List>
        )}
      </Box>

      {/* Редактор */}
      <Box sx={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Тулбар */}
        <Box
          sx={{
            px: 2, py: 1, borderBottom: "1px solid", borderColor: "divider",
            display: "flex", alignItems: "center", gap: 1, bgcolor: "background.paper",
          }}
        >
          {selectedFile ? (
            <>
              <Typography variant="body2" fontFamily="monospace" color="primary.main">
                {selectedFile}
              </Typography>
              {isDirty && <Chip label="Изменён" size="small" color="warning" />}
              <Box sx={{ flex: 1 }} />
              <Tooltip title="Копировать содержимое">
                <IconButton size="small" onClick={() => navigator.clipboard.writeText(content)}>
                  <ContentCopyIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Удалить файл">
                <IconButton size="small" color="error" onClick={() => setDeleteDialog(true)}>
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Button
                variant="contained"
                size="small"
                startIcon={<SaveIcon />}
                onClick={handleSave}
                disabled={saving || !isDirty}
              >
                {saving ? "Сохранение..." : "Сохранить"}
              </Button>
            </>
          ) : (
            <Typography variant="body2" color="text.secondary">
              Выберите файл или создайте новый
            </Typography>
          )}
        </Box>

        {error && <Alert severity="error" onClose={() => setError("")}>{error}</Alert>}
        {success && <Alert severity="success" onClose={() => setSuccess("")}>{success}</Alert>}

        {selectedFile ? (
          <Box sx={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ px: 2, borderBottom: "1px solid", borderColor: "divider" }}>
              <Tab label="Редактор" icon={<CodeIcon />} iconPosition="start" />
              <Tab label="Шаблоны" icon={<PreviewIcon />} iconPosition="start" />
            </Tabs>

            {tab === 0 && (
              <TextField
                multiline
                fullWidth
                value={content}
                onChange={(e) => setContent(e.target.value)}
                sx={{
                  flex: 1,
                  "& .MuiInputBase-root": {
                    height: "100%",
                    alignItems: "flex-start",
                    fontFamily: "monospace",
                    fontSize: 13,
                    bgcolor: "#1e1e1e",
                    color: "#d4d4d4",
                    borderRadius: 0,
                  },
                  "& .MuiOutlinedInput-notchedOutline": { border: "none" },
                  "& textarea": {
                    height: "100% !important",
                    overflowY: "auto !important",
                    resize: "none",
                  },
                }}
                InputProps={{ style: { height: "100%" } }}
              />
            )}

            {tab === 1 && (
              <Box sx={{ p: 2, overflowY: "auto", flex: 1 }}>
                <Typography variant="subtitle2" mb={2} fontWeight={600}>
                  Вставить шаблон в текущий файл:
                </Typography>
                <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 2 }}>
                  {Object.entries({
                    math_basic: "Математика — числа и выбор",
                    drag_drop: "Перетаскивание по зонам",
                    matching: "Соответствие (левое-правое)",
                    ordering: "Расстановка по порядку",
                    survey: "Анкета с оценками",
                    mixed: "Смешанное задание",
                  }).map(([key, label]) => (
                    <Card key={key} variant="outlined" sx={{ cursor: "pointer", "&:hover": { borderColor: "primary.main" } }}>
                      <CardContent sx={{ p: 2 }}>
                        <Typography variant="subtitle2" fontWeight={600} mb={0.5}>{label}</Typography>
                        <Typography variant="caption" color="text.secondary" display="block" mb={1.5}>
                          {TEMPLATES[key].split("\n")[0].replace("# ", "")}
                        </Typography>
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={() => {
                            setContent(TEMPLATES[key]);
                            setTab(0);
                          }}
                        >
                          Использовать
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </Box>
              </Box>
            )}
          </Box>
        ) : (
          <Box sx={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "text.secondary" }}>
            <CodeIcon sx={{ fontSize: 72, mb: 2, opacity: 0.2 }} />
            <Typography variant="h6" mb={1}>YAML-редактор</Typography>
            <Typography variant="body2" mb={3} textAlign="center" maxWidth={400}>
              Выберите файл из списка слева или создайте новый.
              Файлы заданий хранятся в папке <code>assignments/</code> на сервере.
            </Typography>
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => setNewFileDialog(true)}>
              Создать файл
            </Button>
          </Box>
        )}
      </Box>

      {/* Диалог создания файла */}
      <Dialog open={newFileDialog} onClose={() => setNewFileDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Создать файл задания</DialogTitle>
        <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 2 }}>
          <FormControl fullWidth>
            <InputLabel>Класс / папка</InputLabel>
            <Select
              value={newFileClass}
              label="Класс / папка"
              onChange={(e) => setNewFileClass(e.target.value)}
            >
              <MenuItem value="">common (общие)</MenuItem>
              <MenuItem value="surveys">surveys (тесты/анкеты)</MenuItem>
              {classes.map((c) => (
                <MenuItem key={c.id} value={c.name}>{c.name}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            label="Имя файла (без .yml)"
            value={newFileName}
            onChange={(e) => setNewFileName(e.target.value.replace(/[^a-zA-Z0-9_-]/g, "_"))}
            fullWidth
            placeholder="algebra_01"
            helperText={`Будет создан: ${newFileClass || "common"}/${newFileName || "имя_файла"}.yml`}
          />
          <FormControl fullWidth>
            <InputLabel>Шаблон</InputLabel>
            <Select
              value={newFileTemplate}
              label="Шаблон"
              onChange={(e) => setNewFileTemplate(e.target.value)}
            >
              <MenuItem value="math_basic">Математика — числа и выбор</MenuItem>
              <MenuItem value="drag_drop">Перетаскивание по зонам</MenuItem>
              <MenuItem value="matching">Соответствие</MenuItem>
              <MenuItem value="ordering">Расстановка по порядку</MenuItem>
              <MenuItem value="survey">Анкета</MenuItem>
              <MenuItem value="mixed">Смешанное задание</MenuItem>
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNewFileDialog(false)}>Отмена</Button>
          <Button variant="contained" onClick={handleCreate} disabled={saving || !newFileName.trim()}>
            {saving ? <CircularProgress size={20} /> : "Создать"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Диалог удаления */}
      <Dialog open={deleteDialog} onClose={() => setDeleteDialog(false)} maxWidth="xs">
        <DialogTitle>Удалить файл?</DialogTitle>
        <DialogContent>
          <Typography>
            Файл <strong>{selectedFile}</strong> будет удалён безвозвратно.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialog(false)}>Отмена</Button>
          <Button variant="contained" color="error" onClick={handleDelete}>Удалить</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
