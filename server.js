require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const path = require('path');
const db = require('./db');

const app = express();
app.set('trust proxy', 1);
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const JWT_SECRET = process.env.JWT_SECRET || 'attendpro_prod_jwt_secret_2026_key_secure_99';
const APP_URL = (process.env.APP_URL || 'https://attendence.in.com').replace(/\/$/, '');

// Automatic HTTP -> HTTPS redirection in production when behind a reverse proxy (Render, Cloudflare, Railway, etc.)
app.use((req, res, next) => {
  if (
    process.env.NODE_ENV === 'production' &&
    req.headers['x-forwarded-proto'] &&
    req.headers['x-forwarded-proto'] !== 'https'
  ) {
    const host = req.headers.host || 'attendence.in.com';
    return res.redirect(301, `https://${host}${req.url}`);
  }
  next();
});

// Security Headers
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);

// CORS for custom domain and API subdomains
const allowedOrigins = [
  'https://attendence.in.com',
  'https://www.attendence.in.com',
  'https://api.attendence.in.com',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  APP_URL,
];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (process.env.CORS_ORIGIN && process.env.CORS_ORIGIN !== '*') {
        const customAllowed = process.env.CORS_ORIGIN.split(',').map((s) => s.trim());
        if (customAllowed.includes(origin) || customAllowed.includes('*')) {
          return callback(null, true);
        }
      }
      if (
        allowedOrigins.includes(origin) ||
        origin.endsWith('.attendence.in.com') ||
        origin.endsWith('attendence.in.com') ||
        process.env.CORS_ORIGIN === '*'
      ) {
        return callback(null, true);
      }
      return callback(null, true);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  })
);

// Logging & Parsing
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Global Rate Limiting
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again after a few minutes.' },
});
app.use('/api/', globalLimiter);

// Auth Rate Limiting
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: { error: 'Too many login attempts. Please wait 15 minutes before trying again.' },
});

// Static assets
app.use(express.static(__dirname, { maxAge: process.env.NODE_ENV === 'production' ? '1d' : 0 }));

// Database initialization guard
let dbInitPromise = null;
function ensureDb() {
  if (!dbInitPromise) {
    dbInitPromise = db.initDatabase().catch((err) => {
      dbInitPromise = null;
      throw err;
    });
  }
  return dbInitPromise;
}

app.use(async (req, res, next) => {
  if (req.path.startsWith('/api/')) {
    try {
      await ensureDb();
    } catch (err) {
      return res.status(500).json({ error: 'Database initialization failed: ' + err.message });
    }
  }
  next();
});

// ── Helpers & JWT Middleware ──────────────────────────────
function parseUserAgent(ua = '') {
  ua = String(ua || '');
  let browser = 'Chrome';
  if (ua.includes('Edg/')) browser = 'Edge';
  else if (ua.includes('Firefox/')) browser = 'Firefox';
  else if (ua.includes('Safari/') && !ua.includes('Chrome/')) browser = 'Safari';
  else if (ua.includes('curl') || ua.includes('node')) browser = 'API Client';

  let device = 'Desktop';
  if (/Android/i.test(ua)) device = 'Android';
  else if (/iPhone|iPad|iPod/i.test(ua)) device = 'iOS';
  else if (/Mobile/i.test(ua)) device = 'Mobile';
  else if (/Windows/i.test(ua)) device = 'Windows PC';
  else if (/Macintosh/i.test(ua)) device = 'Mac';
  else if (/Linux/i.test(ua)) device = 'Linux';

  return { browser, device };
}

function generateToken(user, sessionId = null) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
      sessionId: sessionId,
    },
    JWT_SECRET,
    { expiresIn: '12h' }
  );
}

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Authentication required. Please log in.' });
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({ error: 'Your session has expired or is invalid. Please log in again.' });
    }
    req.user = decoded;
    next();
  });
}

function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Unauthorized: You do not have permission to access this resource.' });
    }
    next();
  };
}

// Sweep expired sessions every 60 seconds
setInterval(() => {
  db.sweepExpiredSessions(30).catch(() => {});
}, 60 * 1000);

// ── Health & System ──────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    app: 'AttendPro Smart Attendance Platform',
    database: db.getMode(),
    dbName: db.getDatabaseName(),
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// ── Authentication Endpoints ──────────────────────────────
// 1. REGISTER
app.post('/api/auth/register', authLimiter, async (req, res) => {
  try {
    const { name, email, password, role = 'student' } = req.body || {};

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required.' });
    }

    if (!['student', 'faculty', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role specified.' });
    }

    if (String(password).length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const existing = await db.query('SELECT id FROM users WHERE LOWER(email) = ?', [normalizedEmail]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'An account with this email address already exists.' });
    }

    const passwordHash = db.hashPassword(password);
    const result = await db.query(
      'INSERT INTO users (name, email, password_hash, role, is_active) VALUES (?, ?, ?, ?, FALSE)',
      [String(name).trim(), normalizedEmail, passwordHash, role]
    );

    const newUserId = result.insertId;

    // Auto-enroll student into subjects if role is student
    if (role === 'student') {
      const subs = await db.query('SELECT id FROM subjects LIMIT 3');
      for (const sub of subs.rows) {
        await db.query(
          'INSERT IGNORE INTO enrollments (id, student_id, subject_id) VALUES (?, ?, ?)',
          [`enr-${newUserId}-${sub.id}`, newUserId, sub.id]
        );
      }
    }

    return res.status(201).json({
      message: 'User registered successfully',
      user: {
        id: newUserId,
        name: String(name).trim(),
        email: normalizedEmail,
        role,
      },
    });
  } catch (err) {
    console.error('[Register Error]:', err);
    return res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
});

// 2. LOGIN
app.post('/api/auth/login', authLimiter, async (req, res) => {
  try {
    const { email, password, role } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const result = await db.query('SELECT * FROM users WHERE LOWER(email) = ?', [normalizedEmail]);

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const user = result.rows[0];

    // Role check if explicitly requested
    if (role && user.role !== role) {
      return res.status(403).json({ error: `This account is registered as a ${user.role}, not a ${role}.` });
    }

    // Password check
    const match = bcrypt.compareSync(String(password), user.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // Step 2: Update users: is_active = TRUE and last_login_at = CURRENT_TIMESTAMP
    await db.query(
      'UPDATE users SET is_active = TRUE, last_login_at = CURRENT_TIMESTAMP WHERE id = ?',
      [user.id]
    );

    // Step 3: Parse client IP and User-Agent, insert new row into user_sessions
    const { browser, device } = parseUserAgent(req.headers['user-agent']);
    const rawIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || '127.0.0.1';
    const ip = rawIp.replace(/^::ffff:/, '');

    const sessRes = await db.query(
      `INSERT INTO user_sessions (user_id, login_time, last_activity, status, ip_address, device, browser)
       VALUES (?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'ACTIVE', ?, ?, ?)`,
      [user.id, ip, device, browser]
    );
    const sessionId = sessRes.insertId;

    const safeUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      sessionId,
      lastLoginAt: new Date().toISOString(),
    };

    const token = generateToken(safeUser, sessionId);

    return res.json({
      message: 'Login successful',
      token,
      user: safeUser,
    });
  } catch (err) {
    console.error('[Login Error]:', err);
    return res.status(500).json({ error: 'Login service encountered an error. Please try again.' });
  }
});

// 3. LOGOUT
app.post('/api/auth/logout', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const sessionId = req.user.sessionId || req.body?.sessionId;

    // Find and update current ACTIVE session
    if (sessionId) {
      await db.query(
        `UPDATE user_sessions
         SET logout_time = CURRENT_TIMESTAMP, status = 'LOGGED_OUT'
         WHERE id = ? AND status = 'ACTIVE'`,
        [sessionId]
      );
    }

    // Mark any remaining active sessions for this user as LOGGED_OUT
    await db.query(
      `UPDATE user_sessions
       SET logout_time = CURRENT_TIMESTAMP, status = 'LOGGED_OUT'
       WHERE user_id = ? AND status = 'ACTIVE'`,
      [userId]
    );

    // Update users: is_active = FALSE and last_logout_at = CURRENT_TIMESTAMP
    await db.query(
      'UPDATE users SET is_active = FALSE, last_logout_at = CURRENT_TIMESTAMP WHERE id = ?',
      [userId]
    );

    return res.json({ success: true, message: 'Logged out successfully.' });
  } catch (err) {
    console.error('[Logout Error]:', err);
    return res.status(500).json({ error: 'Logout failed.' });
  }
});

// 4. CURRENT USER
app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const userRes = await db.query(
      'SELECT id, name, email, role, is_active, created_at, last_login_at, last_logout_at FROM users WHERE id = ?',
      [req.user.id]
    );
    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }

    let activeSession = null;
    if (req.user.sessionId) {
      const sessRes = await db.query('SELECT * FROM user_sessions WHERE id = ?', [req.user.sessionId]);
      activeSession = sessRes.rows[0] || null;
    }

    return res.json({
      user: userRes.rows[0],
      session: activeSession,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch user profile.' });
  }
});

// 5. HEARTBEAT
app.post('/api/auth/heartbeat', authenticateToken, async (req, res) => {
  try {
    if (req.user.sessionId) {
      await db.query(
        `UPDATE user_sessions SET last_activity = CURRENT_TIMESTAMP WHERE id = ? AND status = 'ACTIVE'`,
        [req.user.sessionId]
      );
    }
    return res.json({ status: 'alive' });
  } catch (err) {
    return res.status(500).json({ error: 'Heartbeat failed.' });
  }
});

// ── Admin User Activity & Sessions ────────────────────────
// A. USER ACTIVITY SUMMARY CARDS
app.get('/api/admin/user-activity', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    await db.sweepExpiredSessions(30);

    const totalUsers = await db.query('SELECT COUNT(*) as count FROM users');
    const totalSignins = await db.query('SELECT COUNT(*) as count FROM user_sessions');
    const currentlyActive = await db.query("SELECT COUNT(DISTINCT user_id) as count FROM user_sessions WHERE status = 'ACTIVE'");
    const signedOut = await db.query("SELECT COUNT(*) as count FROM user_sessions WHERE status = 'LOGGED_OUT'");
    const expired = await db.query("SELECT COUNT(*) as count FROM user_sessions WHERE status = 'EXPIRED'");

    return res.json({
      totalUsers: Number(totalUsers.rows[0]?.count || 0),
      totalSignins: Number(totalSignins.rows[0]?.count || 0),
      currentlyActive: Number(currentlyActive.rows[0]?.count || 0),
      signedOut: Number(signedOut.rows[0]?.count || 0),
      expiredSessions: Number(expired.rows[0]?.count || 0),
    });
  } catch (err) {
    console.error('[User Activity Error]:', err);
    return res.status(500).json({ error: 'Failed to fetch user activity statistics.' });
  }
});

// B. CURRENTLY ACTIVE USERS
app.get('/api/admin/active-users', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    await db.sweepExpiredSessions(30);

    const queryStr = `
      SELECT s.id as session_id, s.user_id, u.name, u.email, u.role,
             s.login_time, s.last_activity, s.status, s.ip_address, s.device, s.browser
      FROM user_sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.status = 'ACTIVE'
      ORDER BY s.last_activity DESC, s.login_time DESC
    `;
    const result = await db.query(queryStr);

    return res.json({
      activeUsers: result.rows,
      totalActive: result.rows.length,
    });
  } catch (err) {
    console.error('[Active Users Error]:', err);
    return res.status(500).json({ error: 'Failed to fetch active users list.' });
  }
});

// C. LOGIN HISTORY WITH FILTERS
app.get('/api/admin/login-history', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    await db.sweepExpiredSessions(30);

    const { status, role, timeRange, search } = req.query || {};
    let whereClauses = [];
    let params = [];

    if (status && status !== 'ALL') {
      whereClauses.push('s.status = ?');
      params.push(status.toUpperCase());
    }

    if (role && role !== 'ALL') {
      whereClauses.push('u.role = ?');
      params.push(role.toLowerCase());
    }

    if (timeRange === 'today') {
      whereClauses.push('DATE(s.login_time) = CURDATE()');
    } else if (timeRange === 'week') {
      whereClauses.push('s.login_time >= DATE_SUB(NOW(), INTERVAL 7 DAY)');
    } else if (timeRange === 'month') {
      whereClauses.push('s.login_time >= DATE_SUB(NOW(), INTERVAL 30 DAY)');
    }

    if (search && String(search).trim()) {
      whereClauses.push('(u.name LIKE ? OR u.email LIKE ?)');
      const term = `%${String(search).trim()}%`;
      params.push(term, term);
    }

    const whereSql = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';

    const sql = `
      SELECT s.id as session_id, s.user_id, u.name, u.email, u.role,
             s.login_time, s.logout_time, s.last_activity, s.status,
             s.ip_address, s.device, s.browser
      FROM user_sessions s
      JOIN users u ON u.id = s.user_id
      ${whereSql}
      ORDER BY s.login_time DESC
      LIMIT 200
    `;

    const result = await db.query(sql, params);

    return res.json({
      history: result.rows,
      totalRecords: result.rows.length,
    });
  } catch (err) {
    console.error('[Login History Error]:', err);
    return res.status(500).json({ error: 'Failed to retrieve login history.' });
  }
});

// D. LOGIN STATISTICS & SIGN-IN COUNTS PER USER
app.get('/api/admin/login-statistics', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const totalSignins = await db.query('SELECT COUNT(*) as count FROM user_sessions');

    const sql = `
      SELECT u.id, u.name, u.email, u.role, u.is_active,
             u.last_login_at, u.last_logout_at,
             COUNT(s.id) as total_signins,
             COALESCE(SUM(CASE WHEN s.status = 'ACTIVE' THEN 1 ELSE 0 END), 0) as active_sessions_count
      FROM users u
      LEFT JOIN user_sessions s ON s.user_id = u.id
      GROUP BY u.id
      ORDER BY total_signins DESC, u.name ASC
    `;
    const userStats = await db.query(sql);

    return res.json({
      totalSignins: Number(totalSignins.rows[0]?.count || 0),
      userStatistics: userStats.rows,
    });
  } catch (err) {
    console.error('[Login Statistics Error]:', err);
    return res.status(500).json({ error: 'Failed to fetch login statistics.' });
  }
});

// E. ADMIN ALL USERS TABLE WITH SIGN-IN COUNT & LAST LOGIN/LOGOUT
app.get('/api/admin/users', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const sql = `
      SELECT u.id, u.name, u.email, u.role, u.is_active,
             u.created_at, u.last_login_at, u.last_logout_at,
             COUNT(s.id) as total_signins
      FROM users u
      LEFT JOIN user_sessions s ON s.user_id = u.id
      GROUP BY u.id
      ORDER BY u.name ASC
    `;
    const result = await db.query(sql);
    return res.json({ users: result.rows });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to retrieve user directory.' });
  }
});

// ── Admin Attendance & Telemetry ──────────────────────────
app.get('/api/admin/dashboard', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const totalStudents = await db.query("SELECT count(*) as count FROM users WHERE role = 'student'");
    const totalFaculty = await db.query("SELECT count(*) as count FROM users WHERE role = 'faculty'");
    const totalSubjects = await db.query('SELECT count(*) as count FROM subjects');
    const totalAttendance = await db.query('SELECT count(*) as count FROM attendance');
    const activeSessions = await db.query("SELECT count(*) as count FROM attendance_sessions WHERE status = 'active'");

    const totalAtt = Number(totalAttendance.rows[0]?.count || 0);
    const presentCount = await db.query("SELECT count(*) as count FROM attendance WHERE status = 'present'");
    const pres = Number(presentCount.rows[0]?.count || 0);
    const avgAttendance = totalAtt > 0 ? Math.round((pres / totalAtt) * 100) : 85;

    // At-risk students (< 75% attendance)
    const students = await db.query("SELECT id, name FROM users WHERE role = 'student'");
    let lowCount = 0;
    for (const s of students.rows) {
      const att = await db.query('SELECT status FROM attendance WHERE student_id = ?', [s.id]);
      if (att.rows.length > 0) {
        const p = att.rows.filter((r) => r.status === 'present').length;
        if (p / att.rows.length < 0.75) lowCount++;
      }
    }

    return res.json({
      totals: {
        totalStudents: Number(totalStudents.rows[0]?.count || 0),
        totalFaculty: Number(totalFaculty.rows[0]?.count || 0),
        totalSubjects: Number(totalSubjects.rows[0]?.count || 0),
        totalAttendance: totalAtt,
        activeSessions: Number(activeSessions.rows[0]?.count || 0),
        averageAttendance: avgAttendance,
        lowAttendanceCount: lowCount,
      },
    });
  } catch (err) {
    console.error('[Admin Dashboard Error]:', err);
    return res.status(500).json({ error: 'Failed to load administrator statistics.' });
  }
});

// Students list
app.get('/api/admin/students', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const result = await db.query(
      `SELECT u.id, u.name, u.email, u.is_active, u.created_at, u.last_login_at, u.last_logout_at,
              COUNT(s.id) as total_signins
       FROM users u
       LEFT JOIN user_sessions s ON s.user_id = u.id
       WHERE u.role = 'student'
       GROUP BY u.id
       ORDER BY u.name ASC`
    );
    return res.json({ students: result.rows });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to retrieve students list.' });
  }
});

// Faculty list
app.get('/api/admin/faculty', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const result = await db.query(
      `SELECT u.id, u.name, u.email, u.is_active, u.created_at, u.last_login_at, u.last_logout_at,
              COUNT(s.id) as total_signins
       FROM users u
       LEFT JOIN user_sessions s ON s.user_id = u.id
       WHERE u.role = 'faculty'
       GROUP BY u.id
       ORDER BY u.name ASC`
    );
    return res.json({ faculty: result.rows });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to retrieve faculty list.' });
  }
});

// Live Attendance Logs
app.get('/api/admin/attendance-logs', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const sql = `
      SELECT a.id, a.date, a.time, a.status, a.gps_valid,
             st.name as student_name, st.email as student_email,
             s.subject_name, s.subject_code, sess.topic
      FROM attendance a
      JOIN users st ON st.id = a.student_id
      JOIN subjects s ON s.id = a.subject_id
      LEFT JOIN attendance_sessions sess ON sess.id = a.session_id
      ORDER BY a.created_at DESC
      LIMIT 100
    `;
    const result = await db.query(sql);
    return res.json({ records: result.rows });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch attendance logs.' });
  }
});

// ── Student Attendance Endpoints ──────────────────────────
const studentHandler = async (req, res) => {
  try {
    const stuId = req.user.id;

    // Subjects enrolled
    const subs = await db.query(
      `SELECT s.id, s.subject_code, s.subject_name, s.semester, u.name as faculty_name
       FROM enrollments e
       JOIN subjects s ON s.id = e.subject_id
       LEFT JOIN users u ON u.id = s.faculty_id
       WHERE e.student_id = ?`,
      [stuId]
    );

    // Attendance records
    const att = await db.query(
      `SELECT a.id, a.date, a.time, a.status, a.created_at,
              s.subject_name, s.subject_code,
              COALESCE(sess.topic, 'Lecture') as topic
       FROM attendance a
       JOIN subjects s ON s.id = a.subject_id
       LEFT JOIN attendance_sessions sess ON sess.id = a.session_id
       WHERE a.student_id = ?
       ORDER BY a.created_at DESC
       LIMIT 50`,
      [stuId]
    );

    const total = att.rows.length;
    const present = att.rows.filter((r) => r.status === 'present').length;
    const percentage = total > 0 ? Math.round((present / total) * 100) : 0;

    return res.json({
      student: req.user,
      summary: {
        totalSessions: total,
        attendedSessions: present,
        percentage,
      },
      subjects: subs.rows,
      attendanceHistory: att.rows,
      stats: { totalClasses: total, attended: present, percentage },
    });
  } catch (err) {
    console.error('[Student Profile Error]:', err);
    return res.status(500).json({ error: 'Failed to load student profile.' });
  }
};

app.get('/api/students/profile', authenticateToken, requireRole('student', 'admin'), studentHandler);
app.get('/api/student/profile', authenticateToken, requireRole('student', 'admin'), studentHandler);
app.get('/api/student/dashboard', authenticateToken, requireRole('student', 'admin'), studentHandler);

const studentSubjectsHandler = async (req, res) => {
  try {
    const stuId = req.user.id;
    const subs = await db.query(
      `SELECT s.id, s.subject_code, s.subject_name, s.semester, u.name as faculty_name
       FROM enrollments e
       JOIN subjects s ON s.id = e.subject_id
       LEFT JOIN users u ON u.id = s.faculty_id
       WHERE e.student_id = ?`,
      [stuId]
    );

    const enrichedSubjects = [];
    for (const sub of subs.rows) {
      const att = await db.query(
        'SELECT status FROM attendance WHERE student_id = ? AND subject_id = ?',
        [stuId, sub.id]
      );
      const totalSess = await db.query(
        'SELECT count(*) as count FROM attendance_sessions WHERE subject_id = ?',
        [sub.id]
      );
      const sessCount = Number(totalSess.rows[0]?.count || 0);
      const attended = att.rows.filter(r => r.status === 'present').length;
      const total = Math.max(sessCount, attended);
      const pct = total > 0 ? Math.round((attended / total) * 100) : (attended > 0 ? 100 : 0);

      enrichedSubjects.push({
        id: sub.id,
        name: sub.subject_name,
        code: sub.subject_code,
        subject_name: sub.subject_name,
        subject_code: sub.subject_code,
        facultyName: sub.faculty_name || 'Department Faculty',
        faculty_name: sub.faculty_name || 'Department Faculty',
        semester: sub.semester || 1,
        attendance: {
          percentage: pct,
          attended: attended,
          total: total,
        },
      });
    }

    return res.json({ subjects: enrichedSubjects });
  } catch (err) {
    console.error('[Student Subjects Error]:', err);
    return res.status(500).json({ error: 'Failed to load enrolled subjects.' });
  }
};

app.get('/api/students/subjects', authenticateToken, requireRole('student', 'admin'), studentSubjectsHandler);
app.get('/api/student/subjects', authenticateToken, requireRole('student', 'admin'), studentSubjectsHandler);

const studentActiveSessionsHandler = async (req, res) => {
  try {
    const stuId = req.user.id;
    const sql = `
      SELECT sess.id, sess.subject_id, sess.session_code, sess.qr_code, sess.topic,
             sess.start_time, sess.end_time, sess.status,
             s.subject_name, s.subject_code, u.name as faculty_name
      FROM attendance_sessions sess
      JOIN subjects s ON s.id = sess.subject_id
      JOIN enrollments e ON e.subject_id = s.id
      LEFT JOIN users u ON u.id = sess.faculty_id
      WHERE sess.status = 'active'
        AND sess.end_time > NOW()
        AND e.student_id = ?
      ORDER BY sess.start_time DESC
    `;
    const result = await db.query(sql, [stuId]);

    const sessions = [];
    for (const sess of result.rows) {
      const attCheck = await db.query(
        'SELECT id FROM attendance WHERE session_id = ? AND student_id = ?',
        [sess.id, stuId]
      );
      sessions.push({
        ...sess,
        alreadyMarked: attCheck.rows.length > 0,
      });
    }

    return res.json({ sessions });
  } catch (err) {
    console.error('[Active Sessions Error]:', err);
    return res.status(500).json({ error: 'Failed to load active sessions.' });
  }
};

app.get('/api/students/active-sessions', authenticateToken, requireRole('student', 'admin'), studentActiveSessionsHandler);
app.get('/api/student/active-sessions', authenticateToken, requireRole('student', 'admin'), studentActiveSessionsHandler);

const studentAttendanceHandler = async (req, res) => {
  try {
    const stuId = req.user.id;
    const sql = `
      SELECT a.id, a.date, a.time, a.status, a.created_at,
             s.subject_name, s.subject_code,
             COALESCE(sess.topic, 'Regular Lecture') as topic
      FROM attendance a
      JOIN subjects s ON s.id = a.subject_id
      LEFT JOIN attendance_sessions sess ON sess.id = a.session_id
      WHERE a.student_id = ?
      ORDER BY a.created_at DESC
      LIMIT 100
    `;
    const result = await db.query(sql, [stuId]);

    const history = result.rows.map(r => ({
      ...r,
      timestamp: r.created_at,
    }));

    return res.json({ history });
  } catch (err) {
    console.error('[Student Attendance Error]:', err);
    return res.status(500).json({ error: 'Failed to load attendance records.' });
  }
};

app.get('/api/students/attendance', authenticateToken, requireRole('student', 'admin'), studentAttendanceHandler);
app.get('/api/student/attendance', authenticateToken, requireRole('student', 'admin'), studentAttendanceHandler);

// Mark Attendance
app.post('/api/attendance/mark', authenticateToken, requireRole('student', 'admin'), async (req, res) => {
  try {
    const { sessionCode, qrToken, gpsValid = true } = req.body || {};
    const stuId = req.user.id;
    let targetCode = String(sessionCode || qrToken || '').trim();

    // If student scans QR with full custom domain URL (e.g. https://attendence.in.com/student.html?session=CS123456)
    if (targetCode.includes('?') || targetCode.startsWith('http')) {
      try {
        const u = new URL(targetCode.startsWith('http') ? targetCode : `https://attendence.in.com/${targetCode}`);
        targetCode = u.searchParams.get('session') || u.searchParams.get('code') || targetCode;
      } catch (e) {
        const m = targetCode.match(/[?&](?:session|code)=([A-Z0-9_-]+)/i);
        if (m) targetCode = m[1];
      }
    }
    targetCode = targetCode.toUpperCase();

    if (!targetCode) {
      return res.status(400).json({ error: 'Session code or QR token is required.' });
    }

    const sessRes = await db.query(
      `SELECT sess.*, s.subject_name, s.subject_code
       FROM attendance_sessions sess
       JOIN subjects s ON s.id = sess.subject_id
       WHERE (UPPER(sess.session_code) = ? OR sess.qr_code = ?) AND sess.status = 'active'`,
      [targetCode, targetCode]
    );

    if (sessRes.rows.length === 0) {
      return res.status(404).json({ error: 'Invalid session code or the attendance window has closed.' });
    }

    const session = sessRes.rows[0];

    // Check expiration
    if (new Date(session.end_time).getTime() < Date.now()) {
      await db.query("UPDATE attendance_sessions SET status = 'ended' WHERE id = ?", [session.id]);
      return res.status(400).json({ error: 'This attendance session has already expired.' });
    }

    // Check duplicate
    const existing = await db.query(
      'SELECT id FROM attendance WHERE session_id = ? AND student_id = ?',
      [session.id, stuId]
    );

    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'You have already marked attendance for this session.' });
    }

    const attId = `att_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const timeStr = now.toTimeString().slice(0, 8);

    await db.query(
      `INSERT INTO attendance (id, session_id, student_id, subject_id, date, time, status, gps_valid)
       VALUES (?, ?, ?, ?, ?, ?, 'present', ?)`,
      [attId, session.id, stuId, session.subject_id, dateStr, timeStr, gpsValid ? 1 : 0]
    );

    return res.status(201).json({
      success: true,
      message: 'Attendance recorded successfully!',
      attendanceId: attId,
      subjectName: session.subject_name,
      time: timeStr,
      session: {
        id: session.id,
        topic: session.topic,
        subjectName: session.subject_name,
        time: timeStr,
      },
    });
  } catch (err) {
    console.error('[Mark Attendance Error]:', err);
    if (err.code === 'ER_DUP_ENTRY' || err.message?.includes('unique_session_student')) {
      return res.status(409).json({ error: 'You have already marked attendance for this session.' });
    }
    return res.status(500).json({ error: 'Failed to record attendance.' });
  }
});

// ── Faculty Endpoints ─────────────────────────────────────
app.get('/api/faculty/dashboard', authenticateToken, requireRole('faculty', 'admin'), async (req, res) => {
  try {
    const facId = req.user.id;
    const subs = await db.query(
      'SELECT * FROM subjects WHERE faculty_id = ? OR ? = 1',
      [facId, req.user.role === 'admin' ? 1 : 0]
    );

    const assignedSubjects = subs.rows.length > 0
      ? subs.rows
      : (await db.query('SELECT * FROM subjects LIMIT 5')).rows;

    // Total unique students in these subjects
    const subIds = assignedSubjects.map(s => s.id);
    let totalStudents = 0;
    if (subIds.length > 0) {
      const placeholders = subIds.map(() => '?').join(',');
      const stuRes = await db.query(
        `SELECT COUNT(DISTINCT student_id) as count FROM enrollments WHERE subject_id IN (${placeholders})`,
        subIds
      );
      totalStudents = Number(stuRes.rows[0]?.count || 0);
    }

    // Sessions today
    const sessToday = await db.query(
      'SELECT COUNT(*) as count FROM attendance_sessions WHERE (faculty_id = ? OR ? = 1) AND DATE(start_time) = CURDATE()',
      [facId, req.user.role === 'admin' ? 1 : 0]
    );

    // At risk students (< 75%)
    const allStudents = await db.query("SELECT id, name, email FROM users WHERE role = 'student'");
    let atRiskCount = 0;
    for (const s of allStudents.rows) {
      const att = await db.query('SELECT status FROM attendance WHERE student_id = ?', [s.id]);
      if (att.rows.length > 0) {
        const pres = att.rows.filter(r => r.status === 'present').length;
        if ((pres / att.rows.length) < 0.75) atRiskCount++;
      }
    }

    return res.json({
      metrics: {
        totalStudents,
        sessionsToday: Number(sessToday.rows[0]?.count || 0),
        atRiskCount,
      },
      assignedSubjects,
    });
  } catch (err) {
    console.error('[Faculty Dashboard Error]:', err);
    return res.status(500).json({ error: 'Failed to load faculty dashboard metrics.' });
  }
});

app.get('/api/faculty/subjects', authenticateToken, requireRole('faculty', 'admin'), async (req, res) => {
  try {
    let subs = await db.query('SELECT * FROM subjects WHERE faculty_id = ?', [req.user.id]);
    if (subs.rows.length === 0 || req.user.role === 'admin') {
      subs = await db.query('SELECT * FROM subjects');
    }
    return res.json({ subjects: subs.rows });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to retrieve subjects.' });
  }
});

app.get('/api/faculty/sessions', authenticateToken, requireRole('faculty', 'admin'), async (req, res) => {
  try {
    const facId = req.user.id;
    const isAdmin = req.user.role === 'admin';
    const sql = `
      SELECT sess.id, sess.subject_id, sess.session_code, sess.qr_code, sess.topic,
             sess.start_time, sess.end_time, sess.status, sess.created_at,
             s.subject_name, s.subject_code,
             COUNT(a.id) as attendee_count
      FROM attendance_sessions sess
      JOIN subjects s ON s.id = sess.subject_id
      LEFT JOIN attendance a ON a.session_id = sess.id
      WHERE sess.faculty_id = ? OR ? = 1
      GROUP BY sess.id
      ORDER BY sess.created_at DESC
      LIMIT 50
    `;
    const result = await db.query(sql, [facId, isAdmin ? 1 : 0]);
    return res.json({ sessions: result.rows });
  } catch (err) {
    console.error('[Faculty Sessions Error]:', err);
    return res.status(500).json({ error: 'Failed to load faculty sessions.' });
  }
});

app.post('/api/sessions/create', authenticateToken, requireRole('faculty', 'admin'), async (req, res) => {
  try {
    const { subjectId, topic = 'Lecture', durationMinutes = 45 } = req.body || {};

    if (!subjectId) {
      return res.status(400).json({ error: 'Subject selection is required.' });
    }

    const subRes = await db.query('SELECT * FROM subjects WHERE id = ?', [subjectId]);
    const sub = subRes.rows[0] || { subject_name: 'Course Class', subject_code: 'CS101' };

    const sessionId = `sess_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const sessionCode = `CS${Math.floor(100000 + Math.random() * 900000)}`;
    const qrCode = sessionCode;
    const dur = Number(durationMinutes) || 45;

    await db.query(
      `INSERT INTO attendance_sessions (id, subject_id, faculty_id, session_code, qr_code, topic, start_time, end_time, status)
       VALUES (?, ?, ?, ?, ?, ?, NOW(), DATE_ADD(NOW(), INTERVAL ? MINUTE), 'active')`,
      [sessionId, subjectId, req.user.id, sessionCode, qrCode, String(topic).trim(), dur]
    );

    const endTime = new Date(Date.now() + dur * 60000).toISOString();

    const qrUrl = `${APP_URL}/student.html?session=${sessionCode}&code=${sessionCode}`;

    return res.status(201).json({
      success: true,
      session: {
        id: sessionId,
        subjectId,
        subjectName: sub.subject_name,
        subjectCode: sub.subject_code,
        topic,
        sessionCode,
        qrToken: sessionCode,
        qrUrl,
        durationMinutes: dur,
        endTime,
      },
    });
  } catch (err) {
    console.error('[Create Session Error]:', err);
    return res.status(500).json({ error: 'Failed to create attendance session.' });
  }
});

app.post('/api/sessions/:sessionId/stop', authenticateToken, requireRole('faculty', 'admin'), async (req, res) => {
  try {
    await db.query(
      "UPDATE attendance_sessions SET status = 'ended', end_time = NOW() WHERE id = ?",
      [req.params.sessionId]
    );
    return res.json({ success: true, message: 'Session stopped successfully.' });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to stop session.' });
  }
});

app.get('/api/sessions/:sessionId/roster', authenticateToken, requireRole('faculty', 'admin'), async (req, res) => {
  try {
    const sql = `
      SELECT a.id, a.time, a.status, u.name as student_name, u.email as student_email
      FROM attendance a
      JOIN users u ON u.id = a.student_id
      WHERE a.session_id = ?
      ORDER BY a.created_at DESC
    `;
    const roster = await db.query(sql, [req.params.sessionId]);

    return res.json({
      attendees: roster.rows,
      roster: roster.rows,
      totalAttendees: roster.rows.length,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to retrieve session roster.' });
  }
});

app.get('/api/faculty/students', authenticateToken, requireRole('faculty', 'admin'), async (req, res) => {
  try {
    const studentsRes = await db.query(
      `SELECT u.id, u.name, u.email, u.created_at
       FROM users u WHERE u.role = 'student' ORDER BY u.name ASC`
    );

    const enriched = [];
    for (const stu of studentsRes.rows) {
      const att = await db.query('SELECT status FROM attendance WHERE student_id = ?', [stu.id]);
      const total = att.rows.length;
      const attended = att.rows.filter(r => r.status === 'present').length;
      const percentage = total > 0 ? Math.round((attended / total) * 100) : 100;

      enriched.push({
        id: stu.id,
        name: stu.name,
        email: stu.email,
        roll_no: `CS26-${String(stu.id).padStart(3, '0')}`,
        total_classes: total,
        attended,
        percentage,
      });
    }

    return res.json({ students: enriched });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to retrieve student directory.' });
  }
});

const lowAttendanceHandler = async (req, res) => {
  try {
    const studentsRes = await db.query("SELECT id, name, email FROM users WHERE role = 'student'");
    const atRisk = [];

    for (const stu of studentsRes.rows) {
      const att = await db.query('SELECT status FROM attendance WHERE student_id = ?', [stu.id]);
      if (att.rows.length > 0) {
        const attended = att.rows.filter(r => r.status === 'present').length;
        const total = att.rows.length;
        const pct = Math.round((attended / total) * 100);
        if (pct < 75) {
          atRisk.push({
            id: stu.id,
            name: stu.name,
            student_name: stu.name,
            email: stu.email,
            roll_no: `CS26-${String(stu.id).padStart(3, '0')}`,
            total,
            total_classes: total,
            attended,
            percentage: pct,
          });
        }
      }
    }

    return res.json({ records: atRisk });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to evaluate at-risk students.' });
  }
};

app.get('/api/faculty/low-attendance', authenticateToken, requireRole('faculty', 'admin'), lowAttendanceHandler);
app.get('/api/admin/low-attendance', authenticateToken, requireRole('admin'), lowAttendanceHandler);

app.get('/api/faculty/reports', authenticateToken, requireRole('faculty', 'admin'), async (req, res) => {
  try {
    const sql = `
      SELECT a.id, a.date, a.time, a.status,
             st.name as student_name, st.email as student_email,
             s.subject_name, s.subject_code, COALESCE(sess.topic, 'Lecture') as topic
      FROM attendance a
      JOIN users st ON st.id = a.student_id
      JOIN subjects s ON s.id = a.subject_id
      LEFT JOIN attendance_sessions sess ON sess.id = a.session_id
      ORDER BY a.created_at DESC
      LIMIT 200
    `;
    const result = await db.query(sql);
    return res.json({ records: result.rows });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to generate attendance reports.' });
  }
});

// Presence / Online Users
app.get('/api/online-users', async (req, res) => {
  try {
    await db.sweepExpiredSessions(30);
    const active = await db.query(
      `SELECT s.user_id, u.name, u.email, u.role, s.device, s.browser, s.login_time, s.last_activity
       FROM user_sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.status = 'ACTIVE'
       ORDER BY s.last_activity DESC`
    );
    return res.json({ total: active.rows.length, users: active.rows });
  } catch (err) {
    return res.json({ total: 0, users: [] });
  }
});

// Admin Subjects & Attendance
app.get('/api/admin/subjects', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const subs = await db.query('SELECT * FROM subjects ORDER BY subject_name ASC');
    return res.json({ subjects: subs.rows });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load subjects.' });
  }
});

app.post('/api/admin/subjects', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { code, name, semester = 1 } = req.body || {};
    if (!code || !name) return res.status(400).json({ error: 'Subject code and name are required.' });

    const id = `sub_${Date.now()}`;
    await db.query(
      'INSERT INTO subjects (id, subject_code, subject_name, semester) VALUES (?, ?, ?, ?)',
      [id, String(code).trim().toUpperCase(), String(name).trim(), Number(semester) || 1]
    );

    return res.status(201).json({ success: true, message: 'Subject created successfully.' });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to create subject.' });
  }
});

app.get('/api/admin/attendance', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const result = await db.query(
      `SELECT a.*, u.name as student_name, s.subject_name
       FROM attendance a
       JOIN users u ON u.id = a.student_id
       JOIN subjects s ON s.id = a.subject_id
       ORDER BY a.created_at DESC LIMIT 100`
    );
    return res.json({ attendance: result.rows });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load attendance.' });
  }
});

app.get('/api/admin/logs', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const result = await db.query(
      `SELECT s.*, u.name, u.email, u.role
       FROM user_sessions s
       JOIN users u ON u.id = s.user_id
       ORDER BY s.login_time DESC LIMIT 100`
    );
    return res.json({ logs: result.rows });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load logs.' });
  }
});

// Password reset handlers
app.post('/api/request-reset', async (req, res) => {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: 'Email is required.' });

  const normalized = String(email).trim().toLowerCase();
  const u = await db.query('SELECT id, name FROM users WHERE LOWER(email) = ?', [normalized]);
  if (u.rows.length === 0) {
    return res.status(404).json({ error: 'No account found with this email address.' });
  }
  const token = crypto.randomBytes(24).toString('hex');
  return res.json({
    message: 'Reset instructions generated successfully.',
    resetToken: token,
    email: normalized,
  });
});

app.post('/api/reset-password', async (req, res) => {
  const { email, password } = req.body || {};
  if (!password || String(password).length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
  }
  const passwordHash = db.hashPassword(password);
  if (email) {
    await db.query('UPDATE users SET password_hash = ? WHERE LOWER(email) = ?', [passwordHash, String(email).trim().toLowerCase()]);
  }
  return res.json({ success: true, message: 'Password updated successfully. You can now log in.' });
});

// HTML Page Routes (supporting clean URLs, /dashboard suffixes, and .html extensions)
app.get(['/student', '/student/dashboard', '/student.html'], (req, res) => res.sendFile(path.join(__dirname, 'student.html')));
app.get(['/faculty', '/faculty/dashboard', '/faculty.html'], (req, res) => res.sendFile(path.join(__dirname, 'faculty.html')));
app.get(['/admin', '/admin/dashboard', '/admin.html'], (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));
app.get(['/logs', '/logs.html'], (req, res) => res.sendFile(path.join(__dirname, 'logs.html')));

// Wildcard HTML fallback
app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api/')) {
    return res.sendFile(path.join(__dirname, 'index.html'));
  }
  next();
});

// 404 for unmatched API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: 'API endpoint not found.' });
});

// Centralized Production Error Handler
app.use((err, req, res, next) => {
  console.error('[Unhandled Server Error]:', err);
  const status = err.status || 500;
  const message = process.env.NODE_ENV === 'production'
    ? 'An unexpected internal server error occurred.'
    : err.message || 'Server error';
  res.status(status).json({ error: message });
});

// ── Startup ──────────────────────────────────────────────
async function start() {
  try {
    await ensureDb();
    app.listen(PORT, HOST, () => {
      console.log(`====================================================`);
      console.log(`  AttendPro Production Server Running               `);
      console.log(`  Database: MySQL (${db.getDatabaseName()})         `);
      console.log(`  URL:      http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT} `);
      console.log(`====================================================`);
    });
  } catch (err) {
    console.error('CRITICAL: Server initialization failed:', err);
    process.exit(1);
  }
}

if (require.main === module) {
  start();
}

module.exports = app;
