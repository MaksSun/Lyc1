import React, { useEffect, useState, useCallback } from "react";
import { Box, Typography, LinearProgress, Chip } from "@mui/material";
import TimerIcon from "@mui/icons-material/Timer";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";

interface CountdownTimerProps {
  totalSeconds: number;
  onExpire: () => void;
  onTick?: (secondsLeft: number) => void;
}

export default function CountdownTimer({ totalSeconds, onExpire, onTick }: CountdownTimerProps) {
  const [secondsLeft, setSecondsLeft] = useState(totalSeconds);
  const [expired, setExpired] = useState(false);

  const handleExpire = useCallback(() => {
    setExpired(true);
    onExpire();
  }, [onExpire]);

  useEffect(() => {
    if (secondsLeft <= 0) {
      handleExpire();
      return;
    }
    const timer = setInterval(() => {
      setSecondsLeft((prev) => {
        const next = prev - 1;
        onTick?.(next);
        if (next <= 0) {
          clearInterval(timer);
          handleExpire();
          return 0;
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const progress = (secondsLeft / totalSeconds) * 100;
  const isWarning = secondsLeft <= 60;
  const isCritical = secondsLeft <= 30;

  return (
    <Box
      sx={{
        position: "sticky",
        top: 0,
        zIndex: 100,
        bgcolor: isCritical ? "error.main" : isWarning ? "warning.main" : "primary.main",
        color: "white",
        px: 3,
        py: 1,
        borderRadius: 2,
        mb: 2,
        display: "flex",
        alignItems: "center",
        gap: 2,
        boxShadow: 3,
        transition: "background-color 0.5s",
      }}
    >
      {isWarning ? (
        <WarningAmberIcon sx={{ animation: isCritical ? "pulse 0.5s infinite" : "none" }} />
      ) : (
        <TimerIcon />
      )}
      <Box sx={{ flex: 1 }}>
        <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
          <Typography variant="body2" fontWeight={600}>
            {expired ? "Время вышло!" : "Оставшееся время"}
          </Typography>
          <Typography variant="h6" fontWeight={700} fontFamily="monospace">
            {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
          </Typography>
        </Box>
        <LinearProgress
          variant="determinate"
          value={progress}
          sx={{
            height: 6,
            borderRadius: 3,
            bgcolor: "rgba(255,255,255,0.3)",
            "& .MuiLinearProgress-bar": {
              bgcolor: "white",
              borderRadius: 3,
            },
          }}
        />
      </Box>
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </Box>
  );
}
