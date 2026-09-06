// =======================================================
// SMART ATTENDANCE PLATFORM — Production Client Data Layer
// =======================================================

const DB = {
  USERS: 'sap_users',
  TOKEN: 'sap_token',
  CURRENT_USER: 'sap_current_user',
};

// ── Authentication & Storage Helpers ──────────────────
function getToken() {
  return localStorage.getItem(DB.TOKEN) || '';
}

function setToken(token) {
  if (token) localStorage.setItem(DB.TOKEN, token);
  else localStorage.removeItem(DB.TOKEN);
}

function getCurrentUser() {
  try {
    return JSON.parse(localStorage.getItem(DB.CURRENT_USER)) || null;
  } catch {
    return null;
  }
}

function setCurrentUser(user) {
  if (user) {
    localStorage.setItem(DB.CURRENT_USER, JSON.stringify(user));
    localStorage.setItem('attendx_current_user', JSON.stringify(user));
  } else {
    localStorage.removeItem(DB.CURRENT_USER);
    localStorage.removeItem('attendx_current_user');
  }
}

function getApiBase() {
  if (typeof window === 'undefined') return '';
  if (window.ENV_API_URL) return window.ENV_API_URL.replace(/\/$/, '');
  if (window.location.protocol === 'http:' || window.location.protocol === 'https:') {
    return window.location.origin;
  }
  return 'http://localhost:3000';
}

async function apiRequest(endpoint, options = {}) {
  const base = getApiBase();
  const url = endpoint.startsWith('http') ? endpoint : `${base}${endpoint}`;
  const token = getToken();

  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const res = await fetch(url, { ...options, headers });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        // If unauthorized and on protected page, redirect
        const isAuthPage = window.location.pathname.endsWith('index.html') || window.location.pathname === '/' || window.location.pathname === '';
        if (!isAuthPage && !endpoint.includes('/api/auth/login')) {
          logout();
          window.location.href = 'index.html';
        }
      }
      const errMsg = data && (data.error || data.message) ? (data.error || data.message) : `Request failed with status ${res.status}`;
      throw new Error(errMsg);
    }
    return data;
  } catch (err) {
    console.error(`[API Error ${endpoint}]:`, err.message);
    throw err;
  }
}

// ── Auth Methods ──────────────────────────────────────
async function login(email, password, role) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const res = await apiRequest('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: normalizedEmail, password, role }),
  });

  if (res.token) {
    setToken(res.token);
    setCurrentUser(res.user);
  }
  return res.user;
}

async function signup(formData) {
  const res = await apiRequest('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(formData),
  });

  if (res.token) {
    setToken(res.token);
    setCurrentUser(res.user);
  }
  return res.user;
}

async function logout() {
  try {
    await apiRequest('/api/auth/logout', { method: 'POST' });
  } catch (e) {
    console.warn('Logout API notification error:', e);
  } finally {
    setToken('');
    setCurrentUser(null);
    window.location.href = 'index.html';
  }
}

// Background Activity Heartbeat (every 2 minutes)
if (typeof window !== 'undefined') {
  setInterval(() => {
    if (getToken()) {
      apiRequest('/api/auth/heartbeat', { method: 'POST' }).catch(() => {});
    }
  }, 2 * 60 * 1000);
}

// ── Admin User Activity & MySQL Sessions ─────────────
async function getUserActivity() {
  return await apiRequest('/api/admin/user-activity');
}

async function getActiveUsers() {
  return await apiRequest('/api/admin/active-users');
}

async function getLoginHistory(filters = {}) {
  const query = new URLSearchParams(filters).toString();
  return await apiRequest(`/api/admin/login-history?${query}`);
}

async function getLoginStatistics() {
  return await apiRequest('/api/admin/login-statistics');
}

// ── Student Methods ───────────────────────────────────
let _cachedStudentAttendance = [];

async function getStudentProfile() {
  return apiRequest('/api/students/profile');
}

async function getStudentSubjects() {
  const data = await apiRequest('/api/students/subjects');
  return data.subjects || [];
}

async function getStudentAttendance() {
  const data = await apiRequest('/api/students/attendance');
  _cachedStudentAttendance = data.history || [];
  try {
    localStorage.setItem('sap_cached_attendance', JSON.stringify(_cachedStudentAttendance));
  } catch {}
  return _cachedStudentAttendance;
}

function getAttendanceByStudent(studentId) {
  if (_cachedStudentAttendance && _cachedStudentAttendance.length > 0) {
    return _cachedStudentAttendance;
  }
  try {
    const raw = localStorage.getItem('sap_cached_attendance');
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

async function getActiveSessionsForStudent() {
  const data = await apiRequest('/api/students/active-sessions');
  return data.sessions || [];
}

async function markAttendance(codeOrToken, gpsValid = true) {
  return apiRequest('/api/attendance/mark', {
    method: 'POST',
    body: JSON.stringify({ sessionCode: codeOrToken, qrToken: codeOrToken, gpsValid }),
  });
}

// ── Faculty Methods ───────────────────────────────────
async function getFacultyDashboardStats() {
  return apiRequest('/api/faculty/dashboard');
}

async function getFacultySubjects() {
  const data = await apiRequest('/api/faculty/subjects');
  return data.subjects || [];
}

async function getFacultySessions() {
  const data = await apiRequest('/api/faculty/sessions');
  return data.sessions || [];
}

async function createSession(subjectId, topic, durationMins) {
  return apiRequest('/api/sessions/create', {
    method: 'POST',
    body: JSON.stringify({ subjectId, topic, durationMinutes: durationMins }),
  });
}

async function stopSession(sessionId) {
  return apiRequest(`/api/sessions/${encodeURIComponent(sessionId)}/stop`, {
    method: 'POST',
  });
}

async function getSessionRoster(sessionId) {
  const data = await apiRequest(`/api/sessions/${encodeURIComponent(sessionId)}/roster`);
  return data.attendees || [];
}

async function getFacultyStudents() {
  const data = await apiRequest('/api/faculty/students');
  return data.students || [];
}

async function getFacultyLowAttendance() {
  const data = await apiRequest('/api/faculty/low-attendance');
  return data.records || [];
}

async function getFacultyReports(params = {}) {
  const q = new URLSearchParams(params).toString();
  const data = await apiRequest(`/api/faculty/reports?${q}`);
  return data.records || [];
}

// ── Admin Methods ─────────────────────────────────────
async function getAdminDashboard() {
  return apiRequest('/api/admin/dashboard');
}

async function getAdminStudents() {
  const data = await apiRequest('/api/admin/students');
  return data.students || [];
}

async function createAdminStudent(studentData) {
  return apiRequest('/api/admin/students', {
    method: 'POST',
    body: JSON.stringify(studentData),
  });
}

async function getAdminFaculty() {
  const data = await apiRequest('/api/admin/faculty');
  return data.faculty || [];
}

async function createAdminFaculty(facultyData) {
  return apiRequest('/api/admin/faculty', {
    method: 'POST',
    body: JSON.stringify(facultyData),
  });
}

async function getAdminSubjects() {
  const data = await apiRequest('/api/admin/subjects');
  return data.subjects || [];
}

async function createAdminSubject(subjectData) {
  return apiRequest('/api/admin/subjects', {
    method: 'POST',
    body: JSON.stringify(subjectData),
  });
}

async function getAdminAttendance() {
  const data = await apiRequest('/api/admin/attendance');
  return data.attendance || [];
}

async function getAdminLogs() {
  const data = await apiRequest('/api/admin/logs');
  return data.logs || [];
}

async function getAdminLowAttendance() {
  const data = await apiRequest('/api/admin/low-attendance');
  return data.records || [];
}

// Compatibility exports so existing UI scripts work seamlessly
window.SAP = {
  DB,
  getToken,
  getCurrentUser,
  setCurrentUser,
  login,
  signup,
  logout,
  apiRequest,

  // Student
  getStudentProfile,
  getStudentSubjects,
  getStudentAttendance,
  getAttendanceByStudent,
  getActiveSessionsForStudent,
  markAttendance,

  // Faculty
  getFacultyDashboardStats,
  getFacultySubjects,
  getFacultySessions,
  createSession,
  stopSession,
  getSessionRoster,
  getFacultyStudents,
  getFacultyLowAttendance,
  getFacultyReports,

  // Admin
  getAdminDashboard,
  getAdminStudents,
  createAdminStudent,
  getAdminFaculty,
  createAdminFaculty,
  getAdminSubjects,
  createAdminSubject,
  getAdminAttendance,
  getAdminLogs,
  getAdminLowAttendance,
  getUserActivity,
  getActiveUsers,
  getLoginHistory,
  getLoginStatistics,
};
