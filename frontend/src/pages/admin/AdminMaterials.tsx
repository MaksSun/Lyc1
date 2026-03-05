import { useState, useEffect } from "react";
import {
  Box, Typography, Button, Card, CardContent, CardActions,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField,
  MenuItem, Select, FormControl, InputLabel, Alert, Chip,
  IconButton, Tooltip, CircularProgress, Divider,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import MenuBookIcon from "@mui/icons-material/MenuBook";
import LinkIcon from "@mui/icons-material/Link";
import ArticleIcon from "@mui/icons-material/Article";
import VideoLibraryIcon from "@mui/icons-material/VideoLibrary";
import { getAdminMaterials, createMaterial, updateMaterial, deleteMaterial, getClasses } from "../../api";

type Material = {
  id: number;
  title: string;
  description?: string;
  material_type: string;
  content?: string;
  class_id?: number;
  assignment_id?: string;
  sort_order: number;
};

type ClassRoom = { id: number; name: string };

const MATERIAL_TYPES = [
  { value: "text", label: "Текст", icon: <ArticleIcon /> },
  { value: "link", label: "Ссылка", icon: <LinkIcon /> },
  { value: "video", label: "Видео (URL)", icon: <VideoLibraryIcon /> },
  { value: "pdf", label: "PDF (URL)", icon: <MenuBookIcon /> },
];

function getMaterialIcon(type: string) {
  switch (type) {
    case "link": return <LinkIcon fontSize="small" />;
    case "video": return <VideoLibraryIcon fontSize="small" />;
    case "pdf": return <MenuBookIcon fontSize="small" />;
    default: return <ArticleIcon fontSize="small" />;
  }
}

export default function AdminMaterials() {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [classes, setClasses] = useState<ClassRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<Material | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const [form, setForm] = useState({
    title: "",
    description: "",
    material_type: "text",
    content: "",
    class_id: "" as number | "",
    assignment_id: "",
    sort_order: 0,
  });
  const [saving, setSaving] = useState(false);
  const [filterClassId, setFilterClassId] = useState<number | "">("");

  useEffect(() => {
    loadData();
  }, [filterClassId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [mats, cls] = await Promise.all([
        getAdminMaterials(filterClassId ? { class_id: filterClassId as number } : {}),
        getClasses(),
      ]);
      setMaterials(mats);
      setClasses(cls);
    } catch {
      setError("Ошибка загрузки материалов");
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    setEditItem(null);
    setForm({ title: "", description: "", material_type: "text", content: "", class_id: "", assignment_id: "", sort_order: 0 });
    setDialogOpen(true);
  };

  const openEdit = (m: Material) => {
    setEditItem(m);
    setForm({
      title: m.title,
      description: m.description || "",
      material_type: m.material_type,
      content: m.content || "",
      class_id: m.class_id || "",
      assignment_id: m.assignment_id || "",
      sort_order: m.sort_order,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      const payload = {
        title: form.title,
        description: form.description || undefined,
        material_type: form.material_type,
        content: form.content || undefined,
        class_id: form.class_id || undefined,
        assignment_id: form.assignment_id || undefined,
        sort_order: form.sort_order,
      };
      if (editItem) {
        await updateMaterial(editItem.id, payload);
      } else {
        await createMaterial(payload);
      }
      setDialogOpen(false);
      loadData();
    } catch {
      setError("Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteMaterial(deleteId);
      setDeleteId(null);
      loadData();
    } catch {
      setError("Ошибка удаления");
    }
  };

  const getClassName = (classId?: number) =>
    classes.find((c) => c.id === classId)?.name || "Все классы";

  return (
    <Box>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 3 }}>
        <Typography variant="h5" fontWeight={700}>
          <MenuBookIcon sx={{ mr: 1, verticalAlign: "middle" }} />
          Обучающие материалы
        </Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
          Добавить материал
        </Button>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>{error}</Alert>}

      {/* Фильтр */}
      <Box sx={{ mb: 3, display: "flex", gap: 2, alignItems: "center" }}>
        <FormControl size="small" sx={{ minWidth: 200 }}>
          <InputLabel>Класс</InputLabel>
          <Select
            value={filterClassId}
            label="Класс"
            onChange={(e) => setFilterClassId(e.target.value as number | "")}
          >
            <MenuItem value="">Все классы</MenuItem>
            {classes.map((c) => (
              <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <Typography variant="body2" color="text.secondary">
          {materials.length} материалов
        </Typography>
      </Box>

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
          <CircularProgress />
        </Box>
      ) : materials.length === 0 ? (
        <Box sx={{ textAlign: "center", py: 8, color: "text.secondary" }}>
          <MenuBookIcon sx={{ fontSize: 64, mb: 2, opacity: 0.3 }} />
          <Typography variant="h6">Материалов пока нет</Typography>
          <Typography variant="body2">Добавьте обучающий материал, нажав кнопку выше</Typography>
        </Box>
      ) : (
        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 2 }}>
          {materials.map((m) => (
            <Card key={m.id} sx={{ display: "flex", flexDirection: "column" }}>
              <CardContent sx={{ flex: 1 }}>
                <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1, mb: 1 }}>
                  <Box sx={{ color: "primary.main", mt: 0.3 }}>{getMaterialIcon(m.material_type)}</Box>
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="subtitle1" fontWeight={600}>{m.title}</Typography>
                    {m.description && (
                      <Typography variant="body2" color="text.secondary">{m.description}</Typography>
                    )}
                  </Box>
                </Box>

                <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mt: 1 }}>
                  <Chip
                    label={MATERIAL_TYPES.find((t) => t.value === m.material_type)?.label || m.material_type}
                    size="small"
                    variant="outlined"
                  />
                  <Chip label={getClassName(m.class_id)} size="small" color="primary" variant="outlined" />
                  {m.assignment_id && (
                    <Chip label={`Задание: ${m.assignment_id}`} size="small" variant="outlined" />
                  )}
                </Box>

                {m.content && m.material_type === "text" && (
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ mt: 1, maxHeight: 60, overflow: "hidden", textOverflow: "ellipsis" }}
                  >
                    {m.content}
                  </Typography>
                )}
                {m.content && m.material_type !== "text" && (
                  <Typography variant="caption" color="primary.main" sx={{ mt: 1, display: "block", wordBreak: "break-all" }}>
                    {m.content}
                  </Typography>
                )}
              </CardContent>
              <Divider />
              <CardActions sx={{ justifyContent: "flex-end" }}>
                <Tooltip title="Редактировать">
                  <IconButton size="small" onClick={() => openEdit(m)}>
                    <EditIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Удалить">
                  <IconButton size="small" color="error" onClick={() => setDeleteId(m.id)}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </CardActions>
            </Card>
          ))}
        </Box>
      )}

      {/* Диалог создания/редактирования */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editItem ? "Редактировать материал" : "Добавить материал"}</DialogTitle>
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
          <FormControl fullWidth>
            <InputLabel>Тип материала</InputLabel>
            <Select
              value={form.material_type}
              label="Тип материала"
              onChange={(e) => setForm({ ...form, material_type: e.target.value })}
            >
              {MATERIAL_TYPES.map((t) => (
                <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>
              ))}
            </Select>
          </FormControl>

          {form.material_type === "text" ? (
            <TextField
              label="Текст материала"
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
              fullWidth
              multiline
              rows={6}
              placeholder="Введите текст обучающего материала..."
            />
          ) : (
            <TextField
              label={form.material_type === "link" ? "URL ссылки" : form.material_type === "video" ? "URL видео" : "URL PDF файла"}
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
              fullWidth
              placeholder="https://..."
            />
          )}

          <FormControl fullWidth>
            <InputLabel>Класс (необязательно)</InputLabel>
            <Select
              value={form.class_id}
              label="Класс (необязательно)"
              onChange={(e) => setForm({ ...form, class_id: e.target.value as number | "" })}
            >
              <MenuItem value="">Все классы</MenuItem>
              {classes.map((c) => (
                <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
              ))}
            </Select>
          </FormControl>

          <TextField
            label="ID задания (необязательно)"
            value={form.assignment_id}
            onChange={(e) => setForm({ ...form, assignment_id: e.target.value })}
            fullWidth
            placeholder="Например: algebra_01"
            helperText="Если указать ID задания, материал будет показан только при выполнении этого задания"
          />

          <TextField
            label="Порядок сортировки"
            type="number"
            value={form.sort_order}
            onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })}
            sx={{ width: 200 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Отмена</Button>
          <Button variant="contained" onClick={handleSave} disabled={saving || !form.title.trim()}>
            {saving ? <CircularProgress size={20} /> : "Сохранить"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Диалог удаления */}
      <Dialog open={!!deleteId} onClose={() => setDeleteId(null)} maxWidth="xs">
        <DialogTitle>Удалить материал?</DialogTitle>
        <DialogContent>
          <Typography>Это действие нельзя отменить.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteId(null)}>Отмена</Button>
          <Button variant="contained" color="error" onClick={handleDelete}>Удалить</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
