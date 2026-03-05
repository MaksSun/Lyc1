import React, { useState } from "react";
import { Box, Paper, Typography, Chip } from "@mui/material";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
} from "@dnd-kit/core";

interface Zone {
  id: string;
  label: string;
}

interface Item {
  id: string;
  label: string;
}

interface DragDropQuestionProps {
  zones: Zone[];
  items: Item[];
  value: Record<string, string[]>;
  onChange: (value: Record<string, string[]>) => void;
  disabled?: boolean;
}

function DroppableZone({
  zone,
  items,
  placedItems,
  disabled,
}: {
  zone: Zone;
  items: Item[];
  placedItems: string[];
  disabled?: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: zone.id, disabled });

  return (
    <Paper
      ref={setNodeRef}
      elevation={isOver ? 4 : 1}
      sx={{
        p: 2,
        minHeight: 100,
        border: "2px dashed",
        borderColor: isOver ? "primary.main" : "divider",
        borderRadius: 2,
        bgcolor: isOver ? "primary.50" : "background.paper",
        transition: "all 0.2s",
      }}
    >
      <Typography variant="caption" color="text.secondary" fontWeight={600} display="block" mb={1}>
        {zone.label}
      </Typography>
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, minHeight: 40 }}>
        {placedItems.map((itemId) => {
          const item = items.find((i) => i.id === itemId);
          return item ? (
            <DraggableItem key={itemId} item={item} disabled={disabled} />
          ) : null;
        })}
      </Box>
    </Paper>
  );
}

function DraggableItem({ item, disabled }: { item: Item; disabled?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: item.id,
    disabled,
  });

  return (
    <Chip
      ref={setNodeRef}
      label={item.label}
      {...listeners}
      {...attributes}
      sx={{
        cursor: disabled ? "default" : "grab",
        opacity: isDragging ? 0.5 : 1,
        transform: transform
          ? `translate(${transform.x}px, ${transform.y}px)`
          : undefined,
        bgcolor: "primary.main",
        color: "white",
        fontWeight: 500,
        "&:hover": disabled ? {} : { bgcolor: "primary.dark" },
      }}
    />
  );
}

export default function DragDropQuestion({
  zones,
  items,
  value,
  onChange,
  disabled,
}: DragDropQuestionProps) {
  const [activeItem, setActiveItem] = useState<Item | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  // Все элементы, которые уже размещены
  const placedItemIds = Object.values(value).flat();
  // Элементы в "банке" (не размещены)
  const bankItems = items.filter((i) => !placedItemIds.includes(i.id));

  const { setNodeRef: setBankRef, isOver: isBankOver } = useDroppable({ id: "__bank__", disabled });

  const handleDragStart = (event: DragStartEvent) => {
    const item = items.find((i) => i.id === event.active.id);
    setActiveItem(item || null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveItem(null);
    const { active, over } = event;
    if (!over) return;

    const itemId = String(active.id);
    const targetId = String(over.id);

    // Убираем элемент из всех зон
    const newValue: Record<string, string[]> = {};
    for (const zone of zones) {
      newValue[zone.id] = (value[zone.id] || []).filter((id) => id !== itemId);
    }

    // Добавляем в новую зону (если не банк)
    if (targetId !== "__bank__") {
      newValue[targetId] = [...(newValue[targetId] || []), itemId];
    }

    onChange(newValue);
  };

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      {/* Банк элементов */}
      <Paper
        ref={setBankRef}
        elevation={0}
        sx={{
          p: 2,
          mb: 2,
          border: "2px dashed",
          borderColor: isBankOver ? "secondary.main" : "divider",
          borderRadius: 2,
          bgcolor: "grey.50",
          minHeight: 60,
        }}
      >
        <Typography variant="caption" color="text.secondary" fontWeight={600} display="block" mb={1}>
          Доступные элементы
        </Typography>
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
          {bankItems.map((item) => (
            <DraggableItem key={item.id} item={item} disabled={disabled} />
          ))}
          {bankItems.length === 0 && (
            <Typography variant="caption" color="text.disabled">
              Все элементы распределены
            </Typography>
          )}
        </Box>
      </Paper>

      {/* Зоны */}
      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 2 }}>
        {zones.map((zone) => (
          <DroppableZone
            key={zone.id}
            zone={zone}
            items={items}
            placedItems={value[zone.id] || []}
            disabled={disabled}
          />
        ))}
      </Box>

      <DragOverlay>
        {activeItem ? (
          <Chip
            label={activeItem.label}
            sx={{ bgcolor: "primary.main", color: "white", boxShadow: 4, cursor: "grabbing" }}
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
