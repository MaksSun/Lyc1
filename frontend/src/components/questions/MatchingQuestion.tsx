import React, { useState } from "react";
import { Box, Paper, Typography, Chip } from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import LinkIcon from "@mui/icons-material/Link";
import ImageWithLightbox from "../ImageWithLightbox";

export interface MatchItem {
  id: string;
  label?: string;
  image_url?: string;
}

interface MatchingQuestionProps {
  leftItems: MatchItem[];
  rightItems: MatchItem[];
  value: Record<string, string>; // { leftId: rightId }
  onChange: (value: Record<string, string>) => void;
  disabled?: boolean;
}

/** Рендерит элемент: картинку или текст */
function ItemContent({ item }: { item: MatchItem }) {
  if (item.image_url) {
    return (
      <Box sx={{ textAlign: "center" }}>
        <ImageWithLightbox
          src={item.image_url}
          alt={item.label || item.id}
          style={{ maxWidth: 100, maxHeight: 80, borderRadius: 6, objectFit: "contain" }}
        />
        {item.label && (
          <Typography variant="caption" display="block" mt={0.5} color="text.secondary">
            {item.label}
          </Typography>
        )}
      </Box>
    );
  }
  return <Typography variant="body2">{item.label || item.id}</Typography>;
}

export default function MatchingQuestion({
  leftItems,
  rightItems,
  value,
  onChange,
  disabled,
}: MatchingQuestionProps) {
  const [selectedLeft, setSelectedLeft] = useState<string | null>(null);

  const handleLeftClick = (id: string) => {
    if (disabled) return;
    setSelectedLeft(selectedLeft === id ? null : id);
  };

  const handleRightClick = (rightId: string) => {
    if (disabled || !selectedLeft) return;

    const newValue = { ...value };

    // Убираем старую связь для этого левого элемента
    delete newValue[selectedLeft];

    // Убираем старую связь для этого правого элемента (если он уже был связан)
    for (const [lId, rId] of Object.entries(newValue)) {
      if (rId === rightId) {
        delete newValue[lId];
      }
    }

    // Создаём новую связь
    newValue[selectedLeft] = rightId;
    onChange(newValue);
    setSelectedLeft(null);
  };

  const handleRemovePair = (leftId: string) => {
    if (disabled) return;
    const newValue = { ...value };
    delete newValue[leftId];
    onChange(newValue);
  };

  const usedRightIds = new Set(Object.values(value));
  const hasImages = leftItems.some(i => i.image_url) || rightItems.some(i => i.image_url);

  return (
    <Box>
      <Typography variant="caption" color="text.secondary" mb={1} display="block">
        {disabled
          ? "Результаты сопоставления"
          : selectedLeft
          ? "Теперь выберите элемент справа"
          : "Выберите элемент слева, затем соответствующий элемент справа"}
      </Typography>

      <Box sx={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 2, alignItems: "start" }}>
        {/* Левая колонка */}
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
          <Typography variant="caption" fontWeight={700} color="text.secondary" textAlign="center">
            Понятия
          </Typography>
          {leftItems.map((item) => {
            const isSelected = selectedLeft === item.id;
            const isPaired = !!value[item.id];
            return (
              <Paper
                key={item.id}
                elevation={isSelected ? 4 : 1}
                onClick={() => handleLeftClick(item.id)}
                sx={{
                  p: 1.5,
                  cursor: disabled ? "default" : "pointer",
                  border: "2px solid",
                  borderColor: isSelected
                    ? "primary.main"
                    : isPaired
                    ? "success.main"
                    : "divider",
                  borderRadius: 2,
                  bgcolor: isSelected
                    ? "primary.50"
                    : isPaired
                    ? "success.50"
                    : "background.paper",
                  transition: "all 0.2s",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 1,
                  minHeight: hasImages ? 100 : undefined,
                }}
              >
                <ItemContent item={item} />
                {isPaired && !disabled && (
                  <CheckCircleIcon fontSize="small" color="success" sx={{ flexShrink: 0 }} />
                )}
              </Paper>
            );
          })}
        </Box>

        {/* Стрелки связей */}
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1, pt: 4 }}>
          {leftItems.map((item) => (
            <Box
              key={item.id}
              sx={{
                height: hasImages ? 100 : 52,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {value[item.id] ? (
                <LinkIcon
                  color="success"
                  sx={{ cursor: disabled ? "default" : "pointer" }}
                  onClick={() => handleRemovePair(item.id)}
                  titleAccess="Убрать связь"
                />
              ) : (
                <Box sx={{ width: 24, height: 2, bgcolor: "divider" }} />
              )}
            </Box>
          ))}
        </Box>

        {/* Правая колонка */}
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
          <Typography variant="caption" fontWeight={700} color="text.secondary" textAlign="center">
            Определения
          </Typography>
          {rightItems.map((item) => {
            const isUsed = usedRightIds.has(item.id);
            const isTarget = selectedLeft !== null && !disabled;
            return (
              <Paper
                key={item.id}
                elevation={isTarget ? 2 : 1}
                onClick={() => handleRightClick(item.id)}
                sx={{
                  p: 1.5,
                  cursor: disabled ? "default" : isTarget ? "pointer" : "default",
                  border: "2px solid",
                  borderColor: isUsed ? "success.main" : isTarget ? "primary.light" : "divider",
                  borderRadius: 2,
                  bgcolor: isUsed
                    ? "success.50"
                    : isTarget
                    ? "primary.50"
                    : "background.paper",
                  transition: "all 0.2s",
                  minHeight: hasImages ? 100 : undefined,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  "&:hover": isTarget && !disabled ? { borderColor: "primary.main" } : {},
                }}
              >
                <ItemContent item={item} />
              </Paper>
            );
          })}
        </Box>
      </Box>

      {/* Сводка связей */}
      {Object.keys(value).length > 0 && (
        <Box sx={{ mt: 2, p: 1.5, bgcolor: "grey.50", borderRadius: 2 }}>
          <Typography variant="caption" color="text.secondary" fontWeight={600}>
            Установленные связи:
          </Typography>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mt: 0.5 }}>
            {Object.entries(value).map(([leftId, rightId]) => {
              const left = leftItems.find((i) => i.id === leftId);
              const right = rightItems.find((i) => i.id === rightId);
              const leftLabel = left?.label || leftId;
              const rightLabel = right?.label || rightId;
              return left && right ? (
                <Chip
                  key={leftId}
                  size="small"
                  label={`${leftLabel} → ${rightLabel}`}
                  color="success"
                  variant="outlined"
                  onDelete={disabled ? undefined : () => handleRemovePair(leftId)}
                />
              ) : null;
            })}
          </Box>
        </Box>
      )}
    </Box>
  );
}
