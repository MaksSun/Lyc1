import { useState, useEffect, useRef, useCallback } from "react";
import {
  Box, Card, CardContent, Typography, TextField, Button,
  Alert, CircularProgress, InputAdornment, Divider,
  IconButton, Tooltip, Dialog, DialogTitle, DialogContent,
  DialogActions,
} from "@mui/material";
import LockIcon from "@mui/icons-material/Lock";
import SchoolIcon from "@mui/icons-material/School";
import QrCodeScannerIcon from "@mui/icons-material/QrCodeScanner";
import PhotoLibraryIcon from "@mui/icons-material/PhotoLibrary";
import CloseIcon from "@mui/icons-material/Close";
import { studentLogin } from "../api";
import { setStudentToken } from "../auth";
import { useNavigate, useSearchParams } from "react-router-dom";

// Extract a 7-char alphanumeric code from any QR text
// Handles: raw code "ABC1234", URL ".../login?code=ABC1234", etc.
function extractCode(text: string): string | null {
  // Try URL param first
  try {
    const url = new URL(text);
    const c = url.searchParams.get("code");
    if (c && /^[A-Z0-9]{7}$/i.test(c)) return c.toUpperCase();
  } catch {
    // not a URL
  }
  // Try raw 7-char code
  const raw = text.trim().toUpperCase();
  if (/^[A-Z0-9]{7}$/.test(raw)) return raw;
  // Try to find 7-char code anywhere in the string
  const match = raw.match(/[A-Z0-9]{7}/);
  if (match) return match[0];
  return null;
}

export default function StudentLogin() {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Camera scanner state
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [scannerReady, setScannerReady] = useState(false);
  const scannerRef = useRef<unknown>(null);
  const scannerDivId = "qr-camera-reader";

  // File input ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-login from QR code URL parameter: /login?code=XXXXXXX
  useEffect(() => {
    const qrCode = searchParams.get("code");
    if (qrCode && qrCode.length === 7) {
      const upperCode = qrCode.toUpperCase();
      setCode(upperCode);
      setLoading(true);
      studentLogin(upperCode)
        .then((data) => {
          setStudentToken(data.access_token);
          navigate("/");
        })
        .catch((e: unknown) => {
          const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
          setError(msg || "Неверный код. Проверьте и попробуйте снова.");
          setLoading(false);
        });
    }
  }, []);

  const handleSubmit = async (codeToUse?: string) => {
    const finalCode = (codeToUse || code).toUpperCase();
    if (finalCode.length !== 7) return;
    setLoading(true);
    setError("");
    try {
      const data = await studentLogin(finalCode);
      setStudentToken(data.access_token);
      navigate("/");
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(msg || "Неверный код. Проверьте и попробуйте снова.");
    } finally {
      setLoading(false);
    }
  };

  // ─── Camera QR scanner ───────────────────────────────────────────────────
  const startCamera = useCallback(async () => {
    setCameraError("");
    setScannerReady(false);
    setCameraOpen(true);
  }, []);

  useEffect(() => {
    if (!cameraOpen) return;

    let html5QrCode: unknown = null;

    const init = async () => {
      try {
        // Dynamically import to avoid SSR issues
        const { Html5Qrcode } = await import("html5-qrcode");

        // Wait a tick for the DOM element to mount
        await new Promise((r) => setTimeout(r, 200));

        const el = document.getElementById(scannerDivId);
        if (!el) {
          setCameraError("Не удалось найти элемент камеры.");
          return;
        }

        html5QrCode = new Html5Qrcode(scannerDivId);
        scannerRef.current = html5QrCode;

        await (html5QrCode as {
          start: (
            constraints: unknown,
            config: unknown,
            onSuccess: (text: string) => void,
            onError: () => void
          ) => Promise<void>;
        }).start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 220, height: 220 } },
          (decodedText: string) => {
            const extracted = extractCode(decodedText);
            if (extracted) {
              stopCamera(html5QrCode);
              setCameraOpen(false);
              setCode(extracted);
              handleSubmit(extracted);
            }
          },
          () => { /* ignore frame errors */ }
        );
        setScannerReady(true);
      } catch (err: unknown) {
        const msg = (err as Error)?.message || "";
        if (msg.toLowerCase().includes("permission") || msg.toLowerCase().includes("notallowed")) {
          setCameraError("Доступ к камере запрещён. Разрешите использование камеры в настройках браузера.");
        } else {
          setCameraError("Не удалось запустить камеру: " + msg);
        }
      }
    };

    init();

    return () => {
      stopCamera(html5QrCode);
    };
  }, [cameraOpen]);

  const stopCamera = (instance?: unknown) => {
    const sc = instance || scannerRef.current;
    if (sc) {
      try {
        (sc as { stop: () => Promise<void> }).stop().catch(() => {});
      } catch { /* ignore */ }
      scannerRef.current = null;
    }
    setScannerReady(false);
  };

  const handleCloseCamera = () => {
    stopCamera();
    setCameraOpen(false);
    setCameraError("");
  };

  // ─── File QR decoder ─────────────────────────────────────────────────────
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset input so same file can be selected again
    e.target.value = "";

    setError("");
    try {
      const jsQR = (await import("jsqr")).default;

      const img = new Image();
      const url = URL.createObjectURL(file);
      img.src = url;

      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("Не удалось загрузить изображение"));
      });

      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas не поддерживается");
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const result = jsQR(imageData.data, imageData.width, imageData.height);

      if (!result) {
        setError("QR-код не найден на изображении. Попробуйте другое фото.");
        return;
      }

      const extracted = extractCode(result.data);
      if (!extracted) {
        setError(`QR-код найден, но не содержит код входа: "${result.data}"`);
        return;
      }

      setCode(extracted);
      handleSubmit(extracted);
    } catch (err: unknown) {
      setError("Ошибка при чтении файла: " + ((err as Error)?.message || ""));
    }
  };

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        bgcolor: "background.default",
        p: 2,
      }}
    >
      <Box sx={{ width: "100%", maxWidth: 400 }}>
        {/* Header */}
        <Box sx={{ textAlign: "center", mb: 3 }}>
          <Box
            sx={{
              width: 64, height: 64, borderRadius: 3,
              bgcolor: "primary.main", display: "inline-flex",
              alignItems: "center", justifyContent: "center", mb: 2,
            }}
          >
            <SchoolIcon sx={{ color: "white", fontSize: 36 }} />
          </Box>
          <Typography variant="h5" fontWeight={700}>Лицей — Задания</Typography>
          <Typography variant="body2" color="text.secondary">
            Платформа для выполнения заданий
          </Typography>
        </Box>

        <Card>
          <CardContent sx={{ p: 3 }}>
            <Typography variant="h6" fontWeight={600} sx={{ mb: 0.5 }}>
              Вход ученика
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Введите 7-значный код или отсканируйте QR-карточку
            </Typography>

            {error && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}

            <TextField
              fullWidth
              label="Код входа"
              placeholder="ABC1234"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7))}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              inputProps={{ maxLength: 7, style: { fontFamily: "monospace", fontSize: 20, letterSpacing: 4, textAlign: "center" } }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <LockIcon color="action" />
                  </InputAdornment>
                ),
              }}
              sx={{ mb: 2 }}
            />

            <Button
              fullWidth
              variant="contained"
              size="large"
              onClick={() => handleSubmit()}
              disabled={code.length !== 7 || loading}
              sx={{ mb: 2 }}
            >
              {loading ? <CircularProgress size={24} color="inherit" /> : "Войти"}
            </Button>

            {/* QR scan buttons */}
            <Divider sx={{ mb: 2 }}>
              <Typography variant="caption" color="text.secondary">или войти через QR-код</Typography>
            </Divider>

            <Box sx={{ display: "flex", gap: 1 }}>
              <Button
                fullWidth
                variant="outlined"
                startIcon={<QrCodeScannerIcon />}
                onClick={startCamera}
                disabled={loading}
                sx={{ py: 1.2 }}
              >
                Камера
              </Button>
              <Button
                fullWidth
                variant="outlined"
                startIcon={<PhotoLibraryIcon />}
                onClick={() => fileInputRef.current?.click()}
                disabled={loading}
                sx={{ py: 1.2 }}
              >
                Файл / Фото
              </Button>
            </Box>

            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={handleFileChange}
            />

            <Box sx={{ textAlign: "center", mt: 2 }}>
              <Typography
                variant="caption"
                color="text.secondary"
                component="a"
                href="/admin/login"
                sx={{ textDecoration: "none", "&:hover": { textDecoration: "underline" } }}
              >
                Войти как администратор →
              </Typography>
            </Box>
          </CardContent>
        </Card>
      </Box>

      {/* Camera Scanner Dialog */}
      <Dialog
        open={cameraOpen}
        onClose={handleCloseCamera}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", pb: 1 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <QrCodeScannerIcon color="primary" />
            <Typography fontWeight={600}>Сканирование QR-кода</Typography>
          </Box>
          <IconButton onClick={handleCloseCamera} size="small">
            <CloseIcon />
          </IconButton>
        </DialogTitle>

        <DialogContent sx={{ p: 2 }}>
          {cameraError ? (
            <Alert severity="error" sx={{ mb: 2 }}>{cameraError}</Alert>
          ) : (
            <>
              {!scannerReady && (
                <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", py: 4 }}>
                  <CircularProgress size={32} sx={{ mr: 2 }} />
                  <Typography color="text.secondary">Запуск камеры…</Typography>
                </Box>
              )}
              <Box
                id={scannerDivId}
                sx={{
                  width: "100%",
                  borderRadius: 2,
                  overflow: "hidden",
                  "& video": { borderRadius: 2 },
                }}
              />
              {scannerReady && (
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", textAlign: "center", mt: 1 }}>
                  Наведите камеру на QR-код карточки ученика
                </Typography>
              )}
            </>
          )}
        </DialogContent>

        <DialogActions sx={{ px: 2, pb: 2 }}>
          <Button onClick={handleCloseCamera} variant="outlined" fullWidth>
            Отмена
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
