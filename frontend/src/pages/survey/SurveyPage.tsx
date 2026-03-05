import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Box, Card, CardContent, Typography, Button, Alert, CircularProgress,
  LinearProgress, Chip, Fade, Dialog, DialogTitle, DialogContent, DialogActions,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import SendIcon from "@mui/icons-material/Send";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CancelIcon from "@mui/icons-material/Cancel";
import "katex/dist/katex.min.css";
import { getSurveyAssignment, submitSurvey } from "../../api";
import CountdownTimer from "../../components/CountdownTimer";
import QuestionRenderer, { QuestionData } from "../../components/questions/QuestionRenderer";

type SubmitResult = {
  attempt_id: number;
  total_score?: number;
  max_score?: number;
  show_results: boolean;
  details?: Array<{
    question_key: string;
    is_correct: boolean;
    score: number;
    student_answer: unknown;
    correct_answer: unknown;
    prompt_latex: string;
    qtype: string;
    points: number;
    hint?: string;
  }>;
};

export default function SurveyPage() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();

  const [data, setData] = useState<{
    title: string;
    description?: string;
    survey_type: string;
    time_limit_minutes?: number;
    show_results?: boolean;
    questions: QuestionData[];
  } | null>(null);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [timeExpired, setTimeExpired] = useState(false);

  const startedAt = useRef<string>(new Date().toISOString());
  const startTimestamp = useRef<number>(Date.now());

  // Получаем данные участника из sessionStorage
  const participant = (() => {
    try {
      return JSON.parse(sessionStorage.getItem("survey_participant") || "{}");
    } catch {
      return {};
    }
  })();

  useEffect(() => {
    if (!code) return;
    // Проверяем что участник зарегистрировался
    if (!participant.name) {
      navigate(`/survey`);
      return;
    }
    setLoading(true);
    getSurveyAssignment(code)
      .then(setData)
      .catch((e: unknown) => {
        const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
        setError(msg || "Ошибка загрузки теста");
      })
      .finally(() => setLoading(false));
  }, [code]);

  const questions: QuestionData[] = data?.questions ?? [];

  const setAnswer = useCallback((qid: string, value: unknown) => {
    setAnswers((prev) => ({ ...prev, [qid]: value }));
  }, []);

  const answeredCount = questions.filter((q) => {
    const a = answers[q.id];
    if (a === undefined || a === null || a === "") return false;
    if (Array.isArray(a)) return a.length > 0;
    if (typeof a === "object") return Object.keys(a as object).length > 0;
    return true;
  }).length;

  const handleTimerExpire = useCallback(() => {
    setTimeExpired(true);
    handleSubmit(true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = async (forced = false) => {
    if (!code) return;
    setSubmitting(true);
    setError("");
    setConfirmOpen(false);
    const timeSpent = Math.round((Date.now() - startTimestamp.current) / 1000);
    try {
      const res = await submitSurvey(code, {
        participant,
        answers,
        started_at: startedAt.current,
        time_spent_seconds: timeSpent,
      });
      setResult(res);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(msg || "Ошибка отправки");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "60vh" }}>
        <CircularProgress size={48} />
      </Box>
    );
  }

  if (error && !data) {
    return (
      <Box sx={{ p: 3, maxWidth: 600, mx: "auto" }}>
        <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>
        <Button onClick={() => navigate("/survey")}>Назад</Button>
      </Box>
    );
  }

  // ─── Результаты ───────────────────────────────────────────────────────────
  if (result) {
    const isSurvey = data?.survey_type === "survey";

    if (!result.show_results || isSurvey) {
      return (
        <Box sx={{ maxWidth: 600, mx: "auto", p: 3, textAlign: "center" }}>
          <Card sx={{ p: 4 }}>
            <CheckCircleIcon sx={{ fontSize: 72, color: "success.main", mb: 2 }} />
            <Typography variant="h4" fontWeight={700} mb={1}>
              {isSurvey ? "Спасибо за участие!" : "Ответы отправлены!"}
            </Typography>
            <Typography variant="body1" color="text.secondary" mb={3}>
              {isSurvey
                ? "Ваши ответы на анкету успешно записаны."
                : "Ваши ответы приняты. Результаты будут доступны позже."}
            </Typography>
            <Button variant="contained" onClick={() => navigate("/survey")}>
              Завершить
            </Button>
          </Card>
        </Box>
      );
    }

    // Показываем результаты теста
    const pct = result.max_score ? Math.round(((result.total_score ?? 0) / result.max_score) * 100) : 0;
    const scoreColor = pct >= 90 ? "success" : pct >= 60 ? "primary" : pct >= 30 ? "warning" : "error";
    const correctCount = (result.details || []).filter((d) => d.is_correct).length;

    return (
      <Box sx={{ maxWidth: 800, mx: "auto", p: { xs: 2, md: 3 } }}>
        <Card sx={{ mb: 3, textAlign: "center", border: "2px solid", borderColor: `${scoreColor}.main` }}>
          <CardContent sx={{ py: 4 }}>
            <Typography variant="h2" fontWeight={800} color={`${scoreColor}.main`}>
              {result.total_score}
              <Typography component="span" variant="h4" color="text.secondary">/{result.max_score}</Typography>
            </Typography>
            <Typography variant="h5" fontWeight={600} mt={1} mb={2}>
              {pct >= 90 ? "🏆 Отлично!" : pct >= 60 ? "👍 Хорошо" : pct >= 30 ? "📚 Можно лучше" : "💪 Нужно повторить"}
            </Typography>
            <LinearProgress
              variant="determinate"
              value={pct}
              color={scoreColor}
              sx={{ height: 10, borderRadius: 5, maxWidth: 300, mx: "auto", mb: 2 }}
            />
            <Typography variant="body2" color="text.secondary">
              Правильных: {correctCount} из {(result.details || []).length}
            </Typography>
          </CardContent>
        </Card>

        {(result.details || []).map((d, idx) => (
          <Card
            key={d.question_key}
            sx={{ mb: 2, borderLeft: "4px solid", borderColor: d.is_correct ? "success.main" : "error.main" }}
          >
            <CardContent>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
                {d.is_correct ? <CheckCircleIcon color="success" /> : <CancelIcon color="error" />}
                <Typography variant="subtitle2" fontWeight={600}>Вопрос {idx + 1}</Typography>
                <Chip label={`${d.score}/${d.points} б.`} size="small" color={d.is_correct ? "success" : "error"} variant="outlined" />
              </Box>
              {d.prompt_latex && (
                <Typography variant="body2" color="text.secondary" mb={1}>{d.prompt_latex}</Typography>
              )}
              <Box sx={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                <Box>
                  <Typography variant="caption" color="text.secondary" display="block">Ваш ответ:</Typography>
                  <Typography variant="body2" fontWeight={600} color={d.is_correct ? "success.main" : "error.main"}>
                    {d.student_answer !== null && d.student_answer !== undefined
                      ? typeof d.student_answer === "object" ? JSON.stringify(d.student_answer) : String(d.student_answer)
                      : "—"}
                  </Typography>
                </Box>
                {!d.is_correct && d.correct_answer !== null && (
                  <Box>
                    <Typography variant="caption" color="text.secondary" display="block">Правильный:</Typography>
                    <Typography variant="body2" fontWeight={600} color="success.main">
                      {typeof d.correct_answer === "object" ? JSON.stringify(d.correct_answer) : String(d.correct_answer)}
                    </Typography>
                  </Box>
                )}
              </Box>
              {!d.is_correct && d.hint && (
                <Alert severity="info" sx={{ mt: 1 }} icon="💡">{d.hint}</Alert>
              )}
            </CardContent>
          </Card>
        ))}

        <Button variant="outlined" onClick={() => navigate("/survey")} sx={{ mt: 1 }}>
          Завершить
        </Button>
      </Box>
    );
  }

  // ─── Прохождение теста ────────────────────────────────────────────────────
  const currentQ = questions[currentPage];
  const totalPages = questions.length;
  const timeLimitSec = (data?.time_limit_minutes ?? 0) * 60;

  return (
    <Box sx={{ maxWidth: 800, mx: "auto", p: { xs: 1, md: 3 } }}>
      {timeLimitSec > 0 && !timeExpired && (
        <CountdownTimer totalSeconds={timeLimitSec} onExpire={handleTimerExpire} />
      )}

      {/* Заголовок */}
      <Box sx={{ mb: 2 }}>
        <Typography variant="h5" fontWeight={700}>{data?.title}</Typography>
        <Box sx={{ display: "flex", gap: 1, mt: 0.5, flexWrap: "wrap" }}>
          <Chip
            label={data?.survey_type === "survey" ? "Анкета" : "Тест"}
            size="small"
            color={data?.survey_type === "survey" ? "secondary" : "primary"}
          />
          <Chip label={`Участник: ${participant.name}`} size="small" variant="outlined" />
          <Chip label={`${answeredCount}/${totalPages} ответов`} size="small" variant="outlined" />
        </Box>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* Прогресс */}
      <Box sx={{ mb: 2 }}>
        <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
          <Typography variant="caption" color="text.secondary">
            Вопрос {currentPage + 1} из {totalPages}
          </Typography>
        </Box>
        <LinearProgress
          variant="determinate"
          value={totalPages > 0 ? ((currentPage + 1) / totalPages) * 100 : 0}
          sx={{ height: 4, borderRadius: 2 }}
        />
      </Box>

      {/* Навигация точками */}
      {totalPages > 1 && (
        <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", mb: 2 }}>
          {questions.map((q, i) => {
            const isAnswered = answers[q.id] !== undefined && answers[q.id] !== "";
            return (
              <Box
                key={q.id}
                onClick={() => setCurrentPage(i)}
                sx={{
                  width: 32, height: 32, borderRadius: "50%",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  cursor: "pointer", fontSize: 12, fontWeight: 600,
                  border: "2px solid",
                  borderColor: i === currentPage ? "primary.main" : isAnswered ? "success.main" : "divider",
                  bgcolor: i === currentPage ? "primary.main" : isAnswered ? "success.50" : "background.paper",
                  color: i === currentPage ? "white" : isAnswered ? "success.main" : "text.secondary",
                  transition: "all 0.15s",
                }}
              >
                {i + 1}
              </Box>
            );
          })}
        </Box>
      )}

      {/* Текущий вопрос */}
      {currentQ && (
        <Fade key={currentQ.id} in timeout={200}>
          <Card sx={{ mb: 2 }}>
            <CardContent>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
                <Box sx={{
                  width: 32, height: 32, borderRadius: "50%", bgcolor: "primary.main",
                  color: "white", display: "flex", alignItems: "center", justifyContent: "center",
                  fontWeight: 700, fontSize: 14, flexShrink: 0,
                }}>
                  {currentPage + 1}
                </Box>
                {data?.survey_type !== "survey" && (
                  <Typography variant="caption" color="text.secondary">
                    {currentQ.points} {currentQ.points === 1 ? "балл" : "балла"}
                  </Typography>
                )}
              </Box>
              <QuestionRenderer
                question={currentQ}
                value={answers[currentQ.id]}
                onChange={(v) => setAnswer(currentQ.id, v)}
                disabled={submitting || timeExpired}
              />
            </CardContent>
          </Card>
        </Fade>
      )}

      {/* Навигация */}
      <Box sx={{ display: "flex", justifyContent: "space-between", mt: 2 }}>
        <Button
          variant="outlined"
          startIcon={<ArrowBackIcon />}
          onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
          disabled={currentPage === 0}
        >
          Назад
        </Button>
        {currentPage < totalPages - 1 ? (
          <Button
            variant="contained"
            endIcon={<ArrowForwardIcon />}
            onClick={() => setCurrentPage((p) => Math.min(totalPages - 1, p + 1))}
          >
            Далее
          </Button>
        ) : (
          <Button
            variant="contained"
            color="success"
            endIcon={<SendIcon />}
            onClick={() => setConfirmOpen(true)}
            disabled={submitting || timeExpired}
          >
            {submitting ? "Отправка..." : "Отправить"}
          </Button>
        )}
      </Box>

      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Отправить ответы?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            Вы ответили на <strong>{answeredCount}</strong> из <strong>{totalPages}</strong> вопросов.
          </Typography>
          {answeredCount < totalPages && (
            <Alert severity="warning" sx={{ mt: 1.5 }}>
              {totalPages - answeredCount} вопросов без ответа.
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)}>Отмена</Button>
          <Button variant="contained" color="success" onClick={() => handleSubmit(false)}>Отправить</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
