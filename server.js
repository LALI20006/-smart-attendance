require('dotenv').config();

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');
const nodemailer = require('nodemailer');
const initSqlJs = require('sql.js');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const APP_URL = process.env.APP_URL || 'https://attendance.com';
const dbPath = path.join(__dirname, 'attendance.db');
const certPath = path.join(__dirname, 'certs', 'server.cert.pem');
const keyPath = path.join(__dirname, 'certs', 'server.key.pem');

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

let db;

function createTransporter() {
  const host = process.env.MAIL_HOST;
  const user = process.env.MAIL_USER;
  const pass = process.env.MAIL_PASS;

  if (!host || !user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port: Number(process.env.MAIL_PORT || 587),
    secure: String(process.env.MAIL_SECURE || 'false') === 'true',
    auth: { user, pass },
  });
}

function hashPassword(password) {
  return crypto.createHash('sha256').update(String(password)).digest('hex');
}

function saveDatabase() {
  if (!db) return;
  const data = db.export();
  fs.writeFileSync(dbPath, Buffer.from(data));
}

function initializeDatabase() {
  return new Promise((resolve, reject) => {
    initSqlJs().then((SQL) => {
      const fileExists = fs.existsSync(dbPath);
      const fileBuffer = fileExists ? fs.readFileSync(dbPath) : null;
      db = new SQL.Database(fileBuffer || undefined);

      db.run(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          role TEXT NOT NULL,
          name TEXT NOT NULL,
          email TEXT NOT NULL UNIQUE,
          password TEXT NOT NULL,
          rollNo TEXT,
          createdAt TEXT NOT NULL,
          resetToken TEXT,
          resetExpiresAt TEXT
        )
      `);

      db.run(`
        CREATE TABLE IF NOT EXISTS active_sessions (
          id TEXT PRIMARY KEY,
          userId TEXT NOT NULL UNIQUE,
          role TEXT NOT NULL,
          email TEXT NOT NULL,
          name TEXT NOT NULL,
          loggedInAt TEXT NOT NULL,
          lastSeenAt TEXT NOT NULL
        )
      `);

      db.run(`
        CREATE TABLE IF NOT EXISTS login_logs (
          id TEXT PRIMARY KEY,
          userId TEXT NOT NULL,
          email TEXT NOT NULL,
          role TEXT NOT NULL,
          loggedInAt TEXT NOT NULL
        )
      `);

      const cols = [];
      const info = db.exec('PRAGMA table_info(users)');
      info[0]?.values?.forEach((row) => cols.push(row[1]));
      if (!cols.includes('resetToken')) db.run('ALTER TABLE users ADD COLUMN resetToken TEXT');
      if (!cols.includes('resetExpiresAt')) db.run('ALTER TABLE users ADD COLUMN resetExpiresAt TEXT');

      saveDatabase();
      resolve();
    }).catch(reject);
  });
}

function sanitizeUser(row) {
  if (!row) return null;
  const { password, resetToken, resetExpiresAt, ...safeUser } = row;
  return safeUser;
}

function generateToken() {
  return `reset_${Date.now()}_${crypto.randomBytes(16).toString('hex')}`;
}

async function sendResetEmail({ to, name, resetUrl }) {
  const transporter = createTransporter();
  const fromAddress = process.env.FROM_EMAIL || process.env.MAIL_USER || 'no-reply@attendx.local';

  if (!transporter) {
    return { sent: false, reason: 'SMTP not configured' };
  }

  const info = await transporter.sendMail({
    from: fromAddress,
    to,
    subject: 'AttendPro Password Reset',
    text: `Hello ${name || 'there'},\n\nWe received a password reset request for your AttendPro account.\nUse the following link to reset your password:\n${resetUrl}\n\nIf you did not request this, you can ignore this email.`,
    html: `
      <div style="font-family:Arial,sans-serif; color:#111827; line-height:1.6;">
        <h2 style="margin-bottom:12px;">AttendPro Password Reset</h2>
        <p>Hello ${name || 'there'},</p>
        <p>We received a password reset request for your AttendPro account.</p>
        <p><a href="${resetUrl}" style="color:#4f46e5;">Reset your password</a></p>
        <p>If you did not request this, you can ignore this email.</p>
      </div>
    `,
  });

  return { sent: true, messageId: info.messageId };
}

function getUsersFromDb() {
  const rows = [];
  const stmt = db.prepare('SELECT id, role, name, email, rollNo, createdAt FROM users ORDER BY createdAt DESC');
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

function pruneInactiveSessions() {
  const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const stmt = db.prepare('DELETE FROM active_sessions WHERE lastSeenAt < ?');
  stmt.bind([cutoff]);
  stmt.step();
  stmt.free();
  saveDatabase();
}

function getOnlineUsers() {
  pruneInactiveSessions();
  const rows = [];
  const stmt = db.prepare('SELECT id, userId, role, email, name, loggedInAt, lastSeenAt FROM active_sessions ORDER BY loggedInAt DESC');
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

function trackOnlineUser(user) {
  if (!user || !user.id || !user.email || !user.role) {
    return null;
  }

  const now = new Date().toISOString();
  const stmt = db.prepare('INSERT OR REPLACE INTO active_sessions (id, userId, role, email, name, loggedInAt, lastSeenAt) VALUES (?, ?, ?, ?, ?, ?, ?)');
  stmt.bind([user.id, user.id, user.role, user.email, user.name || 'User', now, now]);
  stmt.step();
  stmt.free();
  saveDatabase();
  return getOnlineUsers();
}

function removeOnlineUser(userId) {
  if (!userId) return null;
  const stmt = db.prepare('DELETE FROM active_sessions WHERE userId = ?');
  stmt.bind([String(userId)]);
  stmt.step();
  stmt.free();
  saveDatabase();
  return getOnlineUsers();
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true, message: 'Attendance API is running' });
});

app.get('/api/users', (req, res) => {
  try {
    res.json({ users: getUsersFromDb() });
  } catch (error) {
    res.status(500).json({ error: 'Unable to fetch users.' });
  }
});

app.post('/api/signup', (req, res) => {
  const { role, name, email, password, rollNo = '' } = req.body || {};

  if (!['student', 'faculty'].includes(role)) {
    return res.status(400).json({ error: 'Role must be student or faculty.' });
  }

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Please fill in all required fields.' });
  }

  const trimmedName = String(name).trim();
  const normalizedEmail = String(email).trim().toLowerCase();
  const trimmedPassword = String(password);
  const trimmedRollNo = String(rollNo || '').trim();

  if (trimmedPassword.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE LOWER(email) = ?');
  existing.bind([normalizedEmail]);
  if (existing.step()) {
    existing.free();
    return res.status(409).json({ error: 'An account with this email already exists.' });
  }
  existing.free();

  const userId = `${role}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
  const createdAt = new Date().toISOString();

  try {
    const stmt = db.prepare(
      'INSERT INTO users (id, role, name, email, password, rollNo, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    stmt.bind([userId, role, trimmedName, normalizedEmail, hashPassword(trimmedPassword), trimmedRollNo || null, createdAt]);
    stmt.step();
    stmt.free();
    saveDatabase();

    const newUser = {
      id: userId,
      role,
      name: trimmedName,
      email: normalizedEmail,
      rollNo: trimmedRollNo || null,
      createdAt,
    };

    return res.status(201).json({ user: newUser, message: 'User created successfully.' });
  } catch (error) {
    return res.status(500).json({ error: 'Could not create the user account.' });
  }
});

app.post('/api/login', (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const hashedPassword = hashPassword(String(password));

  try {
    const stmt = db.prepare('SELECT * FROM users WHERE LOWER(email) = ? AND password = ?');
    stmt.bind([normalizedEmail, hashedPassword]);

    if (!stmt.step()) {
      stmt.free();
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const row = stmt.getAsObject();
    stmt.free();
    const safeUser = sanitizeUser(row);
    trackOnlineUser(safeUser);

    // Log the login event
    const logId = `log_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
    const now = new Date().toISOString();
    const logStmt = db.prepare('INSERT INTO login_logs (id, userId, email, role, loggedInAt) VALUES (?, ?, ?, ?, ?)');
    logStmt.bind([logId, safeUser.id, safeUser.email, safeUser.role, now]);
    logStmt.step();
    logStmt.free();
    saveDatabase();

    return res.json({ user: safeUser, onlineUsers: getOnlineUsers().length });
  } catch (error) {
    return res.status(500).json({ error: 'Login failed.' });
  }
});

app.get('/api/login-logs', (req, res) => {
  try {
    const rows = [];
    const stmt = db.prepare('SELECT id, userId, email, role, loggedInAt FROM login_logs ORDER BY loggedInAt DESC');
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
    stmt.free();
    return res.json({ logs: rows });
  } catch (error) {
    return res.status(500).json({ error: 'Unable to fetch login logs.' });
  }
});

app.get('/api/online-users', (req, res) => {
  try {
    const users = getOnlineUsers();
    return res.json({ total: users.length, users });
  } catch (error) {
    return res.status(500).json({ error: 'Unable to fetch online users.' });
  }
});

app.post('/api/heartbeat', (req, res) => {
  const { userId } = req.body || {};

  if (!userId) {
    return res.status(400).json({ error: 'User id is required.' });
  }

  try {
    const now = new Date().toISOString();
    const stmt = db.prepare('UPDATE active_sessions SET lastSeenAt = ? WHERE userId = ?');
    stmt.bind([now, String(userId)]);
    stmt.step();
    stmt.free();
    saveDatabase();

    const users = getOnlineUsers();
    return res.json({ total: users.length, users });
  } catch (error) {
    return res.status(500).json({ error: 'Unable to update presence.' });
  }
});

app.post('/api/logout', (req, res) => {
  const { userId } = req.body || {};

  if (!userId) {
    return res.status(400).json({ error: 'User id is required.' });
  }

  try {
    const users = removeOnlineUser(userId);
    return res.json({ success: true, total: users.length, users });
  } catch (error) {
    return res.status(500).json({ error: 'Unable to log out user.' });
  }
});

app.post('/api/request-reset', async (req, res) => {
  const { email } = req.body || {};

  if (!email) {
    return res.status(400).json({ error: 'Email is required.' });
  }

  const normalizedEmail = String(email).trim().toLowerCase();

  try {
    const stmt = db.prepare('SELECT * FROM users WHERE LOWER(email) = ?');
    stmt.bind([normalizedEmail]);

    if (!stmt.step()) {
      stmt.free();
      return res.status(404).json({ error: 'Email not found in our system.' });
    }

    const row = stmt.getAsObject();
    stmt.free();

    const token = generateToken();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    const update = db.prepare('UPDATE users SET resetToken = ?, resetExpiresAt = ? WHERE id = ?');
    update.bind([token, expiresAt, row.id]);
    update.step();
    update.free();
    saveDatabase();

    const resetUrl = `${APP_URL}/reset-password.html?token=${encodeURIComponent(token)}`;
    const mailResult = await sendResetEmail({ to: normalizedEmail, name: row.name, resetUrl });

    return res.json({
      message: mailResult.sent ? 'Reset email sent successfully.' : 'Reset link generated successfully.',
      resetUrl,
      resetToken: token,
      email: normalizedEmail,
      mailSent: mailResult.sent,
    });
  } catch (error) {
    return res.status(500).json({ error: 'Unable to generate reset link.' });
  }
});

app.post('/api/reset-password', (req, res) => {
  const { token, password } = req.body || {};

  if (!token || !password) {
    return res.status(400).json({ error: 'Reset token and password are required.' });
  }

  const trimmedPassword = String(password);
  if (trimmedPassword.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }

  try {
    const stmt = db.prepare('SELECT * FROM users WHERE resetToken = ?');
    stmt.bind([String(token)]);

    if (!stmt.step()) {
      stmt.free();
      return res.status(400).json({ error: 'Invalid or expired reset link.' });
    }

    const row = stmt.getAsObject();
    stmt.free();

    if (!row.resetExpiresAt || new Date(row.resetExpiresAt).getTime() < Date.now()) {
      return res.status(400).json({ error: 'Your reset link has expired. Please request a new one.' });
    }

    const update = db.prepare('UPDATE users SET password = ?, resetToken = NULL, resetExpiresAt = NULL WHERE id = ?');
    update.bind([hashPassword(trimmedPassword), row.id]);
    update.step();
    update.free();
    saveDatabase();

    return res.json({ message: 'Password reset successfully.' });
  } catch (error) {
    return res.status(500).json({ error: 'Could not reset password.' });
  }
});

app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

function startServer() {
  const certExists = fs.existsSync(certPath) && fs.existsSync(keyPath);

  if (certExists) {
    https.createServer({
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath),
    }, app).listen(PORT, HOST, () => {
      console.log(`AttendPro server running on https://${APP_URL.replace(/^https?:\/\//i, '')}:${PORT}`);
    });
    return;
  }

  app.listen(PORT, HOST, () => {
    console.log(`AttendPro server running on http://localhost:${PORT}`);
  });
}

initializeDatabase()
  .then(() => {
    startServer();
  })
  .catch((err) => {
    console.error('Database initialization failed:', err.message);
    process.exit(1);
  });
