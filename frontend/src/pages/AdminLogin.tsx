import { useState } from "react";
import {
  Box, Card, CardContent, Typography, TextField, Button,
  Alert, CircularProgress, InputAdornment,
} from "@mui/material";
import AdminPanelSettingsIcon from "@mui/icons-material/AdminPanelSettings";
import PersonIcon from "@mui/icons-material/Person";
import LockIcon from "@mui/icons-material/Lock";
import { adminLogin } from "../api";
import { setAdminToken } from "../auth";
import { useNavigate } from "react-router-dom";

export default function AdminLogin() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async () => {
    if (!username || !password) return;
    setLoading(true);
    setError("");
    try {
      const data = await adminLogin(username, password);
      setAdminToken(data.access_token);
      navigate("/admin");
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(msg || "Неверные данные для входа");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        bgcolor: "background.default",
        p: 2,
      }}
    >
      <Box sx={{ width: "100%", maxWidth: 400 }}>
        <Box sx={{ textAlign: "center", mb: 3 }}>
          <Box
            sx={{
              width: 64, height: 64, borderRadius: 3,
              bgcolor: "secondary.main", display: "inline-flex",
              alignItems: "center", justifyContent: "center", mb: 2,
            }}
          >
            <AdminPanelSettingsIcon sx={{ color: "white", fontSize: 36 }} />
          </Box>
          <Typography variant="h5" fontWeight={700}>Панель управления</Typography>
          <Typography variant="body2" color="text.secondary">
            Вход для администратора
          </Typography>
        </Box>

        <Card>
          <CardContent sx={{ p: 3 }}>
            {error && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}

            <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <TextField
                fullWidth
                label="Логин"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <PersonIcon color="action" />
                    </InputAdornment>
                  ),
                }}
              />
              <TextField
                fullWidth
                type="password"
                label="Пароль"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <LockIcon color="action" />
                    </InputAdornment>
                  ),
                }}
              />
              <Button
                fullWidth
                variant="contained"
                color="secondary"
                size="large"
                onClick={handleSubmit}
                disabled={!username || !password || loading}
              >
                {loading ? <CircularProgress size={24} color="inherit" /> : "Войти"}
              </Button>
            </Box>

            <Box sx={{ textAlign: "center", mt: 2 }}>
              <Typography
                variant="caption"
                color="text.secondary"
                component="a"
                href="/login"
                sx={{ textDecoration: "none", "&:hover": { textDecoration: "underline" } }}
              >
                ← Вход для ученика
              </Typography>
            </Box>
          </CardContent>
        </Card>
      </Box>
    </Box>
  );
}
