require('dotenv').config();
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

const databaseUrl = process.env.DATABASE_URL || process.env.MYSQL_URL || '';

let parsedConfig = null;
if (databaseUrl && (databaseUrl.startsWith('mysql://') || databaseUrl.startsWith('mysql2://'))) {
  try {
    const u = new URL(databaseUrl);
    parsedConfig = {
      host: u.hostname,
      port: Number(u.port) || 3306,
      user: decodeURIComponent(u.username),
      password: decodeURIComponent(u.password),
      database: u.pathname.replace(/^\//, '') || 'smart_attendance',
      ssl: u.searchParams.get('ssl') === 'false' ? false : (u.hostname !== 'localhost' && u.hostname !== '127.0.0.1' ? { rejectUnauthorized: false } : undefined),
    };
  } catch (e) {
    console.warn('[Database] Could not parse DATABASE_URL, using individual env vars:', e.message);
  }
}

const MYSQL_HOST = parsedConfig?.host || process.env.MYSQL_HOST || 'localhost';
const MYSQL_PORT = parsedConfig?.port || Number(process.env.MYSQL_PORT || 3306);
const MYSQL_USER = parsedConfig?.user || process.env.MYSQL_USER || 'root';
const MYSQL_PASSWORD = parsedConfig?.password || process.env.MYSQL_PASSWORD || 'Lakshmi@25';
const MYSQL_DATABASE = parsedConfig?.database || process.env.MYSQL_DATABASE || 'smart_attendance';
const MYSQL_SSL = parsedConfig?.ssl || (process.env.MYSQL_SSL === 'true' || (MYSQL_HOST !== 'localhost' && MYSQL_HOST !== '127.0.0.1') ? { rejectUnauthorized: false } : undefined);

let pool = null;
let mode = 'mysql';

function hashPassword(password) {
  return bcrypt.hashSync(String(password), 10);
}

// Unified query runner: returns { rows: Array, insertId, affectedRows, rowCount }
async function query(sqlText, params = []) {
  if (!pool) {
    throw new Error('Database not initialized. Please call initDatabase() first.');
  }

  // Convert postgres style $1, $2, ... to ? for MySQL
  let cleanSql = sqlText.replace(/\$(\d+)/g, '?');

  try {
    const [result, fields] = await pool.query(cleanSql, params);

    if (Array.isArray(result)) {
      return { rows: result, fields, rowCount: result.length };
    } else {
      return {
        rows: [],
        insertId: result.insertId,
        affectedRows: result.affectedRows,
        rowCount: result.affectedRows,
      };
    }
  } catch (err) {
    console.error('[MySQL Error]:', err.message, 'SQL:', cleanSql.slice(0, 120));
    throw err;
  }
}

async function ensureUsersTable() {
  const [tables] = await pool.query(
    "SELECT TABLE_NAME FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'users'"
  );

  if (tables.length === 0) {
    console.log('[Database] Creating users table...');
    await query(`CREATE TABLE users (
      id INT PRIMARY KEY AUTO_INCREMENT,
      name VARCHAR(100) NOT NULL,
      email VARCHAR(150) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      role ENUM('student','faculty','admin') NOT NULL,
      is_active BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      last_login_at TIMESTAMP NULL,
      last_logout_at TIMESTAMP NULL,
      INDEX idx_email (email),
      INDEX idx_role (role),
      INDEX idx_is_active (is_active)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    return;
  }

  // Users table exists. Check column types and ensure compatibility
  const [cols] = await pool.query(
    "SELECT COLUMN_NAME, DATA_TYPE FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'users'"
  );
  const colMap = new Map(cols.map((c) => [c.COLUMN_NAME.toLowerCase(), c.DATA_TYPE.toLowerCase()]));

  const idType = colMap.get('id');
  if (idType && idType !== 'int' && idType !== 'bigint') {
    const [countRows] = await pool.query('SELECT count(*) as cnt FROM users');
    const cnt = Number(countRows[0]?.cnt || 0);
    if (cnt === 0) {
      console.log('[Database] Recreating empty users table with auto-increment INT id...');
      await pool.query('DROP TABLE users');
      return ensureUsersTable();
    }
  }

  // Safely ensure all required columns exist
  const columnDefs = [
    { name: 'password_hash', ddl: 'ADD COLUMN password_hash VARCHAR(255) NOT NULL' },
    { name: 'role', ddl: "ADD COLUMN role ENUM('student','faculty','admin') NOT NULL DEFAULT 'student'" },
    { name: 'is_active', ddl: 'ADD COLUMN is_active BOOLEAN DEFAULT FALSE' },
    { name: 'created_at', ddl: 'ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP' },
    { name: 'updated_at', ddl: 'ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP' },
    { name: 'last_login_at', ddl: 'ADD COLUMN last_login_at TIMESTAMP NULL' },
    { name: 'last_logout_at', ddl: 'ADD COLUMN last_logout_at TIMESTAMP NULL' },
  ];

  for (const col of columnDefs) {
    if (!colMap.has(col.name)) {
      try {
        await pool.query(`ALTER TABLE users ${col.ddl}`);
        console.log(`[Database] Added missing column users.${col.name}`);
      } catch (e) {
        console.warn(`[Database] Column add note for users.${col.name}:`, e.message);
      }
    }
  }
}

async function createSchema() {
  console.log(`[Database] Ensuring MySQL database '${MYSQL_DATABASE}' tables exist...`);

  // Step 1: Ensure users table exists with correct columns
  await ensureUsersTable();

  // Step 2: Ensure dependent tables exist with indexes (independent of foreign key engine restrictions)
  const DDL = [
    // 2. user_sessions table
    `CREATE TABLE IF NOT EXISTS user_sessions (
      id INT PRIMARY KEY AUTO_INCREMENT,
      user_id INT NOT NULL,
      login_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      logout_time TIMESTAMP NULL,
      last_activity TIMESTAMP NULL,
      status ENUM('ACTIVE','LOGGED_OUT','EXPIRED') DEFAULT 'ACTIVE',
      ip_address VARCHAR(45) NULL,
      device VARCHAR(100) NULL,
      browser VARCHAR(100) NULL,
      INDEX idx_user_id (user_id),
      INDEX idx_status (status),
      INDEX idx_login_time (login_time),
      INDEX idx_last_activity (last_activity)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    // 3. subjects catalog
    `CREATE TABLE IF NOT EXISTS subjects (
      id VARCHAR(64) PRIMARY KEY,
      subject_code VARCHAR(32) UNIQUE NOT NULL,
      subject_name VARCHAR(150) NOT NULL,
      faculty_id INT NULL,
      semester INT DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_faculty_id (faculty_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    // 4. enrollments
    `CREATE TABLE IF NOT EXISTS enrollments (
      id VARCHAR(64) PRIMARY KEY,
      student_id INT NOT NULL,
      subject_id VARCHAR(64) NOT NULL,
      enrolled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT unique_student_subject UNIQUE (student_id, subject_id),
      INDEX idx_student_id (student_id),
      INDEX idx_subject_id (subject_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    // 5. attendance_sessions
    `CREATE TABLE IF NOT EXISTS attendance_sessions (
      id VARCHAR(64) PRIMARY KEY,
      subject_id VARCHAR(64) NOT NULL,
      faculty_id INT NOT NULL,
      session_code VARCHAR(16) NOT NULL,
      qr_code TEXT NOT NULL,
      topic VARCHAR(255) DEFAULT 'Lecture',
      start_time TIMESTAMP NOT NULL,
      end_time TIMESTAMP NOT NULL,
      status VARCHAR(32) DEFAULT 'active',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_faculty_id (faculty_id),
      INDEX idx_subject_id (subject_id),
      INDEX idx_session_code (session_code)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    // 6. attendance records
    `CREATE TABLE IF NOT EXISTS attendance (
      id VARCHAR(64) PRIMARY KEY,
      session_id VARCHAR(64) NOT NULL,
      student_id INT NOT NULL,
      subject_id VARCHAR(64) NOT NULL,
      date VARCHAR(16) NOT NULL,
      time VARCHAR(16) NOT NULL,
      status VARCHAR(32) DEFAULT 'present',
      gps_valid BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT unique_session_student UNIQUE (session_id, student_id),
      INDEX idx_session_id (session_id),
      INDEX idx_student_id (student_id),
      INDEX idx_subject_id (subject_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    // 7. notifications
    `CREATE TABLE IF NOT EXISTS notifications (
      id VARCHAR(64) PRIMARY KEY,
      user_id INT NOT NULL,
      title VARCHAR(255) NOT NULL,
      message TEXT NOT NULL,
      is_read BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_user_id (user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  ];

  for (const statement of DDL) {
    await query(statement);
  }

  console.log('[Database] MySQL tables verified.');
}

async function seedData() {
  // Ensure basic subjects catalog exists
  const subCheck = await query('SELECT count(*) as count FROM subjects');
  if (Number(subCheck.rows[0]?.count || 0) === 0) {
    const defaultSubjects = [
      { id: 'sub-1', code: 'CS201', name: 'Algorithm Design', sem: 5 },
      { id: 'sub-2', code: 'CS202', name: 'Operating Systems', sem: 5 },
      { id: 'sub-3', code: 'CS203', name: 'Software Engineering', sem: 6 },
      { id: 'sub-4', code: 'IS204', name: 'Network Security', sem: 6 },
      { id: 'sub-5', code: 'EC205', name: 'Embedded Systems', sem: 4 },
    ];
    for (const s of defaultSubjects) {
      await query(
        'INSERT IGNORE INTO subjects (id, subject_code, subject_name, semester) VALUES (?, ?, ?, ?)',
        [s.id, s.code, s.name, s.sem]
      );
    }
  }

  // Seed demo users if no admin exists yet
  const check = await query('SELECT count(*) as count FROM users WHERE email = ?', ['admin@campus.edu']);
  const userCount = Number(check.rows[0]?.count || 0);
  if (userCount > 0) {
    return; // Already seeded
  }

  console.log('[Database] Seeding initial MySQL demo users...');

  // 1. Admin
  const adminHash = hashPassword('Admin@123');
  await query(
    'INSERT INTO users (name, email, password_hash, role, is_active) VALUES (?, ?, ?, ?, FALSE)',
    ['Campus Administrator', 'admin@campus.edu', adminHash, 'admin']
  );

  // 2. Faculty
  const facHash = hashPassword('Faculty@123');
  const facultyMembers = [
    { name: 'Dr. Aisha Khan', email: 'aisha@campus.edu' },
    { name: 'Prof. Daniel Reyes', email: 'daniel@campus.edu' },
    { name: 'Dr. Meera Nair', email: 'meera@campus.edu' },
  ];

  const facultyIds = [];
  for (const f of facultyMembers) {
    const res = await query(
      'INSERT INTO users (name, email, password_hash, role, is_active) VALUES (?, ?, ?, ?, FALSE)',
      [f.name, f.email, facHash, 'faculty']
    );
    facultyIds.push(res.insertId);
  }

  // 3. Students
  const stuHash = hashPassword('Student@123');
  const studentList = [
    { name: 'Aarav Mehta', email: 'aarav@campus.edu' },
    { name: 'Bhavna Rao', email: 'bhavna@campus.edu' },
    { name: 'Karan Singh', email: 'karan@campus.edu' },
    { name: 'Diya Sharma', email: 'diya@campus.edu' },
    { name: 'Rohan Das', email: 'rohan@campus.edu' },
    { name: 'Ishita Sen', email: 'ishita@campus.edu' },
    { name: 'Vikram Iyer', email: 'vikram@campus.edu' },
    { name: 'Neha Joshi', email: 'neha@campus.edu' },
    { name: 'Priya Verma', email: 'priya@campus.edu' },
    { name: 'Rahul Sharma', email: 'rahul@campus.edu' },
    { name: 'Anil Kumar', email: 'anil@campus.edu' },
  ];

  const studentIds = [];
  for (const s of studentList) {
    const res = await query(
      'INSERT INTO users (name, email, password_hash, role, is_active) VALUES (?, ?, ?, ?, FALSE)',
      [s.name, s.email, stuHash, 'student']
    );
    studentIds.push(res.insertId);
  }

  // 4. Subjects
  const subjects = [
    { id: 'sub-1', code: 'CS201', name: 'Algorithm Design', facIndex: 0, sem: 5 },
    { id: 'sub-2', code: 'CS202', name: 'Operating Systems', facIndex: 0, sem: 5 },
    { id: 'sub-3', code: 'CS203', name: 'Software Engineering', facIndex: 1, sem: 6 },
    { id: 'sub-4', code: 'IS204', name: 'Network Security', facIndex: 1, sem: 6 },
    { id: 'sub-5', code: 'EC205', name: 'Embedded Systems', facIndex: 2, sem: 4 },
  ];

  for (const s of subjects) {
    await query(
      'INSERT INTO subjects (id, subject_code, subject_name, faculty_id, semester) VALUES (?, ?, ?, ?, ?)',
      [s.id, s.code, s.name, facultyIds[s.facIndex] || facultyIds[0], s.sem]
    );
  }

  // 5. Enrollments
  for (const stuId of studentIds) {
    await query(
      'INSERT IGNORE INTO enrollments (id, student_id, subject_id) VALUES (?, ?, ?)',
      [`enr-${stuId}-sub-1`, stuId, 'sub-1']
    );
    await query(
      'INSERT IGNORE INTO enrollments (id, student_id, subject_id) VALUES (?, ?, ?)',
      [`enr-${stuId}-sub-2`, stuId, 'sub-2']
    );
  }

  // 6. Historical sessions & sample attendance
  const sess1Id = 'sess-hist-1';
  await query(
    `INSERT IGNORE INTO attendance_sessions (id, subject_id, faculty_id, session_code, qr_code, topic, start_time, end_time, status)
     VALUES (?, ?, ?, ?, ?, ?, NOW() - INTERVAL 2 DAY, NOW() - INTERVAL 2 DAY + INTERVAL 1 HOUR, 'completed')`,
    [sess1Id, 'sub-1', facultyIds[0], 'CS2010', 'CS2010', 'Data Structures & Trees']
  );

  for (let i = 0; i < studentIds.length; i++) {
    const sId = studentIds[i];
    const status = i % 4 === 0 ? 'absent' : 'present';
    await query(
      `INSERT IGNORE INTO attendance (id, session_id, student_id, subject_id, date, time, status, gps_valid)
       VALUES (?, ?, ?, ?, CURDATE() - INTERVAL 2 DAY, '10:00:00', ?, TRUE)`,
      [`att-hist-1-${sId}`, sess1Id, sId, 'sub-1', status]
    );
  }

  console.log('[Database] Initial MySQL seed completed successfully!');
}

async function initDatabase() {
  console.log(`[Database] Connecting to MySQL at ${MYSQL_HOST}:${MYSQL_PORT} (User: ${MYSQL_USER}, DB: ${MYSQL_DATABASE}, SSL: ${!!MYSQL_SSL})...`);

  // Step 1: In local dev, create database if it does not exist
  if (MYSQL_HOST === 'localhost' || MYSQL_HOST === '127.0.0.1') {
    try {
      const initConn = await mysql.createConnection({
        host: MYSQL_HOST,
        port: MYSQL_PORT,
        user: MYSQL_USER,
        password: MYSQL_PASSWORD,
        connectTimeout: 10000,
      });

      await initConn.query(
        `CREATE DATABASE IF NOT EXISTS \`${MYSQL_DATABASE}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`
      );
      await initConn.end();
    } catch (e) {
      console.warn('[Database] Local DB check note:', e.message);
    }
  }

  // Step 2: Create connection pool with database
  pool = mysql.createPool({
    host: MYSQL_HOST,
    port: MYSQL_PORT,
    user: MYSQL_USER,
    password: MYSQL_PASSWORD,
    database: MYSQL_DATABASE,
    ssl: MYSQL_SSL,
    waitForConnections: true,
    connectionLimit: 25,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
    timezone: 'Z',
  });

  // Test pool
  const [testRes] = await pool.query('SELECT 1 as connected');
  console.log(`[Database] Connected successfully to MySQL database '${MYSQL_DATABASE}'!`);

  // Step 3: Run schema and seed
  await createSchema();
  await seedData();
}

// ── Activity and Session Expiration Sweeper ───────────────────────
async function sweepExpiredSessions(timeoutMinutes = 30) {
  try {
    if (!pool) return;
    // Mark sessions expired where last_activity is older than timeoutMinutes
    await query(
      `UPDATE user_sessions
       SET status = 'EXPIRED'
       WHERE status = 'ACTIVE'
         AND last_activity < DATE_SUB(NOW(), INTERVAL ? MINUTE)`,
      [timeoutMinutes]
    );

    // Update users is_active = FALSE where they have no remaining ACTIVE sessions
    await query(
      `UPDATE users u
       SET is_active = FALSE
       WHERE is_active = TRUE
         AND NOT EXISTS (
           SELECT 1 FROM user_sessions s
           WHERE s.user_id = u.id AND s.status = 'ACTIVE'
         )`
    );
  } catch (err) {
    console.error('[Session Sweeper Error]:', err.message);
  }
}

module.exports = {
  query,
  initDatabase,
  getMode: () => 'mysql',
  getDatabaseName: () => MYSQL_DATABASE,
  hashPassword,
  sweepExpiredSessions,
};
