import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Box, Typography, Card, CardContent, Alert, CircularProgress,
  Chip, IconButton, LinearProgress, Divider, Stack,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CancelIcon from "@mui/icons-material/Cancel";
import EmojiEventsIcon from "@mui/icons-material/EmojiEvents";
import { InlineMath } from "react-katex";
import "katex/dist/katex.min.css";
import { getAttemptDetail } from "../../api";

interface AnswerDetail {
  question_key: string;
  is_correct: boolean;
  score: number;
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
}

interface AttemptDetail {
  attempt_id: number;
  assignment_title: string;
  submitted_at: string;
  total_score: number;
  max_score: number;
  percent: number;
  answers: AnswerDetail[];
}

/** Рендерит текст с формулами $...$ через KaTeX */
function renderLatex(text: string) {
  if (!text) return null;
  const parts = text.split(/(\$[^$]+\$)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("$") && part.endsWith("$")) {
          return <InlineMath key={i} math={part.slice(1, -1)} />;
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

/** Отображает тело задания — варианты ответов, элементы для сортировки и т.д. */
function QuestionBody({ ans }: { ans: AnswerDetail }) {
  const qtype = ans.qtype;

  // choice / mcq — список вариантов с буллетами
  if (["choice", "mcq", "single", "single_choice", "select"].includes(qtype) && ans.options?.length) {
    return (
      <Box sx={{ mt: 1.5, mb: 1 }}>
        <Typography variant="caption" color="text.secondary" fontWeight={600} display="block" sx={{ mb: 0.5 }}>
          Варианты ответа:
        </Typography>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
          {ans.options.map((opt, i) => {
            const label = typeof opt === "object" ? opt.label : String(opt);
            return (
              <Box key={i} sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Typography variant="caption" sx={{
                  minWidth: 22, height: 22, borderRadius: "50%",
                  bgcolor: "grey.200", color: "text.secondary",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontWeight: 700, fontSize: 11, flexShrink: 0,
                }}>
                  {String.fromCharCode(65 + i)}
                </Typography>
                <Typography variant="body2" color="text.primary">
                  {renderLatex(label)}
                </Typography>
              </Box>
            );
          })}
        </Box>
      </Box>
    );
  }

  // multichoice — список вариантов с чекбокс-иконками
  if (["multichoice", "multiple", "multiple_choice", "multi"].includes(qtype) && ans.options?.length) {
    return (
      <Box sx={{ mt: 1.5, mb: 1 }}>
        <Typography variant="caption" color="text.secondary" fontWeight={600} display="block" sx={{ mb: 0.5 }}>
          Варианты ответа (несколько верных):
        </Typography>
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
          {ans.options.map((opt, i) => {
            const label = typeof opt === "object" ? opt.label : String(opt);
            return (
              <Chip
                key={i}
                label={<span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ fontWeight: 700, fontSize: 11 }}>{String.fromCharCode(65 + i)}.</span>
                  {renderLatex(label)}
                </span>}
                size="small"
                variant="outlined"
                sx={{ height: "auto", py: 0.5, "& .MuiChip-label": { display: "flex", alignItems: "center" } }}
              />
            );
          })}
        </Box>
      </Box>
    );
  }

  // ordering — список элементов для сортировки
  if (["ordering", "order", "sort"].includes(qtype) && ans.order_items?.length) {
    const rawItems = ans.order_items;
    const labels = rawItems.map((it) => typeof it === "object" ? it.label : String(it));
    return (
      <Box sx={{ mt: 1.5, mb: 1 }}>
        <Typography variant="caption" color="text.secondary" fontWeight={600} display="block" sx={{ mb: 0.5 }}>
          Элементы для сортировки:
        </Typography>
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
          {labels.map((label, i) => (
            <Chip
              key={i}
              label={renderLatex(label)}
              size="small"
              variant="outlined"
              sx={{ height: "auto", py: 0.5, "& .MuiChip-label": { display: "flex", alignItems: "center" } }}
            />
          ))}
        </Box>
      </Box>
    );
  }

  // drag_drop — зоны и элементы
  if (["drag_drop", "drag"].includes(qtype) && ans.zones?.length && ans.items?.length) {
    const itemLabels = (ans.items || []).map((it) => typeof it === "object" ? it.label : String(it));
    const zoneLabels = (ans.zones || []).map((z) => typeof z === "object" ? z.label : String(z));
    return (
      <Box sx={{ mt: 1.5, mb: 1 }}>
        <Box sx={{ mb: 1 }}>
          <Typography variant="caption" color="text.secondary" fontWeight={600} display="block" sx={{ mb: 0.5 }}>
            Зоны:
          </Typography>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
            {zoneLabels.map((label, i) => (
              <Chip key={i} label={label} size="small" color="primary" variant="outlined" />
            ))}
          </Box>
        </Box>
        <Box>
          <Typography variant="caption" color="text.secondary" fontWeight={600} display="block" sx={{ mb: 0.5 }}>
            Элементы:
          </Typography>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
            {itemLabels.map((label, i) => (
              <Chip key={i} label={renderLatex(label)} size="small" variant="outlined"
                sx={{ height: "auto", py: 0.5, "& .MuiChip-label": { display: "flex", alignItems: "center" } }}
              />
            ))}
          </Box>
        </Box>
      </Box>
    );
  }

  return null;
}

/** Форматирует ответ в читаемый вид:
 *  - число → строка
 *  - массив строк → нумерованный список (для ordering) или через запятую (для multichoice)
 *  - объект → JSON (fallback, не должно встречаться после исправления бэкенда)
 */
function AnswerDisplay({
  val,
  qtype,
  color,
}: {
  val: unknown;
  qtype: string;
  color: "success" | "error" | "primary";
}) {
  const isOrdering = ["ordering", "order", "sort"].includes(qtype);
  const isMulti = ["multichoice", "multiple", "multiple_choice", "multi"].includes(qtype);
  const isDragDrop = ["drag_drop", "drag"].includes(qtype);
  const isMatching = ["matching", "match", "pairs", "correspondence"].includes(qtype);
  const isMatchingMulti = ["matching_multi", "match_multi"].includes(qtype);
  const isTableFill = ["table_fill"].includes(qtype);
  const isTableSelect = ["table_select"].includes(qtype);

  const colorMap = {
    success: { bg: "#f0fdf4", border: "#86efac", text: "#166534" },
    error:   { bg: "#fef2f2", border: "#fca5a5", text: "#991b1b" },
    primary: { bg: "#eff6ff", border: "#93c5fd", text: "#1e40af" },
  };
  const c = colorMap[color];

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
                {String(item)}
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
            <Chip
              key={i}
              label={String(item)}
              size="small"
              sx={{
                bgcolor: c.bg, border: `1px solid ${c.border}`,
                color: c.text, fontWeight: 600,
              }}
            />
          ))}
        </Box>
      );
    }
    // Другой массив — через запятую
    return (
      <Typography variant="body2" fontWeight={600} color={c.text} sx={{ fontFamily: "monospace" }}>
        {val.map(String).join(", ")}
      </Typography>
    );
  }

  // null/undefined
  if (val === null || val === undefined) {
    return (
      <Typography variant="body2" color="text.disabled" sx={{ fontStyle: "italic" }}>
        нет ответа
      </Typography>
    );
  }

  // Объект (drag_drop или fallback)
  if (typeof val === "object") {
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
    if (isMatchingMulti) {
      const obj = val as Record<string, string[]>;
      return (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
          {Object.entries(obj).map(([left, rights], i) => (
            <Box key={i} sx={{ display: "flex", alignItems: "flex-start", gap: 1, px: 1.5, py: 0.5, borderRadius: 1, bgcolor: c.bg, border: `1px solid ${c.border}` }}>
              <Typography variant="body2" color={c.text} fontWeight={600} sx={{ minWidth: 80, flexShrink: 0 }}>{left}</Typography>
              <Typography variant="body2" color="text.disabled" sx={{ flexShrink: 0 }}>→</Typography>
              <Typography variant="body2" color={c.text}>
                {Array.isArray(rights) ? rights.join(", ") : String(rights)}
              </Typography>
            </Box>
          ))}
        </Box>
      );
    }
    if (isTableFill || isTableSelect) {
      const obj = val as Record<string, string>;
      return (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
          {Object.entries(obj).map(([cell, cellVal], i) => (
            <Box key={i} sx={{ display: "flex", alignItems: "center", gap: 1, px: 1.5, py: 0.5, borderRadius: 1, bgcolor: c.bg, border: `1px solid ${c.border}` }}>
              <Typography variant="body2" color="text.secondary" sx={{ minWidth: 120, flexShrink: 0, fontStyle: "italic" }}>{cell}:</Typography>
              <Typography variant="body2" color={c.text} fontWeight={600}>{String(cellVal)}</Typography>
            </Box>
          ))}
        </Box>
      );
    }
    const obj = val as Record<string, unknown>;
    let display = "";
    if ("value" in obj) display = String(obj.value);
    else if ("index" in obj) display = `Вариант ${Number(obj.index) + 1}`;
    else if ("order" in obj && Array.isArray(obj.order)) display = (obj.order as unknown[]).map(String).join(" → ");
    else if ("indices" in obj && Array.isArray(obj.indices)) display = `Варианты: ${(obj.indices as unknown[]).map(String).join(", ")}`;
    else display = JSON.stringify(val);
    return (
      <Box sx={{ px: 1.5, py: 0.75, borderRadius: 1, bgcolor: c.bg, border: `1px solid ${c.border}`, display: "inline-block" }}>
        <Typography variant="body2" fontWeight={600} color={c.text} sx={{ fontFamily: "monospace" }}>
          {display}
        </Typography>
      </Box>
    );
  }

  // Простое значение (число, строка) — рендерим LaTeX если есть $...$
  const strVal = String(val);
  const hasLatex = strVal.includes("$");
  return (
    <Box sx={{ px: 1.5, py: 0.75, borderRadius: 1, bgcolor: c.bg, border: `1px solid ${c.border}`, display: "inline-block" }}>
      {hasLatex ? (
        <Typography variant="body2" fontWeight={600} color={c.text} component="span">
          {renderLatex(strVal)}
        </Typography>
      ) : (
        <Typography variant="body2" fontWeight={600} color={c.text}>
          {strVal}
        </Typography>
      )}
    </Box>
  );
}

export default function AttemptReview() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<AttemptDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    getAttemptDetail(parseInt(id))
      .then(setDetail)
      .catch(() => setError("Ошибка загрузки данных"))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "60vh" }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error || !detail) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">{error || "Данные не найдены"}</Alert>
      </Box>
    );
  }

  const pct = detail.percent;
  const scoreColor: "success" | "primary" | "warning" | "error" =
    pct >= 90 ? "success" : pct >= 60 ? "primary" : pct >= 30 ? "warning" : "error";
  const scoreLabel = pct >= 90 ? "Отлично!" : pct >= 60 ? "Хорошо" : pct >= 30 ? "Можно лучше" : "Нужно повторить";
  const correctCount = detail.answers.filter((a) => a.is_correct).length;
  const errorCount = detail.answers.length - correctCount;

  return (
    <Box sx={{ maxWidth: 720, mx: "auto", p: { xs: 2, md: 3 } }}>
      {/* Кнопка назад + заголовок */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 3 }}>
        <IconButton onClick={() => navigate(-1)} sx={{ bgcolor: "grey.100" }}>
          <ArrowBackIcon />
        </IconButton>
        <Box>
          <Typography variant="h5" fontWeight={700}>Разбор задания</Typography>
          <Typography variant="body2" color="text.secondary">{detail.assignment_title}</Typography>
        </Box>
      </Box>

      {/* Итоговая карточка */}
      <Card
        sx={{
          mb: 3, background: `linear-gradient(135deg, ${
            pct >= 90 ? "#f0fdf4, #dcfce7" :
            pct >= 60 ? "#eff6ff, #dbeafe" :
            pct >= 30 ? "#fffbeb, #fef3c7" : "#fef2f2, #fee2e2"
          })`,
          border: "1px solid",
          borderColor: pct >= 90 ? "success.200" : pct >= 60 ? "primary.200" : pct >= 30 ? "warning.200" : "error.200",
        }}
      >
        <CardContent sx={{ textAlign: "center", py: 4 }}>
          {pct >= 90 && (
            <EmojiEventsIcon sx={{ fontSize: 48, color: "warning.main", mb: 1 }} />
          )}
          <Typography variant="h2" fontWeight={900} color={`${scoreColor}.main`}>
            {detail.total_score}<Typography component="span" variant="h4" color="text.secondary">/{detail.max_score}</Typography>
          </Typography>
          <Typography variant="h6" fontWeight={600} color={`${scoreColor}.dark`} sx={{ mb: 2 }}>
            {pct}% — {scoreLabel}
          </Typography>
          <LinearProgress
            variant="determinate"
            value={pct}
            color={scoreColor}
            sx={{ height: 12, borderRadius: 6, maxWidth: 320, mx: "auto", mb: 3 }}
          />
          <Stack direction="row" spacing={2} justifyContent="center">
            <Chip
              icon={<CheckCircleIcon />}
              label={`${correctCount} правильно`}
              color="success"
              variant="outlined"
              sx={{ fontWeight: 600 }}
            />
            <Chip
              icon={<CancelIcon />}
              label={`${errorCount} ошибок`}
              color={errorCount > 0 ? "error" : "default"}
              variant="outlined"
              sx={{ fontWeight: 600 }}
            />
          </Stack>
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 2 }}>
            {new Date(detail.submitted_at).toLocaleString("ru-RU")}
          </Typography>
        </CardContent>
      </Card>

      {/* Разбор по вопросам */}
      <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>
        Подробный разбор
      </Typography>

      <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {detail.answers.map((ans, idx) => (
          <Card
            key={ans.question_key}
            sx={{
              borderLeft: "5px solid",
              borderColor: ans.points === 0 ? "grey.400" : ans.is_correct ? "success.main" : "error.main",
              transition: "box-shadow 0.2s",
              "&:hover": { boxShadow: 4 },
            }}
          >
            <CardContent>
              {/* Заголовок вопроса */}
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5 }}>
                {ans.points === 0 ? (
                  <Box sx={{ width: 22, height: 22, borderRadius: "50%", bgcolor: "grey.300", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Typography variant="caption" sx={{ fontSize: 10, fontWeight: 700, color: "grey.600" }}>—</Typography>
                  </Box>
                ) : ans.is_correct ? (
                  <CheckCircleIcon color="success" sx={{ fontSize: 22 }} />
                ) : (
                  <CancelIcon color="error" sx={{ fontSize: 22 }} />
                )}
                <Typography variant="subtitle1" fontWeight={700}>
                  Вопрос {idx + 1}
                </Typography>
                <Box sx={{ flexGrow: 1 }} />
                {ans.points === 0 ? (
                  <Chip
                    label="Без оценки"
                    size="small"
                    color="default"
                    variant="outlined"
                    sx={{ fontWeight: 600, color: "text.secondary" }}
                  />
                ) : (
                  <Chip
                    label={`${ans.score} / ${ans.points} б.`}
                    size="small"
                    color={ans.is_correct ? "success" : "error"}
                    sx={{ fontWeight: 700 }}
                  />
                )}
              </Box>

              {/* Текст вопроса */}
              {ans.prompt_latex && (
                <Box
                  sx={{
                    p: 1.5, borderRadius: 1, bgcolor: "grey.50",
                    mb: 1.5, border: "1px solid", borderColor: "divider",
                    fontSize: "0.95rem", lineHeight: 1.6,
                  }}
                >
                  {renderLatex(ans.prompt_latex)}
                </Box>
              )}

              {/* Тело задания: варианты, элементы и т.д. */}
              <QuestionBody ans={ans} />

              {/* Ответы */}
              <Box sx={{ display: "flex", gap: 3, flexWrap: "wrap", alignItems: "flex-start" }}>
                {/* Ответ ученика */}
                <Box sx={{ minWidth: 120 }}>
                  <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.75, fontWeight: 600 }}>
                    Ваш ответ:
                  </Typography>
                  <AnswerDisplay
                    val={ans.student_answer}
                    qtype={ans.qtype}
                    color={ans.is_correct ? "success" : "error"}
                  />
                </Box>

                {/* Правильный ответ — только если ошибся */}
                {!ans.is_correct && (
                  <>
                    <Box sx={{ display: "flex", alignItems: "center", color: "text.disabled", pt: 3 }}>
                      <Typography variant="body2">→</Typography>
                    </Box>
                    <Box sx={{ minWidth: 120 }}>
                      <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.75, fontWeight: 600 }}>
                        Правильный ответ:
                      </Typography>
                      <AnswerDisplay
                        val={ans.correct_answer}
                        qtype={ans.qtype}
                        color="success"
                      />
                    </Box>
                  </>
                )}
              </Box>

              {/* Подсказка при ошибке */}
              {!ans.is_correct && (
                <Box
                  sx={{
                    mt: 2, p: 1.5, borderRadius: 1,
                    bgcolor: "#fffbeb", border: "1px solid #fde68a",
                  }}
                >
                  <Typography variant="caption" color="#92400e" sx={{ fontWeight: 500 }}>
                    {ans.hint ? `💡 ${ans.hint}` : "💡 Обратите внимание на этот вопрос при следующей попытке"}
                  </Typography>
                </Box>
              )}
            </CardContent>
          </Card>
        ))}
      </Box>

      <Divider sx={{ my: 3 }} />
      <Box sx={{ textAlign: "center" }}>
        <Typography variant="body2" color="text.secondary">
          Попытка #{detail.attempt_id} · {new Date(detail.submitted_at).toLocaleString("ru-RU")}
        </Typography>
      </Box>
    </Box>
  );
}
