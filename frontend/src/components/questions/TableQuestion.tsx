import React from "react";
import {
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Select,
  MenuItem,
  Paper,
  Typography,
  FormControl,
} from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CancelIcon from "@mui/icons-material/Cancel";

export interface TableRowDef {
  id: string;
  label: string;
  cells: TableCellDef[];
}

export interface TableCellDef {
  id: string;
  editable?: boolean;
  placeholder?: string;
  /** Для table_select: список вариантов для этой ячейки (переопределяет глобальный) */
  options?: string[];
}

interface TableQuestionProps {
  qtype: "table_fill" | "table_select";
  headers: string[];
  rows: TableRowDef[];
  /** Глобальные варианты для table_select */
  tableOptions?: string[];
  /** value: { "row_id:col_id": "answer" } */
  value: Record<string, string>;
  onChange: (value: Record<string, string>) => void;
  disabled?: boolean;
  /** Результаты проверки: { "row_id:col_id": { ok, correct } } */
  cellResults?: Record<string, { ok: boolean; correct: string }>;
}

export default function TableQuestion({
  qtype,
  headers,
  rows,
  tableOptions = [],
  value,
  onChange,
  disabled,
  cellResults,
}: TableQuestionProps) {
  const handleChange = (rowId: string, cellId: string, val: string) => {
    const key = `${rowId}:${cellId}`;
    const newVal = { ...value, [key]: val };
    (window as Record<string, unknown>).__tableAnswer = newVal;
    onChange(newVal);
  };

  return (
    <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
      <Table size="small">
        <TableHead>
          <TableRow sx={{ bgcolor: "grey.100" }}>
            {/* Первый столбец — метка строки */}
            <TableCell sx={{ fontWeight: 700, minWidth: 120 }}></TableCell>
            {headers.map((h, i) => (
              <TableCell key={i} sx={{ fontWeight: 700, textAlign: "center" }}>
                {h}
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id} hover>
              {/* Метка строки */}
              <TableCell sx={{ fontWeight: 600, bgcolor: "grey.50" }}>
                {row.label}
              </TableCell>
              {row.cells.map((cell) => {
                const key = `${row.id}:${cell.id}`;
                const cellVal = value[key] ?? "";
                const result = cellResults?.[key];
                const isEditable = cell.editable !== false; // по умолчанию редактируемая

                // Варианты для select: сначала ячеечные, потом глобальные
                const options = cell.options || tableOptions;

                return (
                  <TableCell key={cell.id} sx={{ textAlign: "center", p: 1 }}>
                    {!isEditable ? (
                      // Нередактируемая ячейка — просто текст
                      <Typography variant="body2" color="text.secondary">
                        {cellVal || "—"}
                      </Typography>
                    ) : qtype === "table_select" ? (
                      // Выпадающий список
                      <FormControl size="small" fullWidth>
                        <Select
                          value={cellVal}
                          onChange={(e) => handleChange(row.id, cell.id, e.target.value)}
                          disabled={disabled}
                          displayEmpty
                          sx={{
                            minWidth: 120,
                            "& .MuiOutlinedInput-notchedOutline": {
                              borderColor: result
                                ? result.ok
                                  ? "success.main"
                                  : "error.main"
                                : undefined,
                            },
                          }}
                        >
                          <MenuItem value="" disabled>
                            <Typography variant="body2" color="text.disabled">
                              Выберите...
                            </Typography>
                          </MenuItem>
                          {options.map((opt) => (
                            <MenuItem key={opt} value={opt}>
                              {opt}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    ) : (
                      // Текстовый ввод
                      <TextField
                        size="small"
                        value={cellVal}
                        onChange={(e) => handleChange(row.id, cell.id, e.target.value)}
                        disabled={disabled}
                        placeholder={cell.placeholder || ""}
                        sx={{
                          minWidth: 100,
                          "& .MuiOutlinedInput-notchedOutline": {
                            borderColor: result
                              ? result.ok
                                ? "success.main"
                                : "error.main"
                              : undefined,
                          },
                        }}
                      />
                    )}
                    {/* Иконка результата */}
                    {result && (
                      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 0.5, mt: 0.5 }}>
                        {result.ok ? (
                          <CheckCircleIcon fontSize="small" color="success" />
                        ) : (
                          <>
                            <CancelIcon fontSize="small" color="error" />
                            <Typography variant="caption" color="error.main">
                              → {result.correct}
                            </Typography>
                          </>
                        )}
                      </Box>
                    )}
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
