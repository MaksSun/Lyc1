import React from "react";
import {
  Box,
  TextField,
  FormControl,
  FormControlLabel,
  Radio,
  RadioGroup,
  Checkbox,
  FormGroup,
  Typography,
  Slider,
  Rating,
  Paper,
  Button,
  Stack,
} from "@mui/material";
import { InlineMath } from "react-katex";
import DragDropQuestion from "./DragDropQuestion";
import MatchingQuestion from "./MatchingQuestion";
import MatchingMultiQuestion from "./MatchingMultiQuestion";
import OrderingQuestion from "./OrderingQuestion";
import TableQuestion from "./TableQuestion";
import ImageWithLightbox from "../ImageWithLightbox";

// ─── Типы ────────────────────────────────────────────────────────────────────

export interface OptionItem {
  id: string;
  label?: string;
  image_url?: string;
}

export interface QuestionData {
  id: string;
  qtype?: string;   // поле от бэкенда
  type?: string;    // альтернативное поле
  prompt_latex?: string;
  prompt?: string;
  image_url?: string;
  // options может быть массивом строк ИЛИ объектов {id, label, image_url}
  options?: Array<string | OptionItem>;
  zones?: Array<{ id: string; label: string }>;
  items?: Array<string | { id: string; label: string; image_url?: string }>;
  left_items?: Array<{ id: string; label?: string; image_url?: string }>;
  right_items?: Array<{ id: string; label?: string; image_url?: string }>;
  // order_items — строки или объекты {id, label, image_url}
  order_items?: Array<string | { id: string; label?: string; image_url?: string }>;
  blank_text?: string;
  rating_min?: number;
  rating_max?: number;
  rating_labels?: string[];
  rating_label_min?: string;
  rating_label_max?: string;
  points?: number;
  hint?: string;
  // Для table_fill / table_select
  table_headers?: string[];
  table_rows?: Array<{
    id: string;
    label: string;
    cells: Array<{ id: string; editable?: boolean; placeholder?: string; options?: string[] }>;
  }>;
  table_options?: string[];
}

interface QuestionRendererProps {
  question: QuestionData;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
  showResult?: boolean;
  isCorrect?: boolean;
  correctAnswer?: unknown;
  studentAnswer?: unknown;
  /** Результаты по ячейкам таблицы { "row:col": {ok, correct} } */
  cellResults?: Record<string, { ok: boolean; correct: string }>;
}

// ─── Утилиты ─────────────────────────────────────────────────────────────────

/** Нормализует элемент опции в {id, label, image_url?} */
function normalizeOption(
  opt: string | OptionItem,
  idx: number
): OptionItem {
  if (typeof opt === "string") {
    return { id: String(idx), label: opt };
  }
  return {
    id: String(opt.id ?? idx),
    label: String(opt.label ?? opt.id ?? idx),
    image_url: opt.image_url,
  };
}

/** Нормализует массив опций в [{id, label, image_url?}] */
function normalizeOptions(
  opts: Array<string | OptionItem> | undefined
): OptionItem[] {
  if (!opts || opts.length === 0) return [];
  return opts.map((opt, idx) => normalizeOption(opt, idx));
}

/** Нормализует order_items (строки или объекты) в [{id, label, image_url?}] */
function normalizeOrderItems(
  orderItems: Array<string | { id: string; label?: string; image_url?: string }> | undefined,
  items: Array<string | { id: string; label?: string; image_url?: string }> | undefined
): Array<{ id: string; label: string; image_url?: string }> {
  const src = (orderItems && orderItems.length > 0) ? orderItems : items;
  if (!src || src.length === 0) return [];
  return src.map((it, idx) => {
    if (typeof it === "string") return { id: String(idx), label: it };
    return {
      id: String(it.id ?? idx),
      label: String(it.label ?? it.id ?? idx),
      image_url: it.image_url,
    };
  });
}

// ─── Компонент текста с LaTeX ─────────────────────────────────────────────────

function PromptText({ text }: { text: string }) {
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

/** Рендерит опцию: картинку или текст */
function OptionContent({ opt }: { opt: OptionItem }) {
  if (opt.image_url) {
    return (
      <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 0.5 }}>
        <ImageWithLightbox
          src={opt.image_url}
          alt={opt.label || opt.id}
          style={{ maxWidth: 120, maxHeight: 90, borderRadius: 6, objectFit: "contain" }}
        />
        {opt.label && (
          <Typography variant="caption" color="text.secondary">{opt.label}</Typography>
        )}
      </Box>
    );
  }
  return <PromptText text={opt.label || opt.id} />;
}

// ─── Основной компонент ───────────────────────────────────────────────────────

export default function QuestionRenderer({
  question,
  value,
  onChange,
  disabled,
  showResult,
  isCorrect,
  correctAnswer,
  studentAnswer,
  cellResults,
}: QuestionRendererProps) {
  // Тип вопроса — бэкенд может отдавать в поле qtype или type
  const qtype = (question.qtype || question.type || "number").toLowerCase();

  // Нормализованные опции (всегда [{id, label, image_url?}])
  const options = normalizeOptions(question.options);

  // Нормализованные элементы для ordering
  const orderItems = normalizeOrderItems(question.order_items, question.items);

  // Есть ли картинки в options
  const optionsHaveImages = options.some(o => o.image_url);

  const renderInput = () => {
    switch (qtype) {
      // ── Числовой ответ ──────────────────────────────────────────────────────
      case "number":
      case "numeric":
      case "expr":
        return (
          <Stack direction="row" spacing={1} alignItems="center">
            <Button
              variant="outlined"
              size="small"
              disabled={disabled}
              onClick={() => {
                const cur = String(value ?? "");
                if (cur.startsWith("-")) {
                  onChange(cur.slice(1));
                } else {
                  onChange("-" + cur);
                }
              }}
              sx={{
                minWidth: 36,
                width: 36,
                height: 36,
                fontSize: 20,
                fontWeight: 700,
                p: 0,
                borderRadius: 2,
                color: "text.primary",
                borderColor: "divider",
              }}
            >
              −
            </Button>
            <TextField
              type="text"
              inputMode="decimal"
              variant="outlined"
              size="small"
              value={value ?? ""}
              onChange={(e) => {
                // Allow digits, dot, comma (replace comma with dot), minus at start
                let v = e.target.value.replace(",", ".");
                // Only allow: optional leading minus, digits, one dot
                v = v.replace(/[^0-9.\-]/g, "");
                // Ensure minus only at start
                if (v.indexOf("-") > 0) v = v.replace("-", "");
                onChange(v);
              }}
              disabled={disabled}
              placeholder="Введите число"
              sx={{ maxWidth: 180 }}
              inputProps={{ step: "any", style: { textAlign: "center" } }}
            />
          </Stack>
        );

      // ── Короткий текст ──────────────────────────────────────────────────────
      case "text":
      case "shorttext":
      case "short_text":
        return (
          <TextField
            variant="outlined"
            size="small"
            value={value ?? ""}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            placeholder="Введите ответ"
            sx={{ maxWidth: 400 }}
          />
        );

      // ── Длинный текст ───────────────────────────────────────────────────────
      case "text_long":
      case "essay":
        return (
          <TextField
            variant="outlined"
            multiline
            minRows={3}
            maxRows={8}
            fullWidth
            value={value ?? ""}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            placeholder="Введите развёрнутый ответ..."
          />
        );

      // ── Один вариант (radio) — с поддержкой картинок ────────────────────────
      case "choice":
      case "mcq":
      case "single":
      case "single_choice":
      case "select":
        if (optionsHaveImages) {
          // Сетка с картинками
          return (
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1.5 }}>
              {options.map((opt) => {
                const isSelected = String(value) === opt.id;
                const isCorrectOpt = showResult && String(correctAnswer) === opt.id;
                const isWrongOpt = showResult && String(studentAnswer) === opt.id && String(correctAnswer) !== opt.id;
                return (
                  <Paper
                    key={opt.id}
                    elevation={isSelected ? 4 : 1}
                    onClick={() => !disabled && onChange(opt.id)}
                    sx={{
                      p: 1.5,
                      cursor: disabled ? "default" : "pointer",
                      border: "2px solid",
                      borderColor: isCorrectOpt
                        ? "success.main"
                        : isWrongOpt
                        ? "error.main"
                        : isSelected
                        ? "primary.main"
                        : "divider",
                      borderRadius: 2,
                      bgcolor: isCorrectOpt
                        ? "success.50"
                        : isWrongOpt
                        ? "error.50"
                        : isSelected
                        ? "primary.50"
                        : "background.paper",
                      transition: "all 0.2s",
                      minWidth: 120,
                      textAlign: "center",
                    }}
                  >
                    <OptionContent opt={opt} />
                  </Paper>
                );
              })}
            </Box>
          );
        }
        return (
          <FormControl>
            <RadioGroup
              value={value ?? ""}
              onChange={(e) => onChange(e.target.value)}
            >
              {options.map((opt) => (
                <FormControlLabel
                  key={opt.id}
                  value={opt.id}
                  control={<Radio disabled={disabled} />}
                  label={<PromptText text={opt.label || opt.id} />}
                  sx={{
                    ...(showResult && String(correctAnswer) === opt.id && {
                      "& .MuiFormControlLabel-label": { color: "success.main", fontWeight: 600 },
                    }),
                    ...(showResult && String(studentAnswer) === opt.id && String(correctAnswer) !== opt.id && {
                      "& .MuiFormControlLabel-label": { color: "error.main" },
                    }),
                  }}
                />
              ))}
            </RadioGroup>
          </FormControl>
        );

      // ── Несколько вариантов (checkbox) — с поддержкой картинок ─────────────
      case "multichoice":
      case "multiple":
      case "multiple_choice":
      case "multi": {
        const selected: string[] = Array.isArray(value) ? (value as string[]) : [];
        if (optionsHaveImages) {
          return (
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1.5 }}>
              {options.map((opt) => {
                const isSelected = selected.includes(opt.id);
                const isCorrectOpt = showResult && Array.isArray(correctAnswer) && (correctAnswer as string[]).includes(opt.id);
                return (
                  <Paper
                    key={opt.id}
                    elevation={isSelected ? 4 : 1}
                    onClick={() => {
                      if (disabled) return;
                      const next = isSelected
                        ? selected.filter(id => id !== opt.id)
                        : [...selected, opt.id];
                      onChange(next);
                    }}
                    sx={{
                      p: 1.5,
                      cursor: disabled ? "default" : "pointer",
                      border: "2px solid",
                      borderColor: isCorrectOpt
                        ? "success.main"
                        : isSelected
                        ? "primary.main"
                        : "divider",
                      borderRadius: 2,
                      bgcolor: isCorrectOpt
                        ? "success.50"
                        : isSelected
                        ? "primary.50"
                        : "background.paper",
                      transition: "all 0.2s",
                      minWidth: 120,
                      textAlign: "center",
                    }}
                  >
                    <OptionContent opt={opt} />
                  </Paper>
                );
              })}
            </Box>
          );
        }
        return (
          <FormGroup>
            {options.map((opt) => (
              <FormControlLabel
                key={opt.id}
                control={
                  <Checkbox
                    checked={selected.includes(opt.id)}
                    disabled={disabled}
                    onChange={(e) => {
                      const next = e.target.checked
                        ? [...selected, opt.id]
                        : selected.filter((id) => id !== opt.id);
                      onChange(next);
                    }}
                  />
                }
                label={<PromptText text={opt.label || opt.id} />}
                sx={{
                  ...(showResult && Array.isArray(correctAnswer) && (correctAnswer as string[]).includes(opt.id) && {
                    "& .MuiFormControlLabel-label": { color: "success.main", fontWeight: 600 },
                  }),
                }}
              />
            ))}
          </FormGroup>
        );
      }

      // ── Drag & Drop ─────────────────────────────────────────────────────────
      case "drag_drop":
      case "drag": {
        const ddValue = (value as Record<string, string[]>) ?? {};
        const zones = question.zones || [];
        const items = normalizeOptions(question.items);
        return (
          <DragDropQuestion
            zones={zones}
            items={items}
            value={ddValue}
            onChange={onChange as (v: Record<string, string[]>) => void}
            disabled={disabled}
          />
        );
      }

      // ── Matching 1-к-1 (соединение пар) ────────────────────────────────────
      case "matching":
      case "match":
      case "pairs": {
        const matchValue = (value as Record<string, string>) ?? {};
        return (
          <MatchingQuestion
            leftItems={question.left_items || []}
            rightItems={question.right_items || []}
            value={matchValue}
            onChange={onChange as (v: Record<string, string>) => void}
            disabled={disabled}
          />
        );
      }

      // ── Matching многие-ко-многим ────────────────────────────────────────────
      case "matching_multi":
      case "match_multi":
      case "matching_multiple": {
        const multiValue = (value as Record<string, string[]>) ?? {};
        return (
          <MatchingMultiQuestion
            leftItems={question.left_items || []}
            rightItems={question.right_items || []}
            value={multiValue}
            onChange={onChange as (v: Record<string, string[]>) => void}
            disabled={disabled}
          />
        );
      }

      // ── Ordering (расстановка порядка) — с поддержкой картинок ─────────────
      case "ordering":
      case "order":
      case "sort": {
        const orderValue = (value as string[]) ?? [];
        return (
          <OrderingQuestion
            items={orderItems}
            value={orderValue}
            onChange={onChange as (v: string[]) => void}
            disabled={disabled}
          />
        );
      }

      // ── Rating / шкала ──────────────────────────────────────────────────────
      case "rating": {
        const min = question.rating_min ?? 1;
        const max = question.rating_max ?? 5;
        const isStars = max <= 5;
        const labels = question.rating_labels || [];
        return (
          <Box>
            {isStars ? (
              <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                <Rating
                  value={Number(value) || 0}
                  max={max}
                  onChange={(_, v) => onChange(v)}
                  disabled={disabled}
                  size="large"
                />
                {value ? (
                  <Typography variant="body2" color="text.secondary">
                    {value} / {max}
                  </Typography>
                ) : null}
              </Box>
            ) : (
              <Box sx={{ px: 2 }}>
                <Box sx={{ display: "flex", justifyContent: "space-between", mb: 1 }}>
                  <Typography variant="caption" color="text.secondary">
                    {labels[0] || question.rating_label_min || min}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {labels[labels.length - 1] || question.rating_label_max || max}
                  </Typography>
                </Box>
                <Slider
                  value={Number(value) || min}
                  min={min}
                  max={max}
                  step={1}
                  marks
                  valueLabelDisplay="auto"
                  onChange={(_, v) => onChange(v)}
                  disabled={disabled}
                />
              </Box>
            )}
          </Box>
        );
      }

      // ── Fill blank (заполнить пропуск) ──────────────────────────────────────
      case "fill_blank":
      case "fill":
      case "blank":
        return (
          <TextField
            variant="outlined"
            size="small"
            value={value ?? ""}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            placeholder="Заполните пропуск"
            sx={{ maxWidth: 300 }}
          />
        );

      // ── Table fill (заполнение таблицы текстом) ─────────────────────────────
      case "table_fill": {
        const tableValue = (value as Record<string, string>) ?? {};
        if (!question.table_rows || !question.table_headers) {
          return <Typography color="error">Ошибка: не заданы table_rows или table_headers</Typography>;
        }
        return (
          <TableQuestion
            qtype="table_fill"
            headers={question.table_headers}
            rows={question.table_rows}
            tableOptions={question.table_options}
            value={tableValue}
            onChange={onChange as (v: Record<string, string>) => void}
            disabled={disabled}
            cellResults={cellResults}
          />
        );
      }

      // ── Table select (выбор из списка для ячеек) ────────────────────────────
      case "table_select": {
        const tableValue = (value as Record<string, string>) ?? {};
        if (!question.table_rows || !question.table_headers) {
          return <Typography color="error">Ошибка: не заданы table_rows или table_headers</Typography>;
        }
        return (
          <TableQuestion
            qtype="table_select"
            headers={question.table_headers}
            rows={question.table_rows}
            tableOptions={question.table_options}
            value={tableValue}
            onChange={onChange as (v: Record<string, string>) => void}
            disabled={disabled}
            cellResults={cellResults}
          />
        );
      }

      // ── Дефолт ─────────────────────────────────────────────────────────────
      default:
        return (
          <TextField
            variant="outlined"
            size="small"
            value={value ?? ""}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            placeholder="Ответ"
          />
        );
    }
  };

  const promptText = question.prompt_latex || question.prompt || "";

  return (
    <Box>
      {/* Формулировка вопроса */}
      {promptText && (
        <Typography variant="body1" mb={1.5} fontWeight={500} lineHeight={1.6}>
          <PromptText text={promptText} />
        </Typography>
      )}

      {/* Изображение вопроса */}
      {question.image_url && (
        <Box mb={2}>
          <ImageWithLightbox
            src={question.image_url}
            alt="Иллюстрация к вопросу"
            style={{ maxWidth: "100%", maxHeight: 300, borderRadius: 8 }}
          />
        </Box>
      )}

      {/* Поле ввода */}
      {renderInput()}

      {/* Подсказка */}
      {question.hint && !showResult && (
        <Typography variant="caption" color="text.secondary" mt={1} display="block">
          💡 {question.hint}
        </Typography>
      )}

      {/* Результат (после сдачи) */}
      {showResult && (
        <Box
          mt={1.5}
          p={1.5}
          borderRadius={2}
          bgcolor={isCorrect ? "rgba(46,125,50,0.07)" : "rgba(211,47,47,0.07)"}
          border="1px solid"
          borderColor={isCorrect ? "success.light" : "error.light"}
        >
          {isCorrect ? (
            <Typography variant="body2" color="success.main" fontWeight={600}>
              ✓ Верно!
            </Typography>
          ) : (
            <>
              <Typography variant="body2" color="error.main" fontWeight={600}>
                ✗ Неверно
              </Typography>
              {correctAnswer !== undefined && correctAnswer !== null && (
                <Typography variant="body2" color="text.secondary" mt={0.5}>
                  Правильный ответ:{" "}
                  <strong>
                    {Array.isArray(correctAnswer)
                      ? (correctAnswer as unknown[]).join(", ")
                      : typeof correctAnswer === "object"
                      ? JSON.stringify(correctAnswer)
                      : String(correctAnswer)}
                  </strong>
                </Typography>
              )}
              {question.hint && (
                <Typography variant="body2" color="text.secondary" mt={0.5}>
                  💡 {question.hint}
                </Typography>
              )}
            </>
          )}
        </Box>
      )}
    </Box>
  );
}
