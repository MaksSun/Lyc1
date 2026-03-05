import { useState, useEffect } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import {
  Box, Typography, Card, CardContent, Alert, CircularProgress,
  Chip, IconButton, Divider, LinearProgress, Stack, Avatar,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CancelIcon from "@mui/icons-material/Cancel";
import PersonIcon from "@mui/icons-material/Person";
import AssignmentIcon from "@mui/icons-material/Assignment";
import { getAdminAttemptDetail } from "../../api";
import { InlineMath } from "react-katex";
import "katex/dist/katex.min.css";

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
  student_id: number;
  student_name: string;
  student_code: string;
  class_name: string;
  assignment_id: string;
  assignment_title: string;
  submitted_at: string;
  total_score: number;
  max_score: number;
  percent: number;
  answers: AnswerDetail[];
}

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

/** Отображает тело задания — варианты, элементы и т.д. */
function QuestionBody({ ans }: { ans: AnswerDetail }) {
  const qtype = ans.qtype;
  if (["choice", "mcq", "single", "single_choice", "select"].includes(qtype) && ans.options?.length) {
    return (
      <Box sx={{ mt: 1.5, mb: 1 }}>
        <Typography variant="caption" color="text.secondary" fontWeight={600} display="block" sx={{ mb: 0.5 }}>Варианты ответа:</Typography>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
          {ans.options.map((opt, i) => {
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
  if (["multichoice", "multiple", "multiple_choice", "multi"].includes(qtype) && ans.options?.length) {
    return (
      <Box sx={{ mt: 1.5, mb: 1 }}>
        <Typography variant="caption" color="text.secondary" fontWeight={600} display="block" sx={{ mb: 0.5 }}>Варианты ответа (несколько верных):</Typography>
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
          {ans.options.map((opt, i) => {
            const label = typeof opt === "object" ? opt.label : String(opt);
            return <Chip key={i} label={<span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ fontWeight: 700, fontSize: 11 }}>{String.fromCharCode(65 + i)}.</span>{renderLatex(label)}</span>} size="small" variant="outlined" sx={{ height: "auto", py: 0.5, "& .MuiChip-label": { display: "flex", alignItems: "center" } }} />;
          })}
        </Box>
      </Box>
    );
  }
  if (["ordering", "order", "sort"].includes(qtype) && ans.order_items?.length) {
    const labels = ans.order_items.map((it) => typeof it === "object" ? it.label : String(it));
    return (
      <Box sx={{ mt: 1.5, mb: 1 }}>
        <Typography variant="caption" color="text.secondary" fontWeight={600} display="block" sx={{ mb: 0.5 }}>Элементы для сортировки:</Typography>
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
          {labels.map((label, i) => <Chip key={i} label={renderLatex(label)} size="small" variant="outlined" sx={{ height: "auto", py: 0.5, "& .MuiChip-label": { display: "flex", alignItems: "center" } }} />)}
        </Box>
      </Box>
    );
  }
  if (["drag_drop", "drag"].includes(qtype) && ans.zones?.length && ans.items?.length) {
    const itemLabels = (ans.items || []).map((it) => typeof it === "object" ? it.label : String(it));
    const zoneLabels = (ans.zones || []).map((z) => typeof z === "object" ? z.label : String(z));
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

/** Компонент отображения ответа — поддерживает все типы */
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

  if (Array.isArray(val)) {
    if (isOrdering) {
      return (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
          {val.map((item, i) => (
            <Box
              key={i}
              sx={{
                display: "flex", alignItems: "center", gap: 1,
                px: 1.5, py: 0.4, borderRadius: 1,
                bgcolor: c.bg, border: `1px solid ${c.border}`,
              }}
            >
              <Typography
                variant="caption"
                sx={{
                  minWidth: 20, height: 20, borderRadius: "50%",
                  bgcolor: c.border, color: c.text,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontWeight: 700, fontSize: 10,
                }}
              >
                {i + 1}
              </Typography>
              <Typography variant="body2" fontWeight={600} color={c.text} sx={{ fontSize: 13 }}>
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
              sx={{ px: 1.5, py: 0.4, borderRadius: 2, bgcolor: c.bg, border: `1px solid ${c.border}` }}
            >
              <Typography variant="body2" fontWeight={600} color={c.text} sx={{ fontSize: 13 }}>
                {renderLatex(String(item))}
              </Typography>
            </Box>
          ))}
        </Box>
      );
    }
    return (
      <Typography variant="body2" fontWeight={600} color={c.text} sx={{ fontFamily: "monospace" }}>
        {val.map(String).join(", ")}
      </Typography>
    );
  }

  if (val === null || val === undefined) {
    return (
      <Typography variant="body2" color="text.disabled" sx={{ fontStyle: "italic" }}>нет ответа</Typography>
    );
  }

  if (typeof val === "object") {
    if (isDragDrop) {
      const obj = val as Record<string, unknown[]>;
      return (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
          {Object.entries(obj).map(([zone, items]) => (
            <Box key={zone} sx={{ px: 1.5, py: 0.4, borderRadius: 1, bgcolor: c.bg, border: `1px solid ${c.border}` }}>
              <Typography variant="caption" color={c.text} fontWeight={700}>{zone}:</Typography>
              <Typography variant="body2" color={c.text} sx={{ fontSize: 13 }}>
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
            <Box key={i} sx={{ display: "flex", alignItems: "center", gap: 1, px: 1.5, py: 0.4, borderRadius: 1, bgcolor: c.bg, border: `1px solid ${c.border}` }}>
              <Typography variant="body2" color={c.text} fontWeight={600} sx={{ minWidth: 80, fontSize: 13 }}>{left}</Typography>
              <Typography variant="body2" color="text.disabled">→</Typography>
              <Typography variant="body2" color={c.text} sx={{ fontSize: 13 }}>{right}</Typography>
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
            <Box key={i} sx={{ display: "flex", alignItems: "flex-start", gap: 1, px: 1.5, py: 0.4, borderRadius: 1, bgcolor: c.bg, border: `1px solid ${c.border}` }}>
              <Typography variant="body2" color={c.text} fontWeight={600} sx={{ minWidth: 80, flexShrink: 0, fontSize: 13 }}>{left}</Typography>
              <Typography variant="body2" color="text.disabled" sx={{ flexShrink: 0 }}>→</Typography>
              <Typography variant="body2" color={c.text} sx={{ fontSize: 13 }}>
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
            <Box key={i} sx={{ display: "flex", alignItems: "center", gap: 1, px: 1.5, py: 0.4, borderRadius: 1, bgcolor: c.bg, border: `1px solid ${c.border}` }}>
              <Typography variant="body2" color="text.secondary" sx={{ minWidth: 120, flexShrink: 0, fontStyle: "italic", fontSize: 12 }}>{cell}:</Typography>
              <Typography variant="body2" color={c.text} fontWeight={600} sx={{ fontSize: 13 }}>{String(cellVal)}</Typography>
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
      <Box sx={{ px: 1.5, py: 0.5, borderRadius: 1, bgcolor: c.bg, border: `1px solid ${c.border}`, display: "inline-block" }}>
        <Typography variant="body2" fontWeight={600} color={c.text} sx={{ fontFamily: "monospace" }}>
          {display}
        </Typography>
      </Box>
    );
  }

  const strVal = String(val);
  const hasLatex = strVal.includes("$");
  return (
    <Box sx={{ px: 1.5, py: 0.5, borderRadius: 1, bgcolor: c.bg, border: `1px solid ${c.border}`, display: "inline-block" }}>
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

export default function AdminAttemptDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const backState = (location.state as { classId?: number; assignmentId?: string } | null);

  const handleBack = () => {
    if (backState?.classId && backState?.assignmentId) {
      navigate("/admin/results", {
        state: { classId: backState.classId, assignmentId: backState.assignmentId },
      });
    } else {
      navigate(-1);
    }
  };
  const [detail, setDetail] = useState<AttemptDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    getAdminAttemptDetail(parseInt(id))
      .then(setDetail)
      .catch(() => setError("Ошибка загрузки данных"))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error || !detail) {
    return <Alert severity="error">{error || "Данные не найдены"}</Alert>;
  }

  const pct = detail.percent;
  const scoreColor: "success" | "primary" | "warning" | "error" =
    pct >= 90 ? "success" : pct >= 60 ? "primary" : pct >= 30 ? "warning" : "error";
  const correctCount = detail.answers.filter((a) => a.is_correct).length;

  return (
    <Box>
      {/* Заголовок */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 3 }}>
        <IconButton onClick={handleBack} sx={{ bgcolor: "grey.100" }}>
          <ArrowBackIcon />
        </IconButton>
        <Box>
          <Typography variant="h5" fontWeight={700}>Разбор попытки #{detail.attempt_id}</Typography>
          <Typography variant="body2" color="text.secondary">
            {detail.student_name} · {detail.class_name} · {detail.assignment_title}
          </Typography>
        </Box>
      </Box>

      {/* Сводная карточка */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box sx={{ display: "flex", gap: 3, flexWrap: "wrap", alignItems: "stretch" }}>
            {/* Ученик */}
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, minWidth: 160 }}>
              <Avatar sx={{ bgcolor: "primary.100", color: "primary.main" }}>
                <PersonIcon />
              </Avatar>
              <Box>
                <Typography variant="caption" color="text.secondary">Ученик</Typography>
                <Typography variant="body1" fontWeight={700}>{detail.student_name}</Typography>
                <Chip
                  label={detail.student_code}
                  size="small"
                  variant="outlined"
                  sx={{ fontFamily: "monospace", mt: 0.5 }}
                />
              </Box>
            </Box>

            <Divider orientation="vertical" flexItem />

            {/* Задание */}
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, minWidth: 160 }}>
              <Avatar sx={{ bgcolor: "secondary.100", color: "secondary.main" }}>
                <AssignmentIcon />
              </Avatar>
              <Box>
                <Typography variant="caption" color="text.secondary">Задание</Typography>
                <Typography variant="body1" fontWeight={700}>{detail.assignment_title}</Typography>
                <Typography variant="caption" color="text.secondary" sx={{ fontFamily: "monospace" }}>
                  {detail.assignment_id}
                </Typography>
              </Box>
            </Box>

            <Divider orientation="vertical" flexItem />

            {/* Результат */}
            <Box sx={{ minWidth: 160 }}>
              <Typography variant="caption" color="text.secondary">Результат</Typography>
              <Typography variant="h4" fontWeight={900} color={`${scoreColor}.main`}>
                {detail.total_score}
                <Typography component="span" variant="h6" color="text.secondary">
                  /{detail.max_score}
                </Typography>
              </Typography>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 0.5 }}>
                <LinearProgress
                  variant="determinate"
                  value={pct}
                  color={scoreColor}
                  sx={{ flex: 1, height: 8, borderRadius: 4, minWidth: 100 }}
                />
                <Typography variant="body2" fontWeight={700}>{pct}%</Typography>
              </Box>
              <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                <Chip
                  icon={<CheckCircleIcon />}
                  label={`${correctCount} верно`}
                  size="small"
                  color="success"
                  variant="outlined"
                />
                <Chip
                  icon={<CancelIcon />}
                  label={`${detail.answers.length - correctCount} ошибок`}
                  size="small"
                  color={detail.answers.length - correctCount > 0 ? "error" : "default"}
                  variant="outlined"
                />
              </Stack>
            </Box>

            <Divider orientation="vertical" flexItem />

            {/* Дата */}
            <Box>
              <Typography variant="caption" color="text.secondary">Дата сдачи</Typography>
              <Typography variant="body2" fontWeight={600}>
                {new Date(detail.submitted_at).toLocaleString("ru-RU")}
              </Typography>
            </Box>
          </Box>
        </CardContent>
      </Card>

      {/* Ответы */}
      <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>
        Ответы по вопросам ({correctCount}/{detail.answers.length} правильных)
      </Typography>

      <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {detail.answers.map((ans, idx) => (
          <Card
            key={ans.question_key}
            sx={{
              borderLeft: "5px solid",
              borderColor: ans.is_correct ? "success.main" : "error.main",
              transition: "box-shadow 0.2s",
              "&:hover": { boxShadow: 3 },
            }}
          >
            <CardContent>
              {/* Заголовок */}
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5 }}>
                {ans.is_correct ? (
                  <CheckCircleIcon color="success" fontSize="small" />
                ) : (
                  <CancelIcon color="error" fontSize="small" />
                )}
                <Typography variant="subtitle2" fontWeight={700}>
                  Вопрос {idx + 1}
                </Typography>
                <Chip
                  label={`${ans.score}/${ans.points} б.`}
                  size="small"
                  color={ans.is_correct ? "success" : "error"}
                  variant="outlined"
                  sx={{ fontWeight: 700 }}
                />
                <Chip
                  label={ans.qtype}
                  size="small"
                  variant="outlined"
                  sx={{ fontSize: 10, color: "text.secondary" }}
                />
              </Box>

              {/* Текст вопроса */}
              {ans.prompt_latex && (
                <Box
                  sx={{
                    p: 1.5, borderRadius: 1, bgcolor: "grey.50",
                    mb: 1.5, border: "1px solid", borderColor: "divider",
                    fontSize: "0.9rem", lineHeight: 1.6,
                  }}
                >
                  {renderLatex(ans.prompt_latex)}
                </Box>
              )}

              {/* Тело задания: варианты, элементы и т.д. */}
              <QuestionBody ans={ans} />

              {/* Ответы */}
              <Box sx={{ display: "flex", gap: 3, flexWrap: "wrap", alignItems: "flex-start" }}>
                <Box sx={{ minWidth: 120 }}>
                  <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.75, fontWeight: 600 }}>
                    Ответ ученика:
                  </Typography>
                  <AnswerDisplay
                    val={ans.student_answer}
                    qtype={ans.qtype}
                    color={ans.is_correct ? "success" : "error"}
                  />
                </Box>

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
            </CardContent>
          </Card>
        ))}
      </Box>
    </Box>
  );
}
