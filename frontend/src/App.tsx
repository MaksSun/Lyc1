import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider, createTheme, CssBaseline } from "@mui/material";
import { ruRU } from "@mui/material/locale";

// Auth pages
import StudentLogin from "./pages/StudentLogin";
import AdminLogin from "./pages/AdminLogin";

// Admin pages
import AdminLayout from "./pages/admin/AdminLayout";
import AdminClasses from "./pages/admin/AdminClasses";
import AdminStudents from "./pages/admin/AdminStudents";
import AdminSchedule from "./pages/admin/AdminSchedule";
import AdminJournal from "./pages/admin/AdminJournal";
import AdminResults from "./pages/admin/AdminResults";
import AdminAttemptDetail from "./pages/admin/AdminAttemptDetail";
import AdminMaterials from "./pages/admin/AdminMaterials";
import AdminSurveys from "./pages/admin/AdminSurveys";
import AdminYamlEditor from "./pages/admin/AdminYamlEditor";
import AdminOnline from "./pages/admin/AdminOnline";

// Student pages
import StudentDashboard from "./pages/student/StudentDashboard";
import Assignment from "./pages/student/Assignment";
import AttemptReview from "./pages/student/AttemptReview";

// Survey (public test/questionnaire) pages
import SurveyLogin from "./pages/survey/SurveyLogin";
import SurveyPage from "./pages/survey/SurveyPage";

// Robot game
import RobotGame from "./pages/robot/RobotGame";

import { getAdminToken, getStudentToken } from "./auth";

const theme = createTheme(
  {
    palette: {
      mode: "light",
      primary: { main: "#1976d2" },
      secondary: { main: "#9c27b0" },
      background: { default: "#f5f7fa" },
    },
    typography: {
      fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
    },
    shape: { borderRadius: 10 },
    components: {
      MuiButton: {
        styleOverrides: {
          root: { textTransform: "none", fontWeight: 600 },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: { boxShadow: "0 2px 12px rgba(0,0,0,0.08)" },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: { backgroundImage: "none" },
        },
      },
    },
  },
  ruRU
);

function RequireAdmin({ children }: { children: React.ReactNode }) {
  return getAdminToken() ? <>{children}</> : <Navigate to="/admin/login" replace />;
}

function RequireStudent({ children }: { children: React.ReactNode }) {
  return getStudentToken() ? <>{children}</> : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <BrowserRouter>
        <Routes>
          {/* ── Ученик ── */}
          <Route path="/login" element={<StudentLogin />} />
          <Route
            path="/"
            element={
              <RequireStudent>
                <StudentDashboard />
              </RequireStudent>
            }
          />
          <Route
            path="/assignment/:id"
            element={
              <RequireStudent>
                <Assignment />
              </RequireStudent>
            }
          />
          <Route
            path="/attempts/:id"
            element={
              <RequireStudent>
                <AttemptReview />
              </RequireStudent>
            }
          />

          {/* ── Робот-Исполнитель (доступен всем, но сохранение только для авторизованных) ── */}
          <Route path="/robot" element={<RobotGame />} />

          {/* ── Публичные тесты и анкеты (без входа) ── */}
          <Route path="/survey" element={<SurveyLogin />} />
          <Route path="/survey/:code" element={<SurveyPage />} />

          {/* ── Администратор ── */}
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route
            path="/admin"
            element={
              <RequireAdmin>
                <AdminLayout />
              </RequireAdmin>
            }
          >
            <Route index element={<Navigate to="/admin/classes" replace />} />
            <Route path="classes" element={<AdminClasses />} />
            <Route path="students" element={<AdminStudents />} />
            <Route path="schedule" element={<AdminSchedule />} />
            <Route path="journal" element={<AdminJournal />} />
            <Route path="results" element={<AdminResults />} />
            <Route path="attempts/:id" element={<AdminAttemptDetail />} />
            <Route path="materials" element={<AdminMaterials />} />
            <Route path="surveys" element={<AdminSurveys />} />
            <Route path="yaml" element={<AdminYamlEditor />} />
            <Route path="online" element={<AdminOnline />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}
