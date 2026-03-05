

const KEY_STUDENT = "ltp_student_token";
const KEY_ADMIN = "ltp_admin_token";

export function getStudentToken() {
  return localStorage.getItem(KEY_STUDENT);
}

export function setStudentToken(t: string | null) {
  if (t) localStorage.setItem(KEY_STUDENT, t);
  else localStorage.removeItem(KEY_STUDENT);
  
}

export function getAdminToken() {
  return localStorage.getItem(KEY_ADMIN);
}

export function setAdminToken(t: string | null) {
  if (t) localStorage.setItem(KEY_ADMIN, t);
  else localStorage.removeItem(KEY_ADMIN);
  
}

export function clearTokens() {
  localStorage.removeItem(KEY_STUDENT);
  localStorage.removeItem(KEY_ADMIN);
  
}

export function getToken(): string | null {
  return localStorage.getItem(KEY_STUDENT) || localStorage.getItem(KEY_ADMIN);
}

export function isStudent(): boolean {
  return !!localStorage.getItem(KEY_STUDENT);
}

export function isAdmin(): boolean {
  return !!localStorage.getItem(KEY_ADMIN);
}

export function saveStudentToken(token: string) {
  setStudentToken(token);
}

export function saveAdminToken(token: string) {
  setAdminToken(token);
}
