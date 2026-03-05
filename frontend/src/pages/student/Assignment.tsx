import React, { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Box, Typography, Card, CardContent, Button, Alert, CircularProgress,
  LinearProgress, Chip, Divider, IconButton, Dialog, DialogTitle,
  DialogContent, DialogActions, Stepper, Step, StepButton, Paper,
  Fade, Collapse,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import DownloadIcon from "@mui/icons-material/Download";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import SendIcon from "@mui/icons-material/Send";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CancelIcon from "@mui/icons-material/Cancel";
import MenuBookIcon from "@mui/icons-material/MenuBook";
import "katex/dist/katex.min.css";
import { getAssignment, submitAssignment, getMaterialsForAssignment, sendHeartbeat } from "../../api";
import CountdownTimer from "../../components/CountdownTimer";
import QuestionRenderer, { QuestionData } from "../../components/questions/QuestionRenderer";
import { InlineMath } from "react-katex";

type SubmitResult = {
  attempt_id: number;
  total_score: number;
  max_score: number;
  time_spent_seconds?: number;
  details: Array<{
    question_key: string;
    is_correct: boolean;
    score: number;
    max_score?: number;
    student_answer: unknown;
    correct_answer: unknown;
    prompt_latex: string;
    qtype: string;
    points: number;
    hint?: string;
    options?: Array<{ id: string; label: string } | string>;
    order_items?: Array<{ id: string; label: string } | string>;
    zones?: Array<{ id: string; label: string }>;
    items?: Array<{ id: string; label: string } | string>;
    left_items?: Array<{ id: string; label: string; image_url?: string } | string>;
    right_items?: Array<{ id: string; label: string; image_url?: string } | string>;
    table_headers?: string[];
    table_rows?: Array<{ id: string; label: string; cells: Array<{ id: string; editable?: boolean; placeholder?: string }> }>;
    table_options?: string[];
  }>;
};

type Material = {
  id: number;
  title: string;
  description?: string;
  material_type: string;
  content?: string;
};

function renderLatex(text: string) {
  if (!text) return null;
  const parts = text.split(/(\$[^$]+\$)/g);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith("$") && part.endsWith("$") ? (
          <InlineMath key={i} math={part.slice(1, -1)} />
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

/** Умное отображение ответа с поддержкой LaTeX, массивов и объектов */
function AnswerDisplay({
  val,
  qtype,
  color,
  leftItems,
  rightItems,
  tableRows,
}: {
  val: unknown;
  qtype: string;
  color: "success" | "error" | "primary";
  leftItems?: Array<{ id: string; label: string; image_url?: string } | string>;
  rightItems?: Array<{ id: string; label: string; image_url?: string } | string>;
  tableRows?: Array<{ id: string; label: string; cells: Array<{ id: string; editable?: boolean; placeholder?: string }> }>;
}) {
  // Хелперы для расшифровки ID в метки
  const leftMap = new Map<string, string>();
  const rightMap = new Map<string, string>();
  const rowMap = new Map<string, string>();
  const cellMap = new Map<string, string>(); // "rowId:cellId" -> "rowLabel: colHeader"
  if (leftItems) leftItems.forEach((it) => { if (typeof it === "object") leftMap.set(it.id, it.label); });
  if (rightItems) rightItems.forEach((it) => { if (typeof it === "object") rightMap.set(it.id, it.label); });
  if (tableRows) {
    tableRows.forEach((row) => {
      rowMap.set(row.id, row.label);
      row.cells.forEach((cell) => {
        cellMap.set(`${row.id}:${cell.id}`, `${row.label} / ${cell.placeholder || cell.id}`);
      });
    });
  }
  const resolveLeft = (id: string) => leftMap.get(id) || id;
  const resolveRight = (id: string) => rightMap.get(id) || id;
  const resolveCell = (key: string) => cellMap.get(key) || key;
  const isOrdering = ["ordering", "order", "sort"].includes(qtype);
  const isMulti = ["multichoice", "multiple", "multiple_choice", "multi"].includes(qtype);
  const isDragDrop = ["drag_drop", "drag"].includes(qtype);
  const isMatching = ["matching", "match", "pairs", "correspondence"].includes(qtype);
  const isMatchingMulti = qtype === "matching_multi";
  const isTableFill = qtype === "table_fill";
  const isTableSelect = qtype === "table_select";

  const colorMap = {
    success: { bg: "#f0fdf4", border: "#86efac", text: "#166534" },
    error:   { bg: "#fef2f2", border: "#fca5a5", text: "#991b1b" },
    primary: { bg: "#eff6ff", border: "#93c5fd", text: "#1e40af" },
  };
  const c = colorMap[color];

  // null/undefined
  if (val === null || val === undefined) {
    return (
      <Typography variant="body2" color="text.disabled" sx={{ fontStyle: "italic" }}>
        —
      </Typography>
    );
  }

  // Массив (multichoice или ordering)
  if (Array.isArray(val)) {
    if (isOrdering) {
      return (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
          {val.map((item, i) => (
            <Box
              key={i}
              sx={{
                display: "flex", alignItems: "center", gap: 1,
                px: 1.5, py: 0.5, borderRadius: 1,
                bgcolor: c.bg, border: `1px solid ${c.border}`,
              }}
            >
              <Typography
                variant="caption"
                sx={{
                  minWidth: 22, height: 22, borderRadius: "50%",
                  bgcolor: c.border, color: c.text,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontWeight: 700, fontSize: 11,
                }}
              >
                {i + 1}
              </Typography>
              <Typography variant="body2" fontWeight={600} color={c.text}>
                {renderLatex(String(item))}
              </Typography>
            </Box>
          ))}
        </Box>
      );
    }
    if (isMulti) {
      return (
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
          {val.map((item, i) => (
            <Box
              key={i}
              sx={{
                px: 1.5, py: 0.5, borderRadius: 2,
                bgcolor: c.bg, border: `1px solid ${c.border}`,
              }}
            >
              <Typography variant="body2" fontWeight={600} color={c.text}>
                {renderLatex(String(item))}
              </Typography>
            </Box>
          ))}
        </Box>
      );
    }
    // Другой массив — через запятую
    return (
      <Box sx={{ px: 1.5, py: 0.75, borderRadius: 1, bgcolor: c.bg, border: `1px solid ${c.border}` }}>
        <Typography variant="body2" fontWeight={600} color={c.text}>
          {val.map((item) => renderLatex(String(item))).reduce((acc: React.ReactNode[], el, i) =>
            i === 0 ? [el] : [...acc, <span key={`sep-${i}`}>, </span>, el], [])}
        </Typography>
      </Box>
    );
  }

  // Объект (drag_drop, matching_multi, table_fill, table_select)
  if (typeof val === "object") {
    // matching_multi: {leftId: [rightId1, rightId2], ...}
    if (isMatchingMulti) {
      const obj = val as Record<string, string[]>;
      return (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
          {Object.entries(obj).map(([left, rights], i) => (
            <Box key={i} sx={{ display: "flex", alignItems: "flex-start", gap: 1, px: 1.5, py: 0.5, borderRadius: 1, bgcolor: c.bg, border: `1px solid ${c.border}` }}>
              <Typography variant="body2" color={c.text} fontWeight={600} sx={{ minWidth: 80, flexShrink: 0 }}>{resolveLeft(left)}</Typography>
              <Typography variant="body2" color="text.disabled" sx={{ flexShrink: 0 }}>→</Typography>
              <Typography variant="body2" color={c.text}>
                {Array.isArray(rights) ? rights.map(resolveRight).join(", ") : resolveRight(String(rights))}
              </Typography>
            </Box>
          ))}
        </Box>
      );
    }
    // table_fill / table_select: {"rowId:cellId": "value", ...} или {cells: {...}}
    if (isTableFill || isTableSelect) {
      const rawObj = val as Record<string, unknown>;
      // Поддерживаем оба формата: плоский и {cells: {...}}
      const cells = (rawObj.cells && typeof rawObj.cells === "object")
        ? rawObj.cells as Record<string, string>
        : rawObj as Record<string, string>;
      return (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
          {Object.entries(cells).map(([key, cellVal], i) => (
            <Box key={i} sx={{ display: "flex", alignItems: "center", gap: 1, px: 1.5, py: 0.5, borderRadius: 1, bgcolor: c.bg, border: `1px solid ${c.border}` }}>
              <Typography variant="caption" color={c.text} fontWeight={700} sx={{ minWidth: 120, flexShrink: 0 }}>{resolveCell(key)}:</Typography>
              <Typography variant="body2" color={c.text}>{String(cellVal)}</Typography>
            </Box>
          ))}
        </Box>
      );
    }
    if (isDragDrop) {
      const obj = val as Record<string, unknown[]>;
      return (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
          {Object.entries(obj).map(([zone, items]) => (
            <Box key={zone} sx={{ px: 1.5, py: 0.5, borderRadius: 1, bgcolor: c.bg, border: `1px solid ${c.border}` }}>
              <Typography variant="caption" color={c.text} fontWeight={700}>{zone}:</Typography>
              <Typography variant="body2" color={c.text}>
                {Array.isArray(items) ? items.map(String).join(", ") : String(items)}
              </Typography>
            </Box>
          ))}
        </Box>
      );
    }
    if (isMatching) {
      const obj = val as Record<string, string>;
      return (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
          {Object.entries(obj).map(([left, right], i) => (
            <Box key={i} sx={{ display: "flex", alignItems: "center", gap: 1, px: 1.5, py: 0.5, borderRadius: 1, bgcolor: c.bg, border: `1px solid ${c.border}` }}>
              <Typography variant="body2" color={c.text} fontWeight={600} sx={{ minWidth: 80 }}>{left}</Typography>
              <Typography variant="body2" color="text.disabled">→</Typography>
              <Typography variant="body2" color={c.text}>{right}</Typography>
            </Box>
          ))}
        </Box>
      );
    }
    // Fallback для остальных объектов
    const obj2 = val as Record<string, unknown>;
    let display = "";
    if ("value" in obj2) display = String(obj2.value);
    else if ("index" in obj2) display = `Вариант ${Number(obj2.index) + 1}`;
    else display = JSON.stringify(val);
    return (
      <Box sx={{ px: 1.5, py: 0.75, borderRadius: 1, bgcolor: c.bg, border: `1px solid ${c.border}` }}>
        <Typography variant="body2" fontWeight={600} color={c.text} sx={{ fontFamily: "monospace", fontSize: "0.8rem" }}>
          {display}
        </Typography>
      </Box>
    );
  }

  // Простое значение (число, строка) — рендерим LaTeX
  const strVal = String(val);
  return (
    <Box sx={{ px: 1.5, py: 0.75, borderRadius: 1, bgcolor: c.bg, border: `1px solid ${c.border}`, display: "inline-block" }}>
      <Typography variant="body2" fontWeight={600} color={c.text}>
        {renderLatex(strVal)}
      </Typography>
    </Box>
  );
}

/** Отображает тело задания — варианты ответов, элементы для сортировки и т.д. */
function QuestionBody({ d }: { d: SubmitResult["details"][0] }) {
  const qtype = d.qtype;
  if (["choice", "mcq", "single", "single_choice", "select"].includes(qtype) && d.options?.length) {
    return (
      <Box sx={{ mt: 1.5, mb: 1 }}>
        <Typography variant="caption" color="text.secondary" fontWeight={600} display="block" sx={{ mb: 0.5 }}>Варианты ответа:</Typography>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
          {d.options.map((opt, i) => {
            const label = typeof opt === "object" ? opt.label : String(opt);
            return (
              <Box key={i} sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Typography variant="caption" sx={{ minWidth: 22, height: 22, borderRadius: "50%", bgcolor: "grey.200", color: "text.secondary", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 11, flexShrink: 0 }}>
                  {String.fromCharCode(65 + i)}
                </Typography>
                <Typography variant="body2" color="text.primary">{renderLatex(label)}</Typography>
              </Box>
            );
          })}
        </Box>
      </Box>
    );
  }
  if (["multichoice", "multiple", "multiple_choice", "multi"].includes(qtype) && d.options?.length) {
    return (
      <Box sx={{ mt: 1.5, mb: 1 }}>
        <Typography variant="caption" color="text.secondary" fontWeight={600} display="block" sx={{ mb: 0.5 }}>Варианты ответа (несколько верных):</Typography>
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
          {d.options.map((opt, i) => {
            const label = typeof opt === "object" ? opt.label : String(opt);
            return <Chip key={i} label={<span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ fontWeight: 700, fontSize: 11 }}>{String.fromCharCode(65 + i)}.</span>{renderLatex(label)}</span>} size="small" variant="outlined" sx={{ height: "auto", py: 0.5, "& .MuiChip-label": { display: "flex", alignItems: "center" } }} />;
          })}
        </Box>
      </Box>
    );
  }
  if (["ordering", "order", "sort"].includes(qtype) && d.order_items?.length) {
    const labels = d.order_items.map((it) => typeof it === "object" ? it.label : String(it));
    return (
      <Box sx={{ mt: 1.5, mb: 1 }}>
        <Typography variant="caption" color="text.secondary" fontWeight={600} display="block" sx={{ mb: 0.5 }}>Элементы для сортировки:</Typography>
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
          {labels.map((label, i) => <Chip key={i} label={renderLatex(label)} size="small" variant="outlined" sx={{ height: "auto", py: 0.5, "& .MuiChip-label": { display: "flex", alignItems: "center" } }} />)}
        </Box>
      </Box>
    );
  }
  if (["drag_drop", "drag"].includes(qtype) && d.zones?.length && d.items?.length) {
    const itemLabels = (d.items || []).map((it) => typeof it === "object" ? it.label : String(it));
    const zoneLabels = (d.zones || []).map((z) => typeof z === "object" ? z.label : String(z));
    return (
      <Box sx={{ mt: 1.5, mb: 1 }}>
        <Box sx={{ mb: 1 }}>
          <Typography variant="caption" color="text.secondary" fontWeight={600} display="block" sx={{ mb: 0.5 }}>Зоны:</Typography>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>{zoneLabels.map((label, i) => <Chip key={i} label={label} size="small" color="primary" variant="outlined" />)}</Box>
        </Box>
        <Box>
          <Typography variant="caption" color="text.secondary" fontWeight={600} display="block" sx={{ mb: 0.5 }}>Элементы:</Typography>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>{itemLabels.map((label, i) => <Chip key={i} label={renderLatex(label)} size="small" variant="outlined" sx={{ height: "auto", py: 0.5, "& .MuiChip-label": { display: "flex", alignItems: "center" } }} />)}</Box>
        </Box>
      </Box>
    );
  }
  return null;
}

export default function Assignment() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [data, setData] = useState<{
    id: string;
    title: string;
    description_latex?: string;
    max_score: number;
    questions: QuestionData[];
    time_limit_minutes?: number;
  } | null>(null);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(0); // текущий вопрос (SPA без перезагрузки)
  const [materials, setMaterials] = useState<Material[]>([]);
  const [showMaterials, setShowMaterials] = useState(false);
  const [timeExpired, setTimeExpired] = useState(false);

  const startedAt = useRef<string>(new Date().toISOString());
  const startTimestamp = useRef<number>(Date.now());

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([
      getAssignment(id),
      getMaterialsForAssignment(id).catch(() => []),
    ])
      .then(([assignData, mats]) => {
        setData(assignData);
        setMaterials(mats);
      })
      .catch((e: unknown) => {
        const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
        setError(msg || "Ошибка загрузки задания");
      })
      .finally(() => setLoading(false));
  }, [id]);

  // Хеартбит каждые 30 секунд, пока задание открыто
  useEffect(() => {
    if (!id) return;
    sendHeartbeat(id).catch(() => {});
    const timer = setInterval(() => {
      sendHeartbeat(id).catch(() => {});
    }, 30000);
    return () => clearInterval(timer);
  }, [id]);

  const questions: QuestionData[] = useMemo(() => data?.questions ?? [], [data]);

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
    if (!id) return;
    setSubmitting(true);
    setError("");
    setConfirmOpen(false);
    const timeSpent = Math.round((Date.now() - startTimestamp.current) / 1000);
    try {
      const res = await submitAssignment(id, answers, {
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
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate("/")}>Назад</Button>
      </Box>
    );
  }

  // ─── Экран результатов ────────────────────────────────────────────────────
  if (result) {
    const pct = Math.round((result.total_score / result.max_score) * 100);
    const scoreColor = pct >= 90 ? "success" : pct >= 60 ? "primary" : pct >= 30 ? "warning" : "error";
    const correctCount = result.details.filter((d) => d.is_correct).length;
    const timeSpentSec = result.time_spent_seconds ?? Math.round((Date.now() - startTimestamp.current) / 1000);
    const timeMin = Math.floor(timeSpentSec / 60);
    const timeSec = timeSpentSec % 60;

    return (
      <Box sx={{ maxWidth: 800, mx: "auto", p: { xs: 2, md: 3 } }}>
        {/* Итоговая карточка */}
        <Card
          sx={{
            mb: 3,
            textAlign: "center",
            background: `linear-gradient(135deg, var(--mui-palette-${scoreColor}-light, #e8f5e9) 0%, white 100%)`,
            border: "2px solid",
            borderColor: `${scoreColor}.main`,
          }}
        >
          <CardContent sx={{ py: 4 }}>
            <Typography variant="h2" fontWeight={800} color={`${scoreColor}.main`}>
              {result.total_score}<Typography component="span" variant="h4" color="text.secondary">/{result.max_score}</Typography>
            </Typography>
            <Typography variant="h5" fontWeight={600} mt={1} mb={2}>
              {pct >= 90 ? "🏆 Отлично!" : pct >= 60 ? "👍 Хорошо" : pct >= 30 ? "📚 Можно лучше" : "💪 Нужно повторить"}
            </Typography>
            <LinearProgress
              variant="determinate"
              value={pct}
              color={scoreColor}
              sx={{ height: 12, borderRadius: 6, maxWidth: 400, mx: "auto", mb: 2 }}
            />
            <Box sx={{ display: "flex", justifyContent: "center", gap: 3, flexWrap: "wrap" }}>
              <Box>
                <Typography variant="h6" fontWeight={700}>{pct}%</Typography>
                <Typography variant="caption" color="text.secondary">Результат</Typography>
              </Box>
              <Box>
                <Typography variant="h6" fontWeight={700}>{correctCount}/{result.details.length}</Typography>
                <Typography variant="caption" color="text.secondary">Правильных</Typography>
              </Box>
              <Box>
                <Typography variant="h6" fontWeight={700}>{timeMin}:{String(timeSec).padStart(2, "0")}</Typography>
                <Typography variant="caption" color="text.secondary">Затрачено</Typography>
              </Box>
            </Box>
          </CardContent>
        </Card>

        {/* Разбор ответов */}
        <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>Разбор ответов</Typography>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {result.details.map((d, idx) => (
            <Card
              key={d.question_key}
              sx={{
                borderLeft: "4px solid",
                borderColor: d.points === 0 ? "grey.400" : d.is_correct ? "success.main" : "error.main",
                transition: "box-shadow 0.2s",
                "&:hover": { boxShadow: 3 },
              }}
            >
              <CardContent>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5 }}>
                  {d.points === 0 ? (
                    <Box sx={{ width: 22, height: 22, borderRadius: "50%", bgcolor: "grey.300", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Typography variant="caption" sx={{ fontSize: 10, fontWeight: 700, color: "grey.600" }}>—</Typography>
                    </Box>
                  ) : d.is_correct ? (
                    <CheckCircleIcon color="success" />
                  ) : (
                    <CancelIcon color="error" />
                  )}
                  <Typography variant="subtitle1" fontWeight={600}>
                    Вопрос {idx + 1}
                  </Typography>
                  {d.points === 0 ? (
                    <Chip label="Без оценки" size="small" color="default" variant="outlined" sx={{ color: "text.secondary" }} />
                  ) : (
                    <Chip
                      label={`${d.score}/${d.points} б.`}
                      size="small"
                      color={d.is_correct ? "success" : "error"}
                      variant="outlined"
                    />
                  )}
                </Box>

                {d.prompt_latex && (
                  <Box sx={{ mb: 1.5, p: 1.5, bgcolor: "grey.50", borderRadius: 1 }}>
                    {/* Рендерим как обычный текст с поддержкой $...$ для LaTeX */}
                    <Typography variant="body2">{renderLatex(d.prompt_latex)}</Typography>
                  </Box>
                )}

                {/* Тело задания: варианты, элементы и т.д. */}
                <QuestionBody d={d} />

                <Box sx={{ display: "flex", gap: 3, flexWrap: "wrap", alignItems: "flex-start" }}>
                  <Box sx={{ minWidth: 120 }}>
                    <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.75, fontWeight: 600 }}>Ваш ответ:</Typography>
                    <AnswerDisplay val={d.student_answer} qtype={d.qtype} color={d.is_correct ? "success" : "error"} leftItems={d.left_items} rightItems={d.right_items} tableRows={d.table_rows} />
                  </Box>
                  {!d.is_correct && d.correct_answer !== null && d.correct_answer !== undefined && (
                    <>
                      <Box sx={{ display: "flex", alignItems: "center", color: "text.disabled", pt: 3 }}>
                        <Typography variant="body2">→</Typography>
                      </Box>
                      <Box sx={{ minWidth: 120 }}>
                        <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.75, fontWeight: 600 }}>Правильный ответ:</Typography>
                        <AnswerDisplay val={d.correct_answer} qtype={d.qtype} color="success" leftItems={d.left_items} rightItems={d.right_items} tableRows={d.table_rows} />
                      </Box>
                    </>
                  )}
                </Box>

                {!d.is_correct && d.hint && (
                  <Alert severity="info" sx={{ mt: 1.5 }} icon="💡">
                    {d.hint}
                  </Alert>
                )}
              </CardContent>
            </Card>
          ))}
        </Box>

        <Box sx={{ display: "flex", gap: 2, mt: 3, flexWrap: "wrap" }}>
          <Button variant="outlined" startIcon={<ArrowBackIcon />} onClick={() => navigate("/")}>
            К заданиям
          </Button>
          <Button variant="contained" onClick={() => navigate(`/attempts/${result.attempt_id}`)}>
            Подробный разбор
          </Button>
          <Button
            variant="outlined"
            startIcon={<DownloadIcon />}
            onClick={() => {
              const lines: string[] = [];
              lines.push(`Результаты: ${data?.title || id}`);
              lines.push(`Итог: ${result.total_score}/${result.max_score} (${pct}%)`);
              lines.push(`Правильных: ${correctCount}/${result.details.length}`);
              lines.push(`Затрачено: ${timeMin}:${String(timeSec).padStart(2, "0")}`);
              lines.push("");
              result.details.forEach((d, idx) => {
                lines.push(`Вопрос ${idx + 1}: ${d.is_correct ? "✓" : "✗"} (${d.score}/${d.points} б.)`);
                if (d.prompt_latex) lines.push(`  ${d.prompt_latex}`);
              });
              const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
              const a = document.createElement("a");
              a.href = URL.createObjectURL(blob);
              a.download = `результаты_${id}.txt`;
              a.click();
            }}
          >
            Скачать результаты
          </Button>
        </Box>
      </Box>
    );
  }

  // ─── Экран выполнения задания ─────────────────────────────────────────────
  const currentQ = questions[currentPage];
  const totalPages = questions.length;
  const timeLimitSec = (data?.time_limit_minutes ?? 0) * 60;

  return (
    <Box sx={{ maxWidth: 800, mx: "auto", p: { xs: 1, md: 3 } }}>
      {/* Таймер */}
      {timeLimitSec > 0 && !timeExpired && (
        <CountdownTimer
          totalSeconds={timeLimitSec}
          onExpire={handleTimerExpire}
        />
      )}

      {timeExpired && (
        <Alert severity="error" sx={{ mb: 2 }}>
          Время вышло! Ответы отправлены автоматически.
        </Alert>
      )}

      {/* Заголовок */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
        <IconButton onClick={() => navigate("/")} size="small">
          <ArrowBackIcon />
        </IconButton>
        <Box sx={{ flex: 1 }}>
          <Typography variant="h5" fontWeight={700}>{data?.title}</Typography>
          <Box sx={{ display: "flex", gap: 1, mt: 0.5, flexWrap: "wrap" }}>
            <Chip label={`${data?.max_score} баллов`} size="small" color="primary" variant="outlined" />
            <Chip
              label={`${answeredCount}/${questions.length} ответов`}
              size="small"
              color={answeredCount === questions.length ? "success" : "default"}
              variant="outlined"
            />
            {materials.length > 0 && (
              <Chip
                icon={<MenuBookIcon />}
                label="Материалы"
                size="small"
                color="info"
                variant="outlined"
                onClick={() => setShowMaterials(!showMaterials)}
                sx={{ cursor: "pointer" }}
              />
            )}
          </Box>
        </Box>
      </Box>

      {/* Обучающие материалы */}
      <Collapse in={showMaterials}>
        <Card sx={{ mb: 2, bgcolor: "info.50", border: "1px solid", borderColor: "info.light" }}>
          <CardContent>
            <Typography variant="subtitle1" fontWeight={600} mb={1}>
              <MenuBookIcon sx={{ mr: 1, verticalAlign: "middle" }} />
              Обучающие материалы
            </Typography>
            {materials.map((m) => (
              <Box key={m.id} mb={1.5}>
                <Typography variant="subtitle2" fontWeight={600}>{m.title}</Typography>
                {m.description && (
                  <Typography variant="body2" color="text.secondary">{m.description}</Typography>
                )}
                {m.content && m.material_type === "text" && (
                  <Typography variant="body2" sx={{ mt: 0.5, whiteSpace: "pre-wrap" }}>{m.content}</Typography>
                )}
                {m.material_type === "link" && m.content && (
                  <Button size="small" href={m.content} target="_blank" rel="noopener">
                    Открыть ссылку
                  </Button>
                )}
              </Box>
            ))}
          </CardContent>
        </Card>
      </Collapse>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* Описание задания */}
      {data?.description_latex && (
        <Card sx={{ mb: 2, bgcolor: "primary.50", border: "1px solid", borderColor: "primary.light" }}>
          <CardContent>
            <Typography variant="body1">{renderLatex(data.description_latex)}</Typography>
          </CardContent>
        </Card>
      )}

      {/* Прогресс */}
      <Box sx={{ mb: 2 }}>
        <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
          <Typography variant="caption" color="text.secondary">
            Вопрос {currentPage + 1} из {totalPages}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {answeredCount}/{totalPages} отвечено
          </Typography>
        </Box>
        <LinearProgress
          variant="determinate"
          value={totalPages > 0 ? ((currentPage + 1) / totalPages) * 100 : 0}
          sx={{ height: 4, borderRadius: 2 }}
        />
      </Box>

      {/* Навигация по вопросам — точки */}
      {totalPages > 1 && (
        <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", mb: 2 }}>
          {questions.map((q, i) => {
            const isAnswered = answers[q.id] !== undefined && answers[q.id] !== "" &&
              !(Array.isArray(answers[q.id]) && (answers[q.id] as unknown[]).length === 0) &&
              !(typeof answers[q.id] === "object" && Object.keys(answers[q.id] as object).length === 0);
            return (
              <Box
                key={q.id}
                onClick={() => setCurrentPage(i)}
                sx={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 600,
                  border: "2px solid",
                  borderColor: i === currentPage ? "primary.main" : isAnswered ? "success.main" : "divider",
                  bgcolor: i === currentPage ? "primary.main" : isAnswered ? "success.50" : "background.paper",
                  color: i === currentPage ? "white" : isAnswered ? "success.main" : "text.secondary",
                  transition: "all 0.15s",
                  "&:hover": { borderColor: "primary.main" },
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
              <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1, mb: 2 }}>
                <Box
                  sx={{
                    minWidth: 32,
                    height: 32,
                    borderRadius: "50%",
                    bgcolor: "primary.main",
                    color: "white",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 700,
                    fontSize: 14,
                    flexShrink: 0,
                  }}
                >
                  {currentPage + 1}
                </Box>
                <Box sx={{ flex: 1 }}>
                  <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <Typography variant="caption" color="text.secondary">
                      {currentQ.points} {currentQ.points === 1 ? "балл" : "балла"}
                    </Typography>
                  </Box>
                </Box>
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

      {/* Навигация вперёд/назад */}
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mt: 2 }}>
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
            {submitting ? "Отправка..." : "Сдать"}
          </Button>
        )}
      </Box>

      {/* Диалог подтверждения */}
      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Сдать задание?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            Вы ответили на <strong>{answeredCount}</strong> из <strong>{totalPages}</strong> вопросов.
          </Typography>
          {answeredCount < totalPages && (
            <Alert severity="warning" sx={{ mt: 1.5 }}>
              {totalPages - answeredCount} вопросов остались без ответа.
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)}>Отмена</Button>
          <Button variant="contained" color="success" onClick={() => handleSubmit(false)} autoFocus>
            Сдать
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
