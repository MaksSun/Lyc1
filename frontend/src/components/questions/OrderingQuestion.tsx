import React from "react";
import { Box, Paper, Typography, IconButton } from "@mui/material";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import ImageWithLightbox from "../ImageWithLightbox";

export interface OrderItem {
  id: string;
  label: string;
  image_url?: string;
}

interface OrderingQuestionProps {
  items: OrderItem[];
  value: string[]; // ordered list of item ids
  onChange: (value: string[]) => void;
  disabled?: boolean;
}

/** Рендерит содержимое элемента: картинку или текст */
function ItemContent({ item }: { item: OrderItem }) {
  if (item.image_url) {
    return (
      <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1 }}>
        <ImageWithLightbox
          src={item.image_url}
          alt={item.label || item.id}
          style={{ maxWidth: 120, maxHeight: 90, borderRadius: 6, objectFit: "contain" }}
        />
        {item.label && (
          <Typography variant="caption" mt={0.5} color="text.secondary" textAlign="center">
            {item.label}
          </Typography>
        )}
      </Box>
    );
  }
  return (
    <Typography variant="body2" sx={{ flex: 1 }}>
      {item.label}
    </Typography>
  );
}

function SortableItem({
  item,
  index,
  total,
  onMoveUp,
  onMoveDown,
  disabled,
}: {
  item: OrderItem;
  index: number;
  total: number;
  onMoveUp: () => void;
  onMoveDown: () => void;
  disabled?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled,
  });

  return (
    <Paper
      ref={setNodeRef}
      elevation={isDragging ? 6 : 1}
      sx={{
        p: 1.5,
        display: "flex",
        alignItems: "center",
        gap: 1,
        border: "1px solid",
        borderColor: isDragging ? "primary.main" : "divider",
        borderRadius: 2,
        bgcolor: isDragging ? "primary.50" : "background.paper",
        transform: CSS.Transform.toString(transform),
        transition,
        cursor: disabled ? "default" : "auto",
        opacity: isDragging ? 0.8 : 1,
      }}
    >
      {/* Номер позиции */}
      <Box
        sx={{
          width: 28,
          height: 28,
          borderRadius: "50%",
          bgcolor: "primary.main",
          color: "white",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 13,
          fontWeight: 700,
          flexShrink: 0,
        }}
      >
        {index + 1}
      </Box>

      {/* Иконка перетаскивания */}
      {!disabled && (
        <Box {...listeners} {...attributes} sx={{ cursor: "grab", color: "text.disabled", flexShrink: 0 }}>
          <DragIndicatorIcon fontSize="small" />
        </Box>
      )}

      {/* Содержимое: картинка или текст */}
      <ItemContent item={item} />

      {/* Кнопки вверх/вниз */}
      {!disabled && (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0 }}>
          <IconButton size="small" onClick={onMoveUp} disabled={index === 0}>
            <ArrowUpwardIcon fontSize="small" />
          </IconButton>
          <IconButton size="small" onClick={onMoveDown} disabled={index === total - 1}>
            <ArrowDownwardIcon fontSize="small" />
          </IconButton>
        </Box>
      )}
    </Paper>
  );
}

export default function OrderingQuestion({
  items,
  value,
  onChange,
  disabled,
}: OrderingQuestionProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  // Если value пустой — инициализируем порядком items
  const orderedIds = value.length === items.length ? value : items.map((i) => i.id);
  const orderedItems = orderedIds
    .map((id) => items.find((i) => i.id === id))
    .filter(Boolean) as OrderItem[];

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = orderedIds.indexOf(String(active.id));
    const newIndex = orderedIds.indexOf(String(over.id));
    onChange(arrayMove(orderedIds, oldIndex, newIndex));
  };

  const moveUp = (index: number) => {
    if (index === 0) return;
    onChange(arrayMove(orderedIds, index, index - 1));
  };

  const moveDown = (index: number) => {
    if (index === orderedItems.length - 1) return;
    onChange(arrayMove(orderedIds, index, index + 1));
  };

  return (
    <Box>
      {!disabled && (
        <Typography variant="caption" color="text.secondary" mb={1} display="block">
          Перетащите элементы или используйте стрелки для установки правильного порядка
        </Typography>
      )}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={orderedIds} strategy={verticalListSortingStrategy}>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {orderedItems.map((item, index) => (
              <SortableItem
                key={item.id}
                item={item}
                index={index}
                total={orderedItems.length}
                onMoveUp={() => moveUp(index)}
                onMoveDown={() => moveDown(index)}
                disabled={disabled}
              />
            ))}
          </Box>
        </SortableContext>
      </DndContext>
    </Box>
  );
}
