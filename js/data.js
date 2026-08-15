// =============================================
// SMART ATTENDANCE PLATFORM — Data Layer
// =============================================

const DB = {
  USERS: 'sap_users',
  SUBJECTS: 'sap_subjects',
  SESSIONS: 'sap_sessions',
  ATTENDANCE: 'sap_attendance',
  CURRENT_USER: 'sap_current_user',
  FACULTY_PASSWORDS: 'sap_faculty_passwords',
  ACADEMIC_YEAR: { start: '2026-07-20', end: '2026-12-30', label: 'Jul 2026 – Dec 2026' },
};

// ── Helpers ──────────────────────────────────
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function get(key) {
  try { return JSON.parse(localStorage.getItem(key)) || []; }
  catch { return []; }
}

function set(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function getObj(key) {
  try { return JSON.parse(localStorage.getItem(key)) || null; }
  catch { return null; }
}

function getApiBase() {
  if (typeof window === 'undefined') return 'https://attendance.com';
  if (window.location.protocol === 'file:') return 'https://attendance.com';
  return window.location.origin || 'https://attendance.com';
}

async function apiRequest(path, options = {}) {
  const url = path.startsWith('http') ? path : `${getApiBase()}${path}`;
  try {
    const response = await fetch(url, {
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options,
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = data && data.error ? data.error : 'Request failed.';
      throw new Error(error);
    }
    return data;
  } catch (error) {
    throw new Error(
      error && error.message
        ? error.message
        : 'Unable to connect to the AttendPro server. Please start the app with npm start and open https://attendance.com.'
    );
  }
}

function setCurrentUser(user) {
  if (!user) return;
  localStorage.setItem(DB.CURRENT_USER, JSON.stringify(user));
  localStorage.setItem('attendx_current_user', JSON.stringify(user));
}

// ── Seed Data ────────────────────────────────
function seed() {
  if (localStorage.getItem('sap_seeded')) return;

  // Only signed-up users are allowed to access the system.
  // Seed is intentionally empty so every student/faculty account is created through signup.
  const users = [];
  const subjects = [];
  const sessions = [];
  const attendance = [];
  const facultyPasswords = {};

  set(DB.USERS, users);
  set(DB.SUBJECTS, subjects);
  set(DB.SESSIONS, sessions);
  set(DB.ATTENDANCE, attendance);
  set(DB.FACULTY_PASSWORDS, facultyPasswords);
  localStorage.setItem('sap_seeded', '1');
}

function getRandomTopic(code) {
  const topics = {
    AILAG: ['AI Ethics & Leadership','Governance Frameworks','AI Policy','Digital Transformation','AI in Public Sector','Responsible AI','AI Strategy'],
    CDE:   ['Cloud Fundamentals','BigQuery & Analytics','Data Pipelines','ETL on GCP','Dataflow','Pub/Sub','Cloud Storage'],
    CM:    ['Migration Planning','Lift & Shift Strategy','Re-platforming','Cloud Assessment','Cost Optimization','Security in Cloud','Post-Migration Testing'],
    CTAV:  ['Threat Modeling','Phishing & Social Engineering','Ransomware','SQL Injection','Zero-Day Exploits','Network Scanning','Incident Response'],
    IPR:   ['Copyright Law','Patent Filing','Trademark Registration','Trade Secrets','Open Source Licenses','IP Infringement','Digital Rights'],
    IBT:   ['Blockchain Basics','Consensus Mechanisms','Smart Contracts','Ethereum','DeFi','NFTs','Hyperledger'],
    IIC:   ['Preamble & Fundamental Rights','Directive Principles','Constitutional Amendments','Parliament Structure','Judiciary','Election Process','Fundamental Duties'],
  };
  const list = topics[code] || ['Lecture'];
  return list[Math.floor(Math.random() * list.length)];
}

// ── Auth ─────────────────────────────────────
function signup({ role, name, email, password, rollNo = '' }) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const trimmedName = String(name || '').trim();
  const trimmedPassword = String(password || '');

  if (!trimmedName || !normalizedEmail || !trimmedPassword) {
    return { error: 'Please fill in all required fields.' };
  }

  if (trimmedPassword.length < 6) {
    return { error: 'Password must be at least 6 characters long.' };
  }

  if (typeof fetch !== 'undefined') {
    const payload = { role, name: trimmedName, email: normalizedEmail, password: trimmedPassword, rollNo: String(rollNo || '').trim() };
    return apiRequest('/api/signup', {
      method: 'POST',
      body: JSON.stringify(payload),
    }).then((data) => {
      const user = data.user || null;
      if (user) setCurrentUser(user);
      return user;
    }).catch((error) => {
      // If it's a specific validation error from the backend (like email exists), return it.
      if (error && error.message && error.message !== 'Failed to fetch' && !error.message.includes('Unable to connect')) {
        return { error: error.message };
      }
      
      const fallback = createLocalFallbackUser({ role, name: trimmedName, email: normalizedEmail, password: trimmedPassword, rollNo: String(rollNo || '').trim() });
      if (fallback && fallback.error) return fallback;
      return fallback;
    });
  }

  const users = get(DB.USERS);
  if (users.some(u => u.email && u.email.toLowerCase() === normalizedEmail)) {
    return { error: 'An account with this email already exists.' };
  }

  const newUser = {
    id: uid(),
    name: trimmedName,
    email: normalizedEmail,
    password: trimmedPassword,
    role,
    createdAt: new Date().toISOString(),
    ...(role === 'student' ? { rollNo: rollNo.trim() || `STU-${Date.now().toString().slice(-6)}`, enrolledSubjects: [] } : {}),
  };

  users.push(newUser);
  set(DB.USERS, users);

  if (role === 'faculty') {
    const facultyPasswords = get(DB.FACULTY_PASSWORDS);
    facultyPasswords[newUser.id] = trimmedPassword;
    set(DB.FACULTY_PASSWORDS, facultyPasswords);
  }

  const { password: _, ...safeUser } = newUser;
  setCurrentUser(safeUser);
  return safeUser;
}

function createLocalFallbackUser({ role, name, email, password, rollNo = '' }) {
  const users = get(DB.USERS);
  const normalizedEmail = String(email || '').trim().toLowerCase();

  if (users.some(u => u.email && u.email.toLowerCase() === normalizedEmail)) {
    return { error: 'An account with this email already exists.' };
  }

  const newUser = {
    id: uid(),
    name: String(name || '').trim(),
    email: normalizedEmail,
    password: String(password || ''),
    role,
    createdAt: new Date().toISOString(),
    ...(role === 'student' ? { rollNo: String(rollNo || '').trim() || `STU-${Date.now().toString().slice(-6)}`, enrolledSubjects: [] } : {}),
  };

  users.push(newUser);
  set(DB.USERS, users);

  if (role === 'faculty') {
    const facultyPasswords = get(DB.FACULTY_PASSWORDS);
    facultyPasswords[newUser.id] = String(password || '');
    set(DB.FACULTY_PASSWORDS, facultyPasswords);
  }

  const { password: _, ...safeUser } = newUser;
  setCurrentUser(safeUser);
  return safeUser;
}

function login(email, password) {
  const normalizedEmail = String(email || '').trim().toLowerCase();

  if (typeof fetch !== 'undefined') {
    return apiRequest('/api/login', {
      method: 'POST',
      body: JSON.stringify({ email: normalizedEmail, password: String(password || '') }),
    }).then((data) => {
      const user = data.user || null;
      if (user) {
        setCurrentUser(user);
        startPresenceHeartbeat();
      }
      return user;
    }).catch((error) => {
      // If the backend threw an explicit error (like 401 Invalid email/password), propagate it.
      if (error && error.message && error.message !== 'Failed to fetch' && !error.message.includes('Unable to connect')) {
        throw error;
      }

      const users = get(DB.USERS);
      const user = users.find(u => u.email && u.email.toLowerCase() === normalizedEmail);
      if (!user) return null;

      if (user.role === 'faculty') {
        const facultyPasswords = get(DB.FACULTY_PASSWORDS);
        if (facultyPasswords[user.id] !== String(password || '')) return null;
      } else if (user.password !== String(password || '')) {
        return null;
      }

      const { password: _, ...safeUser } = user;
      setCurrentUser(safeUser);
      return safeUser;
    });
  }

  const users = get(DB.USERS);
  const user = users.find(u => u.email && u.email.toLowerCase() === normalizedEmail);
  if (!user) return null;

  if (user.role === 'faculty') {
    const facultyPasswords = get(DB.FACULTY_PASSWORDS);
    if (facultyPasswords[user.id] !== password) return null;
  } else if (user.password !== password) {
    return null;
  }

  const { password: _, ...safeUser } = user;
  setCurrentUser(safeUser);
  return safeUser;
}

// Update faculty password (faculty can change their own password)
function updateFacultyPassword(facultyId, newPassword) {
  const facultyPasswords = get(DB.FACULTY_PASSWORDS);
  if (!facultyPasswords[facultyId]) return { error: 'Faculty not found' };
  facultyPasswords[facultyId] = newPassword;
  set(DB.FACULTY_PASSWORDS, facultyPasswords);
  return { success: true, message: 'Password updated successfully' };
}

// Get faculty password (for admin purposes - stored separately from user data)
function getFacultyPassword(facultyId) {
  const facultyPasswords = get(DB.FACULTY_PASSWORDS);
  return facultyPasswords[facultyId] || null;
}

function heartbeat() {
  const current = getObj(DB.CURRENT_USER) || getObj('attendx_current_user');
  if (!current || typeof fetch === 'undefined') return;

  fetch(`${getApiBase()}/api/heartbeat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: current.id }),
  }).catch(() => {});
}

function startPresenceHeartbeat() {
  if (typeof window === 'undefined') return;
  if (window.__attendance_presence_timer) {
    clearInterval(window.__attendance_presence_timer);
  }

  heartbeat();
  window.__attendance_presence_timer = setInterval(heartbeat, 30000);
}

function logout() {
  const current = getCurrentUser();

  if (window.__attendance_presence_timer) {
    clearInterval(window.__attendance_presence_timer);
    window.__attendance_presence_timer = null;
  }

  if (current && typeof fetch !== 'undefined') {
    fetch(`${getApiBase()}/api/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: current.id }),
      keepalive: true
    }).catch(() => {});
  }

  localStorage.removeItem(DB.CURRENT_USER);
  localStorage.removeItem('attendx_current_user');
}

function getCurrentUser() {
  const current = getObj(DB.CURRENT_USER) || getObj('attendx_current_user');
  if (current) {
    setCurrentUser(current);
    startPresenceHeartbeat();
  }
  return current;
}

async function getOnlineUsers() {
  return apiRequest('/api/online-users');
}

// ── Users ─────────────────────────────────────
function getStudents() {
  return get(DB.USERS).filter(u => u.role === 'student');
}

function getUserById(id) {
  return get(DB.USERS).find(u => u.id === id) || null;
}

// ── Subjects ──────────────────────────────────
function getSubjects() { return get(DB.SUBJECTS); }

function getSubjectsByFaculty(facultyId) {
  return get(DB.SUBJECTS).filter(s => s.facultyId === facultyId);
}

function getSubjectsByStudent(studentId) {
  const all = get(DB.SUBJECTS);
  const user = get(DB.USERS).find(u => u.id === studentId);
  if (!user) return [];
  return all.filter(s => s.enrolledStudents.includes(studentId));
}

function getSubjectById(id) {
  return get(DB.SUBJECTS).find(s => s.id === id) || null;
}

// ── Sessions ──────────────────────────────────
function getSessions() { return get(DB.SESSIONS); }

function getSessionsBySubject(subjectId) {
  return get(DB.SESSIONS).filter(s => s.subjectId === subjectId);
}

function getSessionsByFaculty(facultyId) {
  const mySubIds = getSubjectsByFaculty(facultyId).map(s => s.id);
  return get(DB.SESSIONS).filter(s => mySubIds.includes(s.subjectId));
}

function getActiveSessionsForStudent(studentId) {
  const mySubIds = getSubjectsByStudent(studentId).map(s => s.id);
  const now = Date.now();
  return get(DB.SESSIONS).filter(s =>
    mySubIds.includes(s.subjectId) &&
    s.status === 'active' &&
    s.expiresAt > now
  );
}

function createSession(subjectId, facultyId, topic, durationMins) {
  const sessions = get(DB.SESSIONS);
  const now = Date.now();
  const today = new Date().toISOString().split('T')[0];

  // Validate within academic year
  const { start, end } = DB.ACADEMIC_YEAR;
  if (today < start || today > end) {
    return { error: `Sessions can only be created between ${start} and ${end}.` };
  }

  const mins = durationMins || 5;
  const newSession = {
    id: uid(),
    subjectId,
    facultyId,
    date: today,
    startTime: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
    expiresAt: now + mins * 60 * 1000,
    qrToken: `SAP-${subjectId}-${uid()}`,
    status: 'active',
    topic: topic || 'Lecture',
  };
  sessions.push(newSession);
  set(DB.SESSIONS, sessions);
  return newSession;
}

function expireSession(sessionId) {
  const sessions = get(DB.SESSIONS).map(s =>
    s.id === sessionId ? { ...s, status: 'expired' } : s
  );
  set(DB.SESSIONS, sessions);
}

function getSessionById(id) {
  return get(DB.SESSIONS).find(s => s.id === id) || null;
}

function getSessionByToken(token) {
  return get(DB.SESSIONS).find(s => s.qrToken === token) || null;
}

// ── Attendance ────────────────────────────────
function getAttendance() { return get(DB.ATTENDANCE); }

function getAttendanceBySession(sessionId) {
  return get(DB.ATTENDANCE).filter(a => a.sessionId === sessionId);
}

function getAttendanceByStudent(studentId) {
  return get(DB.ATTENDANCE).filter(a => a.studentId === studentId);
}

function hasStudentMarkedSession(studentId, sessionId) {
  return get(DB.ATTENDANCE).some(a => a.studentId === studentId && a.sessionId === sessionId);
}

function markAttendance(sessionId, studentId, subjectId, gpsValid = true) {
  const records = get(DB.ATTENDANCE);
  const record = {
    id: uid(),
    sessionId,
    studentId,
    subjectId,
    timestamp: new Date().toISOString(),
    gpsValid,
  };
  records.push(record);
  set(DB.ATTENDANCE, records);
  return record;
}

// ── Analytics ─────────────────────────────────
function getStudentAttendanceStats(studentId) {
  const subjects = getSubjectsByStudent(studentId);
  const allAttendance = getAttendanceByStudent(studentId);
  const allSessions = get(DB.SESSIONS);

  return subjects.map(sub => {
    const subSessions = allSessions.filter(s => s.subjectId === sub.id);
    const attended = allAttendance.filter(a => a.subjectId === sub.id).length;
    const total = subSessions.length;
    const pct = total > 0 ? Math.round((attended / total) * 100) : 0;
    return { subject: sub, attended, total, percentage: pct };
  });
}

function getFacultyDashboardStats(facultyId) {
  const mySubjects = getSubjectsByFaculty(facultyId);
  const mySessions = getSessionsByFaculty(facultyId);
  const allStudents = getStudents();
  const allAttendance = getAttendance();
  const today = new Date().toISOString().split('T')[0];
  const sessionsToday = mySessions.filter(s => s.date === today);
  const activeSessions = mySessions.filter(s => s.status === 'active' && s.expiresAt > Date.now());

  // Compute overall attendance per student
  const studentStats = allStudents.map(student => {
    const enrolled = mySubjects.filter(s => s.enrolledStudents.includes(student.id));
    if (!enrolled.length) return null;
    let totalSessions = 0, attended = 0;
    enrolled.forEach(sub => {
      const subSess = mySessions.filter(s => s.subjectId === sub.id);
      totalSessions += subSess.length;
      attended += allAttendance.filter(a => a.studentId === student.id && a.subjectId === sub.id).length;
    });
    const pct = totalSessions > 0 ? Math.round((attended / totalSessions) * 100) : 0;
    return { student, attended, totalSessions, percentage: pct, isAtRisk: pct < 75 };
  }).filter(Boolean);

  const atRiskCount = studentStats.filter(s => s.isAtRisk).length;

  // Per-subject stats
  const subjectStats = mySubjects.map(sub => {
    const subSessions = mySessions.filter(s => s.subjectId === sub.id);
    const enrolled = sub.enrolledStudents.length;
    let totalAttended = 0;
    subSessions.forEach(sess => {
      totalAttended += allAttendance.filter(a => a.sessionId === sess.id).length;
    });
    const maxPossible = subSessions.length * enrolled;
    const avgPct = maxPossible > 0 ? Math.round((totalAttended / maxPossible) * 100) : 0;
    return { subject: sub, sessions: subSessions.length, avgAttendance: avgPct };
  });

  return {
    totalStudents: allStudents.filter(s => mySubjects.some(sub => sub.enrolledStudents.includes(s.id))).length,
    totalSessions: mySessions.length,
    sessionsToday: sessionsToday.length,
    activeSessions: activeSessions.length,
    atRiskCount,
    studentStats,
    subjectStats,
    mySubjects,
    mySessions,
  };
}

function getWeeklyTrend(facultyId) {
  const mySessions = getSessionsByFaculty(facultyId);
  const allAttendance = getAttendance();
  const mySubjects = getSubjectsByFaculty(facultyId);
  const weeks = [];
  for (let w = 5; w >= 0; w--) {
    const start = new Date(); start.setDate(start.getDate() - w * 7 - 6);
    const end   = new Date(); end.setDate(end.getDate() - w * 7);
    const label = `Wk ${6-w}`;
    const weekSessions = mySessions.filter(s => {
      const d = new Date(s.date);
      return d >= start && d <= end;
    });
    let totalSlots = 0, attended = 0;
    weekSessions.forEach(sess => {
      const sub = mySubjects.find(s => s.id === sess.subjectId);
      if (!sub) return;
      totalSlots += sub.enrolledStudents.length;
      attended += allAttendance.filter(a => a.sessionId === sess.id).length;
    });
    weeks.push({ label, pct: totalSlots > 0 ? Math.round((attended / totalSlots) * 100) : 0 });
  }
  return weeks;
}

// Export
window.SAP = {
  DB, uid, seed, signup,
  login, logout, getCurrentUser, getOnlineUsers, updateFacultyPassword, getFacultyPassword,
  getStudents, getUserById,
  getSubjects, getSubjectsByFaculty, getSubjectsByStudent, getSubjectById,
  getSessions, getSessionsBySubject, getSessionsByFaculty, getActiveSessionsForStudent,
  createSession, expireSession, getSessionById, getSessionByToken,
  getAttendance, getAttendanceBySession, getAttendanceByStudent,
  hasStudentMarkedSession, markAttendance,
  getStudentAttendanceStats, getFacultyDashboardStats, getWeeklyTrend,
};
