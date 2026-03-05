import React, { useState, useEffect, useCallback } from "react";
import { Box, IconButton, Modal, Fade } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import ZoomInIcon from "@mui/icons-material/ZoomIn";

interface ImageWithLightboxProps {
  src: string;
  alt?: string;
  style?: React.CSSProperties;
  className?: string;
}

/**
 * Обёртка над <img>, которая при клике открывает лайтбокс (полноэкранный просмотр).
 * Закрывается по клику вне картинки, по кнопке ✕ или по клавише Escape.
 */
export default function ImageWithLightbox({ src, alt, style, className }: ImageWithLightboxProps) {
  const [open, setOpen] = useState(false);

  const handleOpen = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setOpen(true);
  }, []);

  const handleClose = useCallback(() => setOpen(false), []);

  // Закрытие по Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      {/* Превью — кликабельное */}
      <Box
        sx={{ position: "relative", display: "inline-block", cursor: "zoom-in" }}
        onClick={handleOpen}
        className={className}
      >
        <img src={src} alt={alt ?? ""} style={style} />
        {/* Иконка-подсказка при наведении */}
        <Box
          sx={{
            position: "absolute",
            bottom: 4,
            right: 4,
            bgcolor: "rgba(0,0,0,0.45)",
            borderRadius: "50%",
            width: 24,
            height: 24,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            opacity: 0,
            transition: "opacity 0.2s",
            ".MuiBox-root:hover > &": { opacity: 1 },
            pointerEvents: "none",
          }}
        >
          <ZoomInIcon sx={{ fontSize: 16, color: "#fff" }} />
        </Box>
      </Box>

      {/* Лайтбокс */}
      <Modal
        open={open}
        onClose={handleClose}
        closeAfterTransition
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          p: 2,
        }}
        slotProps={{ backdrop: { onClick: handleClose } }}
      >
        <Fade in={open}>
          <Box
            sx={{
              position: "relative",
              outline: "none",
              // Занимает максимум 95% экрана с отступами
              width: "min(95vw, 95vh * 2)",
              maxWidth: "95vw",
              maxHeight: "95vh",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Кнопка закрытия */}
            <IconButton
              onClick={handleClose}
              size="medium"
              sx={{
                position: "absolute",
                top: -20,
                right: -20,
                bgcolor: "rgba(0,0,0,0.65)",
                color: "#fff",
                zIndex: 1,
                "&:hover": { bgcolor: "rgba(0,0,0,0.9)" },
              }}
            >
              <CloseIcon />
            </IconButton>

            {/* Полноразмерная картинка — растягивается на весь доступный блок */}
            <img
              src={src}
              alt={alt ?? ""}
              style={{
                width: "100%",
                height: "100%",
                maxWidth: "95vw",
                maxHeight: "95vh",
                objectFit: "contain",   // сохраняет пропорции, не обрезает
                borderRadius: 8,
                boxShadow: "0 8px 40px rgba(0,0,0,0.7)",
                display: "block",
              }}
            />
          </Box>
        </Fade>
      </Modal>
    </>
  );
}