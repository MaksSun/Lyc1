import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box, Card, CardContent, Typography, TextField, Button,
  Alert, CircularProgress, Chip, Divider,
} from "@mui/material";
import AssignmentIcon from "@mui/icons-material/Assignment";
import PollIcon from "@mui/icons-material/Poll";
import { getSurveyInfo } from "../../api";

export default function SurveyLogin() {
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [surveyInfo, setSurveyInfo] = useState<{
    title: string;
    description?: string;
    survey_type: string;
    time_limit_minutes?: number;
    show_results?: boolean;
  } | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [step, setStep] = useState<"code" | "info">("code");

  const handleCodeSubmit = async () => {
    if (!code.trim()) return;
    setLoading(true);
    setError("");
    try {
      const info = await getSurveyInfo(code.trim().toUpperCase());
      setSurveyInfo(info);
      setStep("info");
    } catch {
      setError("Тест/анкета с таким кодом не найдена или недоступна");
    } finally {
      setLoading(false);
    }
  };

  const handleStart = () => {
    if (!name.trim()) {
      setError("Введите ваше имя");
      return;
    }
    // Сохраняем данные участника в sessionStorage
    sessionStorage.setItem("survey_code", code.trim().toUpperCase());
    sessionStorage.setItem("survey_participant", JSON.stringify({ name: name.trim(), email: email.trim() }));
    navigate(`/survey/${code.trim().toUpperCase()}`);
  };

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        bgcolor: "grey.50",
        p: 2,
      }}
    >
      <Card sx={{ maxWidth: 480, width: "100%", boxShadow: 4 }}>
        <CardContent sx={{ p: 4 }}>
          <Box sx={{ textAlign: "center", mb: 3 }}>
            {surveyInfo?.survey_type === "survey" ? (
              <PollIcon sx={{ fontSize: 56, color: "secondary.main", mb: 1 }} />
            ) : (
              <AssignmentIcon sx={{ fontSize: 56, color: "primary.main", mb: 1 }} />
            )}
            <Typography variant="h5" fontWeight={700}>
              {step === "code" ? "Пройти тест / анкету" : surveyInfo?.title}
            </Typography>
            {step === "info" && surveyInfo?.description && (
              <Typography variant="body2" color="text.secondary" mt={1}>
                {surveyInfo.description}
              </Typography>
            )}
          </Box>

          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

          {step === "code" ? (
            <>
              <Typography variant="body2" color="text.secondary" mb={2} textAlign="center">
                Введите код, который вам выдал организатор
              </Typography>
              <TextField
                fullWidth
                label="Код доступа"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === "Enter" && handleCodeSubmit()}
                placeholder="Например: TEST01"
                inputProps={{ style: { textTransform: "uppercase", letterSpacing: 4, fontSize: 20, textAlign: "center" } }}
                sx={{ mb: 2 }}
              />
              <Button
                fullWidth
                variant="contained"
                size="large"
                onClick={handleCodeSubmit}
                disabled={loading || !code.trim()}
              >
                {loading ? <CircularProgress size={24} /> : "Продолжить"}
              </Button>

              <Divider sx={{ my: 3 }} />
              <Typography variant="body2" color="text.secondary" textAlign="center">
                Вы ученик?{" "}
                <Button size="small" onClick={() => navigate("/login")}>
                  Войти как ученик
                </Button>
              </Typography>
            </>
          ) : (
            <>
              {/* Информация о тесте */}
              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 2, justifyContent: "center" }}>
                <Chip
                  label={surveyInfo?.survey_type === "survey" ? "Анкета" : "Тест"}
                  color={surveyInfo?.survey_type === "survey" ? "secondary" : "primary"}
                  size="small"
                />
                {surveyInfo?.time_limit_minutes ? (
                  <Chip label={`⏱ ${surveyInfo.time_limit_minutes} мин.`} size="small" variant="outlined" />
                ) : null}
                {surveyInfo?.show_results && (
                  <Chip label="Результаты видны сразу" size="small" color="success" variant="outlined" />
                )}
              </Box>

              <TextField
                fullWidth
                label="Ваше имя *"
                value={name}
                onChange={(e) => setName(e.target.value)}
                sx={{ mb: 2 }}
                autoFocus
              />
              <TextField
                fullWidth
                label="Email (необязательно)"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                sx={{ mb: 3 }}
              />

              <Button
                fullWidth
                variant="contained"
                size="large"
                onClick={handleStart}
                disabled={!name.trim()}
              >
                Начать
              </Button>
              <Button
                fullWidth
                variant="text"
                sx={{ mt: 1 }}
                onClick={() => { setStep("code"); setSurveyInfo(null); setError(""); }}
              >
                Изменить код
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}
