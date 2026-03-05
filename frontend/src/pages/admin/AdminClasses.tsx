import { useState, useEffect } from "react";
import {
  Box, Typography, Button, Card, CardContent, TextField,
  Dialog, DialogTitle, DialogContent, DialogActions,
  IconButton, Chip, Alert, CircularProgress, Grid,
  List, ListItem, ListItemText, ListItemSecondaryAction,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import SchoolIcon from "@mui/icons-material/School";
import PeopleIcon from "@mui/icons-material/People";
import { getClasses, createClass, deleteClass, getStudents } from "../../api";

interface ClassRoom { id: number; name: string; }
interface Student { id: number; name: string; code: string; class_id: number; class_name: string; }

export default function AdminClasses() {
  const [classes, setClasses] = useState<ClassRoom[]>([]);
  const [studentCounts, setStudentCounts] = useState<Record<number, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteDialogId, setDeleteDialogId] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const cls: ClassRoom[] = await getClasses();
      setClasses(cls);
      // Загружаем количество учеников для каждого класса
      const counts: Record<number, number> = {};
      await Promise.all(
        cls.map(async (c) => {
          try {
            const students: Student[] = await getStudents(c.id);
            counts[c.id] = students.length;
          } catch {
            counts[c.id] = 0;
          }
        })
      );
      setStudentCounts(counts);
    } catch {
      setError("Ошибка загрузки классов");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      await createClass(newName.trim());
      setNewName("");
      setDialogOpen(false);
      await load();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(msg || "Ошибка создания класса");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteClass(id);
      setDeleteDialogId(null);
      await load();
    } catch {
      setError("Ошибка удаления класса");
    }
  };

  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 3 }}>
        <Box>
          <Typography variant="h5" fontWeight={700}>Классы</Typography>
          <Typography variant="body2" color="text.secondary">
            Управление учебными классами
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setDialogOpen(true)}
        >
          Добавить класс
        </Button>
      </Box>

      {error && <Alert severity="error" onClose={() => setError("")} sx={{ mb: 2 }}>{error}</Alert>}

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
          <CircularProgress />
        </Box>
      ) : classes.length === 0 ? (
        <Card>
          <CardContent sx={{ textAlign: "center", py: 6 }}>
            <SchoolIcon sx={{ fontSize: 64, color: "text.disabled", mb: 2 }} />
            <Typography variant="h6" color="text.secondary">Классов пока нет</Typography>
            <Typography variant="body2" color="text.disabled" sx={{ mb: 2 }}>
              Создайте первый класс, чтобы начать работу
            </Typography>
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDialogOpen(true)}>
              Создать класс
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Grid container spacing={2}>
          {classes.map((cls) => (
            <Grid item xs={12} sm={6} md={4} key={cls.id}>
              <Card sx={{ height: "100%", transition: "transform 0.15s", "&:hover": { transform: "translateY(-2px)" } }}>
                <CardContent>
                  <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                      <Box
                        sx={{
                          width: 44, height: 44, borderRadius: 2,
                          bgcolor: "primary.main", display: "flex",
                          alignItems: "center", justifyContent: "center",
                        }}
                      >
                        <SchoolIcon sx={{ color: "white" }} />
                      </Box>
                      <Box>
                        <Typography variant="h6" fontWeight={700}>{cls.name}</Typography>
                        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mt: 0.5 }}>
                          <PeopleIcon sx={{ fontSize: 14, color: "text.secondary" }} />
                          <Typography variant="caption" color="text.secondary">
                            {studentCounts[cls.id] ?? "..."} учеников
                          </Typography>
                        </Box>
                      </Box>
                    </Box>
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() => setDeleteDialogId(cls.id)}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Box>
                  <Box sx={{ mt: 2 }}>
                    <Chip
                      label={`ID: ${cls.id}`}
                      size="small"
                      variant="outlined"
                      sx={{ fontSize: 11 }}
                    />
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {/* Диалог создания класса */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Новый класс</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            label="Название класса"
            placeholder="Например: 9А, 10Б"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Отмена</Button>
          <Button variant="contained" onClick={handleCreate} disabled={saving || !newName.trim()}>
            {saving ? <CircularProgress size={20} /> : "Создать"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Диалог подтверждения удаления */}
      <Dialog open={deleteDialogId !== null} onClose={() => setDeleteDialogId(null)}>
        <DialogTitle>Удалить класс?</DialogTitle>
        <DialogContent>
          <Typography>
            Все ученики и данные этого класса будут удалены. Это действие нельзя отменить.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogId(null)}>Отмена</Button>
          <Button color="error" variant="contained" onClick={() => deleteDialogId && handleDelete(deleteDialogId)}>
            Удалить
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
