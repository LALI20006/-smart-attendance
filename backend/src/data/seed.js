const bcrypt = require('bcryptjs');

const facultyList = [
  { id: 'fac-1', facultyId: 'FAC-1101', name: 'Dr. Aisha Khan', email: 'aisha@campus.edu', department: 'Computer Science', password: 'Faculty@123' },
  { id: 'fac-2', facultyId: 'FAC-1102', name: 'Prof. Daniel Reyes', email: 'daniel@campus.edu', department: 'Information Systems', password: 'Faculty@123' },
  { id: 'fac-3', facultyId: 'FAC-1103', name: 'Dr. Meera Nair', email: 'meera@campus.edu', department: 'Electronics', password: 'Faculty@123' }
];

const studentList = [
  { id: 'stu-1', studentId: 'STU-2024001', name: 'Aarav Mehta', email: 'aarav@campus.edu', course: 'B.Tech', department: 'Computer Science', semester: 5, section: 'A', password: 'Student@123' },
  { id: 'stu-2', studentId: 'STU-2024002', name: 'Bhavna Rao', email: 'bhavna@campus.edu', course: 'B.Tech', department: 'Computer Science', semester: 5, section: 'A', password: 'Student@123' },
  { id: 'stu-3', studentId: 'STU-2024003', name: 'Karan Singh', email: 'karan@campus.edu', course: 'B.Tech', department: 'Computer Science', semester: 5, section: 'A', password: 'Student@123' },
  { id: 'stu-4', studentId: 'STU-2024004', name: 'Diya Sharma', email: 'diya@campus.edu', course: 'B.Tech', department: 'Computer Science', semester: 5, section: 'A', password: 'Student@123' },
  { id: 'stu-5', studentId: 'STU-2024005', name: 'Rohan Das', email: 'rohan@campus.edu', course: 'B.Tech', department: 'Computer Science', semester: 5, section: 'A', password: 'Student@123' },
  { id: 'stu-6', studentId: 'STU-2024006', name: 'Ishita Sen', email: 'ishita@campus.edu', course: 'B.Tech', department: 'Computer Science', semester: 5, section: 'B', password: 'Student@123' },
  { id: 'stu-7', studentId: 'STU-2024007', name: 'Vikram Iyer', email: 'vikram@campus.edu', course: 'B.Tech', department: 'Computer Science', semester: 5, section: 'B', password: 'Student@123' },
  { id: 'stu-8', studentId: 'STU-2024008', name: 'Neha Joshi', email: 'neha@campus.edu', course: 'B.Tech', department: 'Computer Science', semester: 5, section: 'B', password: 'Student@123' },
  { id: 'stu-9', studentId: 'STU-2024009', name: 'Aditya Verma', email: 'aditya@campus.edu', course: 'B.Tech', department: 'Information Systems', semester: 6, section: 'A', password: 'Student@123' },
  { id: 'stu-10', studentId: 'STU-2024010', name: 'Sana Qureshi', email: 'sana@campus.edu', course: 'B.Tech', department: 'Information Systems', semester: 6, section: 'A', password: 'Student@123' },
  { id: 'stu-11', studentId: 'STU-2024011', name: 'Harsh Malik', email: 'harsh@campus.edu', course: 'B.Tech', department: 'Information Systems', semester: 6, section: 'A', password: 'Student@123' },
  { id: 'stu-12', studentId: 'STU-2024012', name: 'Pooja Mishra', email: 'pooja@campus.edu', course: 'B.Tech', department: 'Information Systems', semester: 6, section: 'B', password: 'Student@123' },
  { id: 'stu-13', studentId: 'STU-2024013', name: 'Yash Sethi', email: 'yash@campus.edu', course: 'B.Tech', department: 'Information Systems', semester: 6, section: 'B', password: 'Student@123' },
  { id: 'stu-14', studentId: 'STU-2024014', name: 'Tanya Nair', email: 'tanya@campus.edu', course: 'B.Tech', department: 'Electronics', semester: 4, section: 'A', password: 'Student@123' },
  { id: 'stu-15', studentId: 'STU-2024015', name: 'Riya Kapoor', email: 'riya@campus.edu', course: 'B.Tech', department: 'Electronics', semester: 4, section: 'A', password: 'Student@123' },
  { id: 'stu-16', studentId: 'STU-2024016', name: 'Manav Gupta', email: 'manav@campus.edu', course: 'B.Tech', department: 'Electronics', semester: 4, section: 'B', password: 'Student@123' },
  { id: 'stu-17', studentId: 'STU-2024017', name: 'Ananya Bose', email: 'ananya@campus.edu', course: 'B.Tech', department: 'Electronics', semester: 4, section: 'B', password: 'Student@123' },
  { id: 'stu-18', studentId: 'STU-2024018', name: 'Nikhil Jain', email: 'nikhil@campus.edu', course: 'B.Tech', department: 'Electronics', semester: 4, section: 'B', password: 'Student@123' },
  { id: 'stu-19', studentId: 'STU-2024019', name: 'Lavanya Desai', email: 'lavanya@campus.edu', course: 'B.Tech', department: 'Computer Science', semester: 5, section: 'C', password: 'Student@123' },
  { id: 'stu-20', studentId: 'STU-2024020', name: 'Rohit Shah', email: 'rohit@campus.edu', course: 'B.Tech', department: 'Computer Science', semester: 5, section: 'C', password: 'Student@123' }
];

const subjects = [
  { id: 'sub-1', subjectCode: 'CS201', subjectName: 'Algorithm Design', facultyId: 'fac-1', semester: 5 },
  { id: 'sub-2', subjectCode: 'CS202', subjectName: 'Operating System Concepts', facultyId: 'fac-1', semester: 5 },
  { id: 'sub-3', subjectCode: 'CS203', subjectName: 'Software Quality', facultyId: 'fac-2', semester: 6 },
  { id: 'sub-4', subjectCode: 'IS204', subjectName: 'Network Security', facultyId: 'fac-2', semester: 6 },
  { id: 'sub-5', subjectCode: 'EC205', subjectName: 'Embedded Logic Design', facultyId: 'fac-3', semester: 4 }
];

const enrollments = [
  { id: 'enr-1', studentId: 'stu-1', subjectId: 'sub-1' },
  { id: 'enr-2', studentId: 'stu-1', subjectId: 'sub-3' },
  { id: 'enr-3', studentId: 'stu-1', subjectId: 'sub-5' },
  { id: 'enr-4', studentId: 'stu-2', subjectId: 'sub-1' },
  { id: 'enr-5', studentId: 'stu-2', subjectId: 'sub-2' },
  { id: 'enr-6', studentId: 'stu-3', subjectId: 'sub-1' },
  { id: 'enr-7', studentId: 'stu-3', subjectId: 'sub-4' },
  { id: 'enr-8', studentId: 'stu-4', subjectId: 'sub-2' },
  { id: 'enr-9', studentId: 'stu-4', subjectId: 'sub-3' },
  { id: 'enr-10', studentId: 'stu-5', subjectId: 'sub-1' },
  { id: 'enr-11', studentId: 'stu-5', subjectId: 'sub-4' },
  { id: 'enr-12', studentId: 'stu-6', subjectId: 'sub-1' },
  { id: 'enr-13', studentId: 'stu-6', subjectId: 'sub-2' },
  { id: 'enr-14', studentId: 'stu-7', subjectId: 'sub-3' },
  { id: 'enr-15', studentId: 'stu-7', subjectId: 'sub-5' },
  { id: 'enr-16', studentId: 'stu-8', subjectId: 'sub-2' },
  { id: 'enr-17', studentId: 'stu-8', subjectId: 'sub-4' },
  { id: 'enr-18', studentId: 'stu-9', subjectId: 'sub-4' },
  { id: 'enr-19', studentId: 'stu-9', subjectId: 'sub-3' },
  { id: 'enr-20', studentId: 'stu-10', subjectId: 'sub-4' },
  { id: 'enr-21', studentId: 'stu-10', subjectId: 'sub-1' },
  { id: 'enr-22', studentId: 'stu-11', subjectId: 'sub-3' },
  { id: 'enr-23', studentId: 'stu-11', subjectId: 'sub-2' },
  { id: 'enr-24', studentId: 'stu-12', subjectId: 'sub-4' },
  { id: 'enr-25', studentId: 'stu-12', subjectId: 'sub-5' },
  { id: 'enr-26', studentId: 'stu-13', subjectId: 'sub-3' },
  { id: 'enr-27', studentId: 'stu-14', subjectId: 'sub-5' },
  { id: 'enr-28', studentId: 'stu-15', subjectId: 'sub-5' },
  { id: 'enr-29', studentId: 'stu-16', subjectId: 'sub-5' },
  { id: 'enr-30', studentId: 'stu-17', subjectId: 'sub-5' },
  { id: 'enr-31', studentId: 'stu-18', subjectId: 'sub-5' },
  { id: 'enr-32', studentId: 'stu-19', subjectId: 'sub-1' },
  { id: 'enr-33', studentId: 'stu-20', subjectId: 'sub-2' }
];

const makeHash = (plain) => bcrypt.hashSync(plain, 10);

const adminUser = {
  id: 'admin-1', name: 'Admin User', email: 'admin@campus.edu', password: makeHash('Admin@123'), role: 'admin'
};

const users = [
  adminUser,
  ...facultyList.map((faculty) => ({
    id: faculty.id,
    name: faculty.name,
    email: faculty.email,
    password: makeHash(faculty.password),
    role: 'faculty',
    facultyId: faculty.facultyId,
    department: faculty.department
  })),
  ...studentList.map((student) => ({
    id: student.id,
    name: student.name,
    email: student.email,
    password: makeHash(student.password),
    role: 'student',
    studentId: student.studentId,
    course: student.course,
    department: student.department,
    semester: student.semester,
    section: student.section
  }))
];

const sessions = [
  { id: 'session-1', subjectId: 'sub-1', facultyId: 'fac-1', sessionCode: 'ALG4127', qrCode: 'ALG4127', startTime: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), endTime: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(), status: 'completed' },
  { id: 'session-2', subjectId: 'sub-2', facultyId: 'fac-1', sessionCode: 'OPS2951', qrCode: 'OPS2951', startTime: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(), endTime: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(), status: 'completed' },
  { id: 'session-3', subjectId: 'sub-3', facultyId: 'fac-2', sessionCode: 'SWQ3714', qrCode: 'SWQ3714', startTime: new Date(Date.now() - 18 * 60 * 60 * 1000).toISOString(), endTime: new Date(Date.now() - 16 * 60 * 60 * 1000).toISOString(), status: 'completed' },
  { id: 'session-4', subjectId: 'sub-4', facultyId: 'fac-2', sessionCode: 'NET8672', qrCode: 'NET8672', startTime: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(), endTime: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), status: 'completed' },
  { id: 'session-5', subjectId: 'sub-5', facultyId: 'fac-3', sessionCode: 'EMB9844', qrCode: 'EMB9844', startTime: new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString(), endTime: new Date(Date.now() - 28 * 60 * 60 * 1000).toISOString(), status: 'completed' },
  { id: 'session-6', subjectId: 'sub-1', facultyId: 'fac-1', sessionCode: 'ALG8457', qrCode: 'ALG8457', startTime: new Date(Date.now() + 30 * 60 * 1000).toISOString(), endTime: new Date(Date.now() + 90 * 60 * 1000).toISOString(), status: 'active' }
];

const attendance = [
  { id: 'att-1', sessionId: 'session-1', studentId: 'stu-1', subjectId: 'sub-1', date: '2026-08-14', time: '09:00', status: 'present' },
  { id: 'att-2', sessionId: 'session-1', studentId: 'stu-2', subjectId: 'sub-1', date: '2026-08-14', time: '09:00', status: 'present' },
  { id: 'att-3', sessionId: 'session-1', studentId: 'stu-3', subjectId: 'sub-1', date: '2026-08-14', time: '09:00', status: 'absent' },
  { id: 'att-4', sessionId: 'session-1', studentId: 'stu-4', subjectId: 'sub-1', date: '2026-08-14', time: '09:00', status: 'present' },
  { id: 'att-5', sessionId: 'session-1', studentId: 'stu-5', subjectId: 'sub-1', date: '2026-08-14', time: '09:00', status: 'present' },
  { id: 'att-6', sessionId: 'session-1', studentId: 'stu-6', subjectId: 'sub-1', date: '2026-08-14', time: '09:00', status: 'absent' },
  { id: 'att-7', sessionId: 'session-2', studentId: 'stu-1', subjectId: 'sub-2', date: '2026-08-12', time: '11:00', status: 'present' },
  { id: 'att-8', sessionId: 'session-2', studentId: 'stu-2', subjectId: 'sub-2', date: '2026-08-12', time: '11:00', status: 'present' },
  { id: 'att-9', sessionId: 'session-2', studentId: 'stu-3', subjectId: 'sub-2', date: '2026-08-12', time: '11:00', status: 'present' },
  { id: 'att-10', sessionId: 'session-2', studentId: 'stu-4', subjectId: 'sub-2', date: '2026-08-12', time: '11:00', status: 'absent' },
  { id: 'att-11', sessionId: 'session-3', studentId: 'stu-1', subjectId: 'sub-3', date: '2026-08-10', time: '14:00', status: 'present' },
  { id: 'att-12', sessionId: 'session-3', studentId: 'stu-2', subjectId: 'sub-3', date: '2026-08-10', time: '14:00', status: 'present' },
  { id: 'att-13', sessionId: 'session-3', studentId: 'stu-3', subjectId: 'sub-3', date: '2026-08-10', time: '14:00', status: 'absent' },
  { id: 'att-14', sessionId: 'session-3', studentId: 'stu-9', subjectId: 'sub-3', date: '2026-08-10', time: '14:00', status: 'present' },
  { id: 'att-15', sessionId: 'session-4', studentId: 'stu-9', subjectId: 'sub-4', date: '2026-08-09', time: '10:00', status: 'present' },
  { id: 'att-16', sessionId: 'session-4', studentId: 'stu-10', subjectId: 'sub-4', date: '2026-08-09', time: '10:00', status: 'present' },
  { id: 'att-17', sessionId: 'session-4', studentId: 'stu-11', subjectId: 'sub-4', date: '2026-08-09', time: '10:00', status: 'absent' },
  { id: 'att-18', sessionId: 'session-4', studentId: 'stu-12', subjectId: 'sub-4', date: '2026-08-09', time: '10:00', status: 'present' },
  { id: 'att-19', sessionId: 'session-5', studentId: 'stu-14', subjectId: 'sub-5', date: '2026-08-08', time: '13:00', status: 'present' },
  { id: 'att-20', sessionId: 'session-5', studentId: 'stu-15', subjectId: 'sub-5', date: '2026-08-08', time: '13:00', status: 'absent' },
  { id: 'att-21', sessionId: 'session-5', studentId: 'stu-16', subjectId: 'sub-5', date: '2026-08-08', time: '13:00', status: 'present' },
  { id: 'att-22', sessionId: 'session-5', studentId: 'stu-17', subjectId: 'sub-5', date: '2026-08-08', time: '13:00', status: 'present' },
  { id: 'att-23', sessionId: 'session-6', studentId: 'stu-1', subjectId: 'sub-1', date: '2026-08-16', time: '16:00', status: 'present' },
  { id: 'att-24', sessionId: 'session-6', studentId: 'stu-2', subjectId: 'sub-1', date: '2026-08-16', time: '16:00', status: 'present' },
  { id: 'att-25', sessionId: 'session-6', studentId: 'stu-3', subjectId: 'sub-1', date: '2026-08-16', time: '16:00', status: 'pending' }
];

const notifications = [
  { id: 'n-1', userId: 'stu-1', title: 'Attendance update', message: 'Your attendance in Algorithm Design is currently 76%.', isRead: false },
  { id: 'n-2', userId: 'stu-1', title: 'Class reminder', message: 'New session available for Algorithm Design.', isRead: false },
  { id: 'n-3', userId: 'fac-1', title: 'Low-attendance report', message: 'Two students in your subject need intervention.', isRead: false },
  { id: 'n-4', userId: 'admin-1', title: 'System summary', message: 'Attendance dashboard refreshed successfully.', isRead: false }
];

const seedData = {
  users,
  students: studentList,
  faculty: facultyList,
  subjects,
  enrollments,
  sessions,
  attendance,
  notifications
};

module.exports = { seedData };
