// ============================================================
// ROBOT API — v23 integration
// ============================================================

import axios from "axios";

const api = axios.create({ baseURL: "" });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("ltp_student_token");
  if (token) {
    config.headers = config.headers ?? {};
    (config.headers as Record<string, string>).Authorization = `Bearer ${token}`;
  }
  return config;
});

// ─── Attempt types ────────────────────────────────────────────────────────────

export interface RobotAttemptPayload {
  level_id: string;
  level_name: string;
  success: boolean;
  steps: number;
  code: string;
  time_seconds: number;
}

export interface RobotAttemptRecord {
  id: number;
  student_id: number;
  student_name: string;
  class_name: string;
  level_id: string;
  level_name: string;
  success: boolean;
  steps: number;
  code: string;
  time_seconds: number;
  created_at: string;
}

export interface LeaderboardItem {
  student_name: string;
  class_name: string;
  level_id: string;
  level_name: string;
  best_steps: number;
  attempts_count: number;
  last_success_at: string | null;
}

export interface TrendItem {
  level_id: string;
  level_name: string;
  total_runs: number;
  success_runs: number;
  unique_students: number;
  avg_steps: number;
}

// ─── Level library types ──────────────────────────────────────────────────────

export type LevelVisibility = "personal" | "class" | "school";

export interface RobotLevelPayload {
  name: string;
  description?: string;
  rows: number;
  cols: number;
  robot_start_row: number;
  robot_start_col: number;
  walls_h: string[];
  walls_v: string[];
  targets: string[];
  initial_code?: string;
  is_public?: boolean;
  visibility?: LevelVisibility;
}

export interface RobotLevelRecord {
  id: number;
  name: string;
  description: string;
  rows: number;
  cols: number;
  robot_start_row: number;
  robot_start_col: number;
  walls_h: string[];
  walls_v: string[];
  targets: string[];
  initial_code: string;
  is_public: boolean;
  visibility: LevelVisibility;
  author_name: string;
  class_name: string;
  created_at: string;
  run_count: number;
}

// ─── API functions ────────────────────────────────────────────────────────────

export const saveRobotAttempt = (data: RobotAttemptPayload): Promise<RobotAttemptRecord> =>
  api.post("/api/robot/attempt", data).then((r) => r.data);

export const getMyRobotAttempts = (): Promise<RobotAttemptRecord[]> =>
  api.get("/api/robot/attempts").then((r) => r.data);

export const getRobotLeaderboard = (): Promise<LeaderboardItem[]> =>
  api.get("/api/robot/leaderboard").then((r) => r.data);

export const getRobotTrends = (): Promise<TrendItem[]> =>
  api.get("/api/robot/trends").then((r) => r.data);

export const getRobotLevels = (): Promise<RobotLevelRecord[]> =>
  api.get("/api/robot/levels").then((r) => r.data);

export const saveRobotLevel = (data: RobotLevelPayload): Promise<RobotLevelRecord> =>
  api.post("/api/robot/levels", data).then((r) => r.data);

export const deleteRobotLevel = (id: number): Promise<void> =>
  api.delete(`/api/robot/levels/${id}`).then(() => undefined);
