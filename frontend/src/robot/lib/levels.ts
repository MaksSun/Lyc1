// ============================================================
// BUILT-IN LEVELS — Robot Executor (v22 integration)
// ============================================================

import { LevelDefinition, wallKey, posKey } from "./gameTypes";

export const BUILT_IN_LEVELS: LevelDefinition[] = [
  {
    id: "intro",
    name: "Введение",
    description: "Дойди до закрашенной клетки справа",
    rows: 7,
    cols: 9,
    robotStart: { row: 3, col: 0 },
    walls: { horizontal: [], vertical: [] },
    targets: [posKey({ row: 3, col: 8 })],
    initialCode: "использовать Робот\nнц пока справа свободно\n  вправо\nкц\nзакрасить",
  },
  {
    id: "snake",
    name: "Змейка",
    description: "Закрась всю нижнюю строку поля",
    rows: 5,
    cols: 8,
    robotStart: { row: 4, col: 0 },
    walls: { horizontal: [], vertical: [] },
    targets: Array.from({ length: 8 }, (_, i) => posKey({ row: 4, col: i })),
    initialCode: "использовать Робот\nзакрасить\nнц пока справа свободно\n  вправо\n  закрасить\nкц",
  },
  {
    id: "wall_right",
    name: "Стена справа",
    description: "Иди вправо пока не упрёшься в стену",
    rows: 5,
    cols: 10,
    robotStart: { row: 2, col: 0 },
    walls: {
      horizontal: [],
      vertical: [wallKey("v", 2, 5), wallKey("v", 2, 6)],
    },
    targets: [posKey({ row: 2, col: 5 })],
    initialCode: "использовать Робот\nнц пока справа свободно\n  вправо\nкц\nзакрасить",
  },
  {
    id: "corridor",
    name: "Коридор",
    description: "Пройди через коридор и закрась конечную клетку",
    rows: 7,
    cols: 9,
    robotStart: { row: 3, col: 0 },
    walls: {
      horizontal: [
        wallKey("h", 1, 2), wallKey("h", 1, 3), wallKey("h", 1, 4),
        wallKey("h", 1, 5), wallKey("h", 1, 6),
        wallKey("h", 4, 2), wallKey("h", 4, 3), wallKey("h", 4, 4),
        wallKey("h", 4, 5), wallKey("h", 4, 6),
      ],
      vertical: [
        wallKey("v", 2, 1), wallKey("v", 3, 1), wallKey("v", 4, 1),
        wallKey("v", 2, 7), wallKey("v", 3, 7), wallKey("v", 4, 7),
      ],
    },
    targets: [posKey({ row: 3, col: 8 })],
    initialCode: "использовать Робот\nнц пока справа свободно\n  вправо\nкц\nзакрасить",
  },
  {
    id: "zigzag",
    name: "Зигзаг",
    description: "Закрась клетки по диагонали через условия",
    rows: 6,
    cols: 6,
    robotStart: { row: 0, col: 0 },
    walls: { horizontal: [], vertical: [] },
    targets: [
      posKey({ row: 0, col: 0 }),
      posKey({ row: 1, col: 1 }),
      posKey({ row: 2, col: 2 }),
      posKey({ row: 3, col: 3 }),
      posKey({ row: 4, col: 4 }),
      posKey({ row: 5, col: 5 }),
    ],
    initialCode: "использовать Робот\nзакрасить\nнц пока снизу свободно\n  вниз\n  если справа свободно то\n    вправо\n  все\n  закрасить\nкц",
  },
  {
    id: "maze",
    name: "Лабиринт",
    description: "Найди выход из лабиринта",
    rows: 7,
    cols: 9,
    robotStart: { row: 0, col: 0 },
    walls: {
      horizontal: [
        wallKey("h", 0, 1), wallKey("h", 0, 2), wallKey("h", 0, 3),
        wallKey("h", 1, 4), wallKey("h", 1, 5), wallKey("h", 1, 6),
        wallKey("h", 2, 0), wallKey("h", 2, 1), wallKey("h", 2, 2),
        wallKey("h", 3, 3), wallKey("h", 3, 4), wallKey("h", 3, 7),
        wallKey("h", 4, 5), wallKey("h", 4, 6), wallKey("h", 4, 7),
        wallKey("h", 5, 0), wallKey("h", 5, 1), wallKey("h", 5, 2),
      ],
      vertical: [
        wallKey("v", 1, 0), wallKey("v", 2, 3), wallKey("v", 3, 1),
        wallKey("v", 4, 4), wallKey("v", 5, 6), wallKey("v", 6, 2),
      ],
    },
    targets: [posKey({ row: 6, col: 8 })],
    initialCode: "использовать Робот\n// Лабиринт — попробуй разные стратегии!\n// Подсказка: правило правой руки\nнц пока не (снизу свободно)\n  если справа свободно то\n    вправо\n  иначе\n    вверх\n  все\nкц\nвниз",
  },
  {
    id: "free",
    name: "Свободное поле",
    description: "Пустое поле 100×100 для экспериментов",
    rows: 100,
    cols: 100,
    robotStart: { row: 50, col: 0 },
    walls: { horizontal: [], vertical: [] },
    targets: [],
    initialCode: "использовать Робот\n// Свободное поле — пиши что хочешь!\n// Команды: вверх, вниз, влево, вправо, закрасить\n// Цикл: нц пока <условие> ... кц\n// Условие: слева/справа/сверху/снизу свободно\nвправо\nвправо\nзакрасить",
  },
];
