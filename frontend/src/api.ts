import axios from "axios";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "",
});

// Автоматически подставляем токен из localStorage
api.interceptors.request.use((config) => {
  const url = config.url ?? "";
  const studentToken = localStorage.getItem("ltp_student_token");
  const adminToken = localStorage.getItem("ltp_admin_token");
  let token: string | null = null;
  if (
    url.startsWith("/api/admin") ||
    url.startsWith("/api/yaml") ||
    url.startsWith("/api/materials/admin") ||
    url.startsWith("/api/survey/admin")
  ) {
    token = adminToken;
  } else if (url.startsWith("/api/student") || url.startsWith("/api/materials/for")) {
    token = studentToken;
  } else {
    token = studentToken ?? adminToken;
  }
  if (token) {
    config.headers = config.headers ?? {};
    (config.headers as Record<string, string>).Authorization = `Bearer ${token}`;
  }
  return config;
});

// ─── Auth ────────────────────────────────────────────────────────────────────

export const studentLogin = (code: string) =>
  api.post("/api/student/login", { code }).then((r) => r.data);

export const adminLogin = (username: string, password: string) =>
  api.post("/api/admin/login", { username, password }).then((r) => r.data);

// ─── Student ─────────────────────────────────────────────────────────────────

export const getStudentMe = () =>
  api.get("/api/student/me").then((r) => r.data);

export const getStudentAssignments = () =>
  api.get("/api/student/assignments").then((r) => r.data);

export const getStudentSchedule = () =>
  api.get("/api/student/schedule").then((r) => r.data);

export const getAssignment = (id: string) =>
  api.get(`/api/student/assignment/${id}`).then((r) => r.data);

export const submitAssignment = (
  id: string,
  answers: Record<string, unknown>,
  meta?: { started_at?: string; time_spent_seconds?: number }
) =>
  api
    .post(`/api/student/assignment/${id}/submit`, { answers, ...meta })
    .then((r) => r.data);

export const getMyAttempts = () =>
  api.get("/api/student/attempts").then((r) => r.data);

export const getAttemptDetail = (attemptId: number) =>
  api.get(`/api/student/attempts/${attemptId}`).then((r) => r.data);

// ─── Admin — Classes ─────────────────────────────────────────────────────────

export const getClasses = () =>
  api.get("/api/admin/classes").then((r) => r.data);

export const createClass = (name: string) =>
  api.post("/api/admin/classes", { name }).then((r) => r.data);

export const deleteClass = (id: number) =>
  api.delete(`/api/admin/classes/${id}`).then((r) => r.data);

// ─── Admin — Students ────────────────────────────────────────────────────────

export const getStudents = (classId?: number) =>
  api
    .get("/api/admin/students", { params: classId ? { class_id: classId } : {} })
    .then((r) => r.data);

export const createStudent = (data: { name: string; code: string; class_id: number }) =>
  api.post("/api/admin/students", data).then((r) => r.data);

export const bulkCreateStudents = (
  class_id: number,
  items: { name: string; code?: string }[]
) => api.post("/api/admin/students/bulk", { class_id, items }).then((r) => r.data);

export const deleteStudent = (id: number) =>
  api.delete(`/api/admin/students/${id}`).then((r) => r.data);

export const updateStudent = (id: number, data: { name?: string; code?: string }) =>
  api.patch(`/api/admin/students/${id}`, data).then((r) => r.data);

// ─── Admin — Assignments ─────────────────────────────────────────────────────

export const getAdminAssignments = (className: string) =>
  api
    .get("/api/admin/assignments", { params: { class_name: className } })
    .then((r) => r.data);

// ─── Admin — Schedule ────────────────────────────────────────────────────────

export const getSchedule = (classId?: number) =>
  api
    .get("/api/admin/schedule", { params: classId ? { class_id: classId } : {} })
    .then((r) => r.data);

export const addScheduleItem = (data: {
  class_id: number;
  date: string;
  assignment_id: string;
  time_limit_minutes?: number;
  questions_limit?: number;
  questions_random?: boolean;
  student_assign_limit?: number | null;
  student_assign_random?: boolean;
}) => api.post("/api/admin/schedule", data).then((r) => r.data);

export const updateScheduleItem = (id: number, data: Record<string, unknown>) =>
  api.patch(`/api/admin/schedule/${id}`, data).then((r) => r.data);

export const deleteScheduleItem = (id: number) =>
  api.delete(`/api/admin/schedule/${id}`).then((r) => r.data);

export const getAssignConfig = (classId: number) =>
  api.get(`/api/admin/classes/${classId}/assign-config`).then((r) => r.data);

export const setAssignConfig = (
  classId: number,
  data: { student_assign_limit: number; student_assign_random: boolean }
) => api.put(`/api/admin/classes/${classId}/assign-config`, data).then((r) => r.data);

// ─── Admin — Journal ─────────────────────────────────────────────────────────

export const getClassJournal = (classId: number, date?: string) =>
  api
    .get(`/api/admin/journal/${classId}`, { params: date ? { date_filter: date } : {} })
    .then((r) => r.data);

// ─── Admin — Attempts & Analytics ───────────────────────────────────────────

export const getAttempts = (params: {
  class_id?: number;
  student_id?: number;
  assignment_id?: string;
}) => api.get("/api/admin/attempts", { params }).then((r) => r.data);

export const getAdminAttemptDetail = (attemptId: number) =>
  api.get(`/api/admin/attempts/${attemptId}`).then((r) => r.data);

export const deleteAttempt = (attemptId: number) =>
  api.delete(`/api/admin/attempts/${attemptId}`).then((r) => r.data);

export const getAssignmentStats = (classId: number, assignmentId: string) =>
  api
    .get(`/api/admin/stats/assignment/${classId}/${assignmentId}`)
    .then((r) => r.data);

// ─── Materials ───────────────────────────────────────────────────────────────

export const getMaterialsForAssignment = (assignmentId: string) =>
  api.get(`/api/materials/for-assignment/${assignmentId}`).then((r) => r.data);

export const getAdminMaterials = (params?: { class_id?: number; assignment_id?: string }) =>
  api.get("/api/materials/admin/list", { params }).then((r) => r.data);

export const createMaterial = (data: {
  title: string;
  description?: string;
  material_type: string;
  content?: string;
  class_id?: number;
  assignment_id?: string;
  sort_order?: number;
}) => api.post("/api/materials/admin/create", data).then((r) => r.data);

export const updateMaterial = (id: number, data: Record<string, unknown>) =>
  api.put(`/api/materials/admin/${id}`, data).then((r) => r.data);

export const deleteMaterial = (id: number) =>
  api.delete(`/api/materials/admin/${id}`).then((r) => r.data);

// ─── Survey (публичные тесты/анкеты) ────────────────────────────────────────

export const getSurveyInfo = (code: string) =>
  api.get(`/api/survey/info/${code}`).then((r) => r.data);

export const getSurveyAssignment = (code: string) =>
  api.get(`/api/survey/assignment/${code}`).then((r) => r.data);

export const submitSurvey = (
  code: string,
  data: {
    participant: { name: string; email?: string };
    answers: Record<string, unknown>;
    started_at?: string;
    time_spent_seconds?: number;
  }
) => api.post(`/api/survey/submit/${code}`, data).then((r) => r.data);

export const getAdminSurveys = (params?: { survey_type?: string }) =>
  api.get("/api/survey/admin/list", { params }).then((r) => r.data);

export const createSurvey = (data: {
  title: string;
  description?: string;
  survey_type: string;
  assignment_file?: string;
  time_limit_minutes?: number;
  show_results?: boolean;
  is_active?: boolean;
}) => api.post("/api/survey/admin/create", data).then((r) => r.data);

export const updateSurvey = (id: number, data: Record<string, unknown>) =>
  api.patch(`/api/survey/admin/${id}`, data).then((r) => r.data);

export const deleteSurvey = (id: number) =>
  api.delete(`/api/survey/admin/${id}`).then((r) => r.data);

export const getSurveyResults = (id: number) =>
  api.get(`/api/survey/admin/${id}/results`).then((r) => r.data);

// ─── YAML Editor ─────────────────────────────────────────────────────────────

// Получить список всех YAML-файлов
export const getYamlFiles = () =>
  api.get("/api/yaml/list").then((r) => r.data);

// Получить содержимое файла по пути (например "7М/algebra_01.yml")
export const getYamlFile = (path: string) =>
  api.get("/api/yaml/read", { params: { path } }).then((r) => r.data.content);

// Сохранить файл
export const saveYamlFile = (path: string, content: string) =>
  api.post("/api/yaml/save", { path, content }).then((r) => r.data);

// Удалить файл
export const deleteYamlFile = (path: string) =>
  api.delete("/api/yaml/delete", { params: { path } }).then((r) => r.data);

// Валидировать YAML
export const validateYaml = (content: string) =>
  api.post("/api/yaml/validate", { content }).then((r) => r.data);

// ─── Online Presence ─────────────────────────────────────────────────────────

export const getClassOnline = (classId: number) =>
  api.get(`/api/admin/classes/${classId}/online`).then((r) => r.data);

export const sendHeartbeat = (assignmentId?: string) =>
  api.post("/api/student/heartbeat", { assignment_id: assignmentId ?? null }).then((r) => r.data);
