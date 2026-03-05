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

interface MatchingMultiQuestionProps {
  leftItems: MatchItem[];
  rightItems: MatchItem[];
  /** value: { leftId: rightId[] } — один левый может иметь несколько правых */
  value: Record<string, string[]>;
  onChange: (value: Record<string, string[]>) => void;
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

export default function MatchingMultiQuestion({
  leftItems,
  rightItems,
  value,
  onChange,
  disabled,
}: MatchingMultiQuestionProps) {
  const [selectedLeft, setSelectedLeft] = useState<string | null>(null);

  /** Клик по левому элементу — выбираем его */
  const handleLeftClick = (id: string) => {
    if (disabled) return;
    setSelectedLeft(prev => (prev === id ? null : id));
  };

  /** Клик по правому элементу — добавляем/убираем связь */
  const handleRightClick = (rightId: string) => {
    if (disabled || selectedLeft === null) return;
    const current = value[selectedLeft] || [];
    let updated: string[];
    if (current.includes(rightId)) {
      // убираем связь
      updated = current.filter(r => r !== rightId);
    } else {
      // добавляем связь
      updated = [...current, rightId];
    }
    const newValue = { ...value };
    if (updated.length === 0) {
      delete newValue[selectedLeft];
    } else {
      newValue[selectedLeft] = updated;
    }
    onChange(newValue);
  };

  /** Убрать конкретную связь из сводки */
  const handleRemovePair = (leftId: string, rightId: string) => {
    if (disabled) return;
    const current = value[leftId] || [];
    const updated = current.filter(r => r !== rightId);
    const newValue = { ...value };
    if (updated.length === 0) {
      delete newValue[leftId];
    } else {
      newValue[leftId] = updated;
    }
    onChange(newValue);
  };

  const totalPairs = Object.values(value).reduce((s, arr) => s + arr.length, 0);

  return (
    <Box>
      {!disabled && (
        <Typography variant="caption" color="text.secondary" mb={1.5} display="block">
          Выберите элемент слева, затем отметьте один или несколько элементов справа.
          Один левый элемент может соответствовать нескольким правым.
        </Typography>
      )}

      <Box sx={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 2, alignItems: "start" }}>
        {/* Левая колонка */}
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
          <Typography variant="caption" fontWeight={700} color="text.secondary" textAlign="center">
            Понятия
          </Typography>
          {leftItems.map((item) => {
            const isSelected = selectedLeft === item.id;
            const hasPairs = (value[item.id] || []).length > 0;
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
                    : hasPairs
                    ? "success.main"
                    : "divider",
                  borderRadius: 2,
                  bgcolor: isSelected
                    ? "primary.50"
                    : hasPairs
                    ? "success.50"
                    : "background.paper",
                  transition: "all 0.2s",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 1,
                }}
              >
                <ItemContent item={item} />
                {hasPairs && !disabled && (
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, flexShrink: 0 }}>
                    <CheckCircleIcon fontSize="small" color="success" />
                    <Typography variant="caption" color="success.main" fontWeight={700}>
                      {(value[item.id] || []).length}
                    </Typography>
                  </Box>
                )}
              </Paper>
            );
          })}
        </Box>

        {/* Центральный разделитель */}
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1, pt: 4 }}>
          {leftItems.map((item) => (
            <Box
              key={item.id}
              sx={{ height: item.image_url ? 100 : 52, display: "flex", alignItems: "center", justifyContent: "center" }}
            >
              {(value[item.id] || []).length > 0 ? (
                <LinkIcon color="success" />
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
            // Проверяем, выбран ли этот правый элемент для текущего левого
            const isLinkedToCurrent = selectedLeft !== null && (value[selectedLeft] || []).includes(item.id);
            // Проверяем, использован ли вообще
            const isUsedAny = Object.values(value).some(arr => arr.includes(item.id));
            const isTarget = selectedLeft !== null && !disabled;
            return (
              <Paper
                key={item.id}
                elevation={isLinkedToCurrent ? 4 : 1}
                onClick={() => handleRightClick(item.id)}
                sx={{
                  p: 1.5,
                  cursor: disabled ? "default" : isTarget ? "pointer" : "default",
                  border: "2px solid",
                  borderColor: isLinkedToCurrent
                    ? "primary.main"
                    : isUsedAny
                    ? "success.light"
                    : isTarget
                    ? "primary.light"
                    : "divider",
                  borderRadius: 2,
                  bgcolor: isLinkedToCurrent
                    ? "primary.50"
                    : isUsedAny
                    ? "success.50"
                    : isTarget
                    ? "grey.50"
                    : "background.paper",
                  transition: "all 0.2s",
                }}
              >
                <ItemContent item={item} />
              </Paper>
            );
          })}
        </Box>
      </Box>

      {/* Сводка связей */}
      {totalPairs > 0 && (
        <Box sx={{ mt: 2, p: 1.5, bgcolor: "grey.50", borderRadius: 2 }}>
          <Typography variant="caption" color="text.secondary" fontWeight={600}>
            Установленные связи:
          </Typography>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mt: 0.5 }}>
            {Object.entries(value).flatMap(([leftId, rightIds]) => {
              const left = leftItems.find(i => i.id === leftId);
              return rightIds.map(rightId => {
                const right = rightItems.find(i => i.id === rightId);
                if (!left || !right) return null;
                const leftLabel = left.label || left.id;
                const rightLabel = right.label || right.id;
                return (
                  <Chip
                    key={`${leftId}-${rightId}`}
                    size="small"
                    label={`${leftLabel} → ${rightLabel}`}
                    color="success"
                    variant="outlined"
                    onDelete={disabled ? undefined : () => handleRemovePair(leftId, rightId)}
                  />
                );
              });
            })}
          </Box>
        </Box>
      )}
    </Box>
  );
}
