const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const { seedData } = require('./src/data/seed');
const { authenticateToken, requireRole, JWT_SECRET } = require('./src/middleware/auth');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({ origin: true, credentials: true }));
app.use(helmet());
app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));
app.use(rateLimit({ windowMs: 10 * 60 * 1000, max: 200 }));

const state = {
  users: [...seedData.users],
  students: [...seedData.students],
  faculty: [...seedData.faculty],
  subjects: [...seedData.subjects],
  enrollments: [...seedData.enrollments],
  sessions: [...seedData.sessions],
  attendance: [...seedData.attendance],
  notifications: [...seedData.notifications]
};

function createToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, name: user.name },
    JWT_SECRET,
    { expiresIn: '8h' }
  );
}

function getUserByEmail(email) {
  return state.users.find((user) => user.email.toLowerCase() === String(email).trim().toLowerCase());
}

function getStudentByUserId(userId) {
  return state.students.find((student) => student.id === userId);
}

function getFacultyByUserId(userId) {
  return state.faculty.find((faculty) => faculty.id === userId);
}

function subjectById(subjectId) {
  return state.subjects.find((subject) => subject.id === subjectId);
}

function studentAttendanceRows(studentId) {
  return state.attendance.filter((record) => record.studentId === studentId);
}

function calculateAttendance(studentId) {
  const rows = studentAttendanceRows(studentId).filter((record) => record.status === 'present' || record.status === 'absent');
  const total = rows.length;
  const attended = rows.filter((record) => record.status === 'present').length;
  return {
    total,
    attended,
    missed: total - attended,
    percentage: total > 0 ? Math.round((attended / total) * 100) : 0
  };
}

function calculateSubjectAttendance(studentId, subjectId) {
  const rows = state.attendance.filter(
    (record) => record.studentId === studentId && record.subjectId === subjectId && (record.status === 'present' || record.status === 'absent')
  );
  const total = rows.length;
  const attended = rows.filter((record) => record.status === 'present').length;
  return {
    total,
    attended,
    missed: total - attended,
    percentage: total > 0 ? Math.round((attended / total) * 100) : 0
  };
}

function getUserRoleProfile(user) {
  if (user.role === 'student') {
    const student = getStudentByUserId(user.id);
    const subjectIds = state.enrollments.filter((entry) => entry.studentId === user.id).map((entry) => entry.subjectId);
    const enrolledSubjects = state.subjects.filter((subject) => subjectIds.includes(subject.id));
    const attendanceSummary = calculateAttendance(user.id);
    return {
      user,
      student,
      enrolledSubjects,
      attendanceSummary,
      status: attendanceSummary.percentage >= 75 ? 'Good' : attendanceSummary.percentage >= 65 ? 'Warning' : 'Critical'
    };
  }

  if (user.role === 'faculty') {
    const faculty = getFacultyByUserId(user.id);
    const assignedSubjects = state.subjects.filter((subject) => subject.facultyId === user.id);
    return { user, faculty, assignedSubjects };
  }

  return { user };
}

function getDepartmentStats() {
  return state.students.reduce((acc, student) => {
    acc[student.department] = (acc[student.department] || 0) + 1;
    return acc;
  }, {});
}

function buildLowAttendanceList() {
  const results = [];
  state.students.forEach((student) => {
    const subjects = state.enrollments.filter((entry) => entry.studentId === student.id);
    subjects.forEach((entry) => {
      const subject = subjectById(entry.subjectId);
      const metrics = calculateSubjectAttendance(student.id, entry.subjectId);
      if (metrics.total > 0 && metrics.percentage < 75) {
        results.push({
          studentId: student.id,
          studentName: student.name,
          subjectId: subject.id,
          subjectName: subject.subjectName,
          percentage: metrics.percentage,
          status: metrics.percentage < 65 ? 'Critical' : 'Warning'
        });
      }
    });
  });
  return results;
}

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Smart attendance API is running.' });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password, role } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required.' });
  }

  const user = getUserByEmail(email);
  if (!user) {
    return res.status(401).json({ message: 'Invalid email or password.' });
  }

  if (role && user.role !== role) {
    return res.status(403).json({ message: 'Selected role does not match this account.' });
  }

  const passwordMatch = bcrypt.compareSync(password, user.password);
  if (!passwordMatch) {
    return res.status(401).json({ message: 'Invalid email or password.' });
  }

  const safeUser = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    ...(user.studentId ? { studentId: user.studentId } : {}),
    ...(user.facultyId ? { facultyId: user.facultyId } : {})
  };

  const token = createToken(safeUser);
  return res.json({ token, user: safeUser, profile: getUserRoleProfile(safeUser) });
});

app.post('/api/auth/register', (req, res) => {
  const { name, email, password, role = 'student', studentId, course, department, semester, section } = req.body || {};

  if (!name || !email || !password) {
    return res.status(400).json({ message: 'Name, email and password are required.' });
  }

  if (getUserByEmail(email)) {
    return res.status(409).json({ message: 'An account with this email already exists.' });
  }

  const newId = role === 'faculty' ? `fac-${uuidv4().slice(0, 6)}` : `stu-${uuidv4().slice(0, 6)}`;
  const passwordHash = bcrypt.hashSync(password, 10);

  const user = {
    id: newId,
    name,
    email: email.toLowerCase(),
    password: passwordHash,
    role
  };

  if (role === 'student') {
    user.studentId = studentId || `STU-${Date.now().toString().slice(-6)}`;
    user.course = course || 'B.Tech';
    user.department = department || 'Computer Science';
    user.semester = semester || 1;
    user.section = section || 'A';
    state.students.push({
      id: newId,
      studentId: user.studentId,
      name,
      email: user.email,
      course: user.course,
      department: user.department,
      semester: user.semester,
      section: user.section
    });
  }

  if (role === 'faculty') {
    user.facultyId = `FAC-${Date.now().toString().slice(-6)}`;
    user.department = department || 'Computer Science';
    state.faculty.push({
      id: newId,
      facultyId: user.facultyId,
      name,
      email: user.email,
      department: user.department
    });
  }

  state.users.push(user);
  const token = createToken({ id: user.id, email: user.email, role: user.role, name: user.name });

  return res.status(201).json({ token, user: { id: user.id, name, email: user.email, role }, message: 'Account created successfully.' });
});

app.get('/api/auth/me', authenticateToken, (req, res) => {
  const user = state.users.find((entry) => entry.id === req.user.id);
  if (!user) {
    return res.status(404).json({ message: 'User not found.' });
  }
  return res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role }, profile: getUserRoleProfile({ id: user.id, name: user.name, email: user.email, role: user.role }) });
});

app.post('/api/auth/logout', authenticateToken, (req, res) => {
  res.json({ message: 'Logout successful.' });
});

app.get('/api/students/profile', authenticateToken, requireRole('student'), (req, res) => {
  const student = getStudentByUserId(req.user.id);
  const profile = getUserRoleProfile({ id: req.user.id, name: req.user.name, email: req.user.email, role: 'student' });
  res.json({ student, profile });
});

app.get('/api/students/subjects', authenticateToken, requireRole('student'), (req, res) => {
  const subjectIds = state.enrollments.filter((entry) => entry.studentId === req.user.id).map((entry) => entry.subjectId);
  const enrolledSubjects = state.subjects
    .filter((subject) => subjectIds.includes(subject.id))
    .map((subject) => ({
      ...subject,
      attendance: calculateSubjectAttendance(req.user.id, subject.id)
    }));

  res.json({ subjects: enrolledSubjects });
});

app.get('/api/students/attendance', authenticateToken, requireRole('student'), (req, res) => {
  const history = state.attendance
    .filter((record) => record.studentId === req.user.id)
    .map((record) => ({
      ...record,
      subjectName: subjectById(record.subjectId)?.subjectName || 'Unknown'
    }))
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  const summary = calculateAttendance(req.user.id);
  res.json({ summary, history });
});

app.post('/api/attendance/mark', authenticateToken, requireRole('student'), (req, res) => {
  const { sessionCode, subjectId } = req.body || {};

  if (!sessionCode) {
    return res.status(400).json({ message: 'Attendance code is required.' });
  }

  const session = state.sessions.find((entry) => entry.sessionCode === String(sessionCode).trim() && entry.status === 'active');
  if (!session) {
    return res.status(400).json({ message: 'This attendance session is not active or the code is invalid.' });
  }

  const isEnrolled = state.enrollments.some((entry) => entry.studentId === req.user.id && entry.subjectId === (subjectId || session.subjectId));
  if (!isEnrolled) {
    return res.status(403).json({ message: 'You are not enrolled in this subject.' });
  }

  const duplicate = state.attendance.some(
    (record) => record.sessionId === session.id && record.studentId === req.user.id
  );

  if (duplicate) {
    return res.status(409).json({ message: 'Attendance has already been marked for this session.' });
  }

  const record = {
    id: `att-${uuidv4().slice(0, 8)}`,
    sessionId: session.id,
    studentId: req.user.id,
    subjectId: session.subjectId,
    date: new Date().toISOString().slice(0, 10),
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    status: 'present'
  };

  state.attendance.push(record);
  state.notifications.push({
    id: `n-${uuidv4().slice(0, 8)}`,
    userId: req.user.id,
    title: 'Attendance marked',
    message: 'Your attendance has been recorded successfully.',
    isRead: false
  });

  return res.status(201).json({ message: 'Attendance marked successfully.', record });
});

app.get('/api/faculty/dashboard', authenticateToken, requireRole('faculty'), (req, res) => {
  const assignedSubjects = state.subjects.filter((subject) => subject.facultyId === req.user.id);
  const lowAttendance = buildLowAttendanceList().filter((item) => assignedSubjects.some((subject) => subject.id === item.subjectId));

  const metrics = {
    totalStudents: state.students.length,
    totalSubjects: state.subjects.length,
    todaysSessions: state.sessions.filter((session) => session.facultyId === req.user.id).length,
    averageAttendance: 80,
    lowAttendanceStudents: lowAttendance.length
  };

  res.json({ metrics, assignedSubjects, lowAttendance });
});

app.get('/api/faculty/attendance', authenticateToken, requireRole('faculty'), (req, res) => {
  const records = state.attendance
    .filter((record) => state.subjects.some((subject) => subject.id === record.subjectId && subject.facultyId === req.user.id))
    .map((record) => ({
      ...record,
      studentName: state.students.find((student) => student.id === record.studentId)?.name || 'Unknown',
      subjectName: subjectById(record.subjectId)?.subjectName || 'Unknown'
    }));

  res.json({ records });
});

app.get('/api/faculty/low-attendance', authenticateToken, requireRole('faculty'), (req, res) => {
  const results = buildLowAttendanceList().filter((item) =>
    state.subjects.some((subject) => subject.id === item.subjectId && subject.facultyId === req.user.id)
  );
  res.json({ records: results });
});

app.post('/api/sessions/create', authenticateToken, requireRole('faculty'), (req, res) => {
  const { subjectId, sessionCode, minutes = 30 } = req.body || {};
  if (!subjectId || !sessionCode) {
    return res.status(400).json({ message: 'Subject and session code are required.' });
  }

  const subject = state.subjects.find((entry) => entry.id === subjectId && entry.facultyId === req.user.id);
  if (!subject) {
    return res.status(403).json({ message: 'You can only create sessions for your assigned subjects.' });
  }

  const session = {
    id: `session-${uuidv4().slice(0, 8)}`,
    subjectId,
    facultyId: req.user.id,
    sessionCode: String(sessionCode).trim().toUpperCase(),
    qrCode: String(sessionCode).trim().toUpperCase(),
    startTime: new Date().toISOString(),
    endTime: new Date(Date.now() + Number(minutes) * 60 * 1000).toISOString(),
    status: 'active'
  };

  state.sessions.push(session);
  return res.status(201).json({ message: 'Attendance session created successfully.', session });
});

app.get('/api/sessions/:id', authenticateToken, (req, res) => {
  const session = state.sessions.find((entry) => entry.id === req.params.id);
  if (!session) {
    return res.status(404).json({ message: 'Session not found.' });
  }
  res.json({ session });
});

app.post('/api/sessions/:id/stop', authenticateToken, (req, res) => {
  const session = state.sessions.find((entry) => entry.id === req.params.id);
  if (!session) {
    return res.status(404).json({ message: 'Session not found.' });
  }
  if (session.facultyId !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ message: 'You cannot stop this session.' });
  }
  session.status = 'completed';
  session.endTime = new Date().toISOString();
  res.json({ message: 'Session stopped.', session });
});

app.get('/api/admin/dashboard', authenticateToken, requireRole('admin'), (req, res) => {
  const totalStudents = state.students.length;
  const totalFaculty = state.faculty.length;
  const totalSubjects = state.subjects.length;
  const lowAttendance = buildLowAttendanceList().length;
  const avgAttendance = Math.round(
    state.students.reduce((sum, student) => sum + calculateAttendance(student.id).percentage, 0) / totalStudents
  );

  res.json({
    totals: {
      totalStudents,
      totalFaculty,
      totalSubjects,
      departments: Object.keys(getDepartmentStats()).length,
      todaysAttendance: state.attendance.length,
      averageAttendance: avgAttendance,
      lowAttendanceStudents: lowAttendance
    },
    departmentStats: getDepartmentStats(),
    lowAttendance: buildLowAttendanceList()
  });
});

app.get('/api/admin/students', authenticateToken, requireRole('admin'), (req, res) => {
  res.json({ students: state.students });
});

app.post('/api/admin/students', authenticateToken, requireRole('admin'), (req, res) => {
  const { name, email, password, studentId, course, department, semester, section } = req.body || {};
  if (!name || !email || !password) {
    return res.status(400).json({ message: 'Student details are required.' });
  }

  const newId = `stu-${uuidv4().slice(0, 6)}`;
  const user = {
    id: newId,
    name,
    email: email.toLowerCase(),
    password: bcrypt.hashSync(password, 10),
    role: 'student',
    studentId: studentId || `STU-${Date.now().toString().slice(-6)}`,
    course: course || 'B.Tech',
    department: department || 'Computer Science',
    semester: semester || 1,
    section: section || 'A'
  };

  state.users.push(user);
  state.students.push({ id: newId, studentId: user.studentId, name, email: user.email, course: user.course, department: user.department, semester: user.semester, section: user.section });

  res.status(201).json({ message: 'Student added successfully.', student: state.students[state.students.length - 1] });
});

app.get('/api/admin/faculty', authenticateToken, requireRole('admin'), (req, res) => {
  res.json({ faculty: state.faculty });
});

app.get('/api/admin/subjects', authenticateToken, requireRole('admin'), (req, res) => {
  res.json({ subjects: state.subjects });
});

app.post('/api/admin/subjects', authenticateToken, requireRole('admin'), (req, res) => {
  const { subjectCode, subjectName, facultyId, semester } = req.body || {};
  if (!subjectCode || !subjectName || !facultyId) {
    return res.status(400).json({ message: 'Subject code, name and faculty are required.' });
  }

  const subject = {
    id: `sub-${uuidv4().slice(0, 6)}`,
    subjectCode: String(subjectCode).trim(),
    subjectName: String(subjectName).trim(),
    facultyId,
    semester: semester || 1
  };
  state.subjects.push(subject);
  res.status(201).json({ message: 'Subject added successfully.', subject });
});

app.get('/api/reports/student', authenticateToken, (req, res) => {
  if (req.user.role === 'student') {
    const summary = calculateAttendance(req.user.id);
    return res.json({ student: req.user.name, summary, records: state.attendance.filter((item) => item.studentId === req.user.id) });
  }

  if (req.user.role === 'faculty') {
    const rows = state.students.map((student) => ({ student: student.name, attendance: calculateAttendance(student.id).percentage }));
    return res.json({ rows });
  }

  return res.json({ rows: state.students.map((student) => ({ student: student.name, attendance: calculateAttendance(student.id).percentage })) });
});

app.get('/api/reports/subject', authenticateToken, (req, res) => {
  const rows = state.subjects.map((subject) => ({
    subject: subject.subjectName,
    code: subject.subjectCode,
    average: Math.round(state.attendance.filter((record) => record.subjectId === subject.id && record.status === 'present').length / Math.max(state.attendance.filter((record) => record.subjectId === subject.id).length, 1) * 100)
  }));
  res.json({ rows });
});

app.get('/api/reports/monthly', authenticateToken, (req, res) => {
  const months = [
    { month: 'Aug', present: 42, absent: 12 },
    { month: 'Sep', present: 50, absent: 14 },
    { month: 'Oct', present: 48, absent: 10 },
    { month: 'Nov', present: 54, absent: 9 }
  ];
  res.json({ monthly: months });
});

app.get('/api/reports/low-attendance', authenticateToken, (req, res) => {
  res.json({ records: buildLowAttendanceList() });
});

app.use((req, res) => {
  res.status(404).json({ message: 'Route not found.' });
});

app.listen(PORT, () => {
  console.log(`Smart Attendance API running on http://localhost:${PORT}`);
});
