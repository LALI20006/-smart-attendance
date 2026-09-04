# 🎓 AttendPro — Smart Attendance Platform

[![Live Demo](https://img.shields.io/badge/Live_Demo-Vercel_24/7-brightgreen?style=for-the-badge&logo=vercel)](https://smart-attendance-kbq3.vercel.app/)
[![Database](https://img.shields.io/badge/Database-MySQL_/_TiDB_Cloud-00758F?style=for-the-badge&logo=mysql&logoColor=white)](https://tidbcloud.com)
[![Runtime](https://img.shields.io/badge/Node.js-18+-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)
[![Security](https://img.shields.io/badge/Security-JWT_+_bcrypt_+_SSL-blue?style=for-the-badge&logo=auth0&logoColor=white)](https://jwt.io)
[![License](https://img.shields.io/badge/License-MIT-purple?style=for-the-badge)](LICENSE)

> A modern, 24/7 cloud-native digital attendance and academic monitoring platform built for schools, colleges, and universities. Featuring dynamic QR code generation, mobile camera deep-linking, multi-year academic calendars, and persistent MySQL session audit trails.

🌐 **Live Production Website:** [https://smart-attendance-kbq3.vercel.app](https://smart-attendance-kbq3.vercel.app)

---

## 🌟 Key Features

### 👨‍🎓 Student Portal
* **One-Tap QR Attendance**: Scan faculty QR codes directly using your phone's native camera or the built-in scanner with automated GPS campus proximity validation.
* **Subject Analytics**: Visual attendance percentage rings with color-coded risk indicators.
* **4-Year Academic Degree Calendar**: Interactive live calendar spanning 2023–2029 with a complete 4-year degree overview (1st Year, 2nd Year, 3rd Year, Final Year) and daily attendance indicators.
* **Activity Stream**: Chronological history of attended lectures, subjects, topics, and timestamps.

### 👩‍🏫 Faculty Dashboard
* **Dynamic QR Code Sessions**: Launch time-expiring attendance sessions with randomized codes and custom domain deep-linking.
* **Live Check-In Roster**: Real-time polling roster showing students who check in with instant verification badges.
* **At-Risk Interventions**: Automatic detection of students below the 75% attendance threshold.
* **Exportable Reports**: Generate and download filtered attendance reports in standard CSV format.

### 🛡️ Administrator Control Center
* **Live Session Telemetry**: Monitor currently signed-in users, device types, browser information, and IP addresses.
* **Permanent Login/Logout Audit**: Detailed MySQL audit history tracking who registered, signed in, signed out, and total session counts.
* **Academic Curriculum Management**: Create, assign, and manage subjects, faculty allocations, and student directories.

---

## 🚀 Demo Accounts

You can test the live application immediately using the pre-configured credentials:

| Role | Email Address | Password | Permissions |
| :--- | :--- | :--- | :--- |
| **Administrator** | `admin@campus.edu` | `Password@123` | Full campus analytics, user management, audit logs |
| **Faculty Member** | `faculty@campus.edu` | `Password@123` | Session creation, QR generator, student monitoring |
| **Student** | `student@campus.edu` | `Password@123` | Attendance scanner, 4-year calendar, profile stats |

---

## 🏗️ Technical Architecture

```
User (Mobile Phone / Laptop / Tablet)
                │
                ▼  (HTTPS / 443 with TLS SSL)
   https://smart-attendance-kbq3.vercel.app  /  Custom Domain
                │
        [Vercel Global Edge CDN]
        ├── Static SPA Assets (HTML, CSS, JS from /public)
        └── Serverless Function Handler (/api/* -> api/index.js)
                │
                ▼  (Encrypted Express Middleware)
           [server.js]
        ├── JWT Authentication & bcrypt Hashing
        ├── Helmet Security Headers & Rate Limiting
        ├── Dynamic QR URL Deep-Linking
        └── Role-Based Access Control (RBAC)
                │
                ▼  (SSL TLS Connection)
   [TiDB Cloud Serverless MySQL (ap-southeast-1)]
        ├── users (Permanent user records)
        ├── user_sessions (Live login/logout session audit)
        ├── subjects (Course catalogue)
        ├── attendance_sessions (Active faculty sessions)
        └── attendance (Student check-in records)
```

---

## 💻 Tech Stack

* **Frontend**: HTML5, Vanilla CSS3 (Custom Design System with Glassmorphism, Dark-mode, and Micro-animations), JavaScript (ES6+), jsQR, QRCode.js
* **Backend API**: Node.js, Express.js, JSON Web Tokens (`jsonwebtoken`), `bcryptjs`, `helmet`, `morgan`, `express-rate-limit`
* **Database**: MySQL 8.0 Compatible (`mysql2`) / TiDB Cloud Serverless
* **Deployment & Hosting**: Vercel (Edge CDN + Serverless Runtime), Git, GitHub

---

## 🛠️ Local Development Setup

### 1. Prerequisites
* [Node.js](https://nodejs.org) (v18 or higher)
* [MySQL](https://www.mysql.com/) (Local instance or free TiDB Cloud account)

### 2. Clone the Repository
```bash
git clone https://github.com/LALI20006/-smart-attendance.git
cd -smart-attendance
```

### 3. Install Dependencies
```bash
npm install
```

### 4. Configure Environment Variables
Create a `.env` file in the root directory:
```env
PORT=3000
NODE_ENV=development
JWT_SECRET=your_jwt_secret_key_here
APP_URL=http://localhost:3000

# MySQL Configuration (Local or Cloud)
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=your_mysql_password
MYSQL_DATABASE=smart_attendance

# OR use a Cloud MySQL URI:
# DATABASE_URL=mysql://user:password@host:4000/smart_attendance?ssl={"rejectUnauthorized":true}
```

### 5. Start the Server
```bash
npm start
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🌐 Production Cloud Deployment

### Deploy to Vercel (1-Click)
1. Push your repository to GitHub.
2. Go to [Vercel Dashboard](https://vercel.com) → **Add New Project** → Import repository.
3. Add the following **Environment Variables**:
   * `DATABASE_URL`: `mysql://<USER>:<PASSWORD>@<HOST>:4000/smart_attendance?ssl={"rejectUnauthorized":true}`
   * `NODE_ENV`: `production`
   * `JWT_SECRET`: `your_random_secret_string`
   * `APP_URL`: `https://your-domain.com`
4. Click **Deploy**.

---

## 📱 QR Code Attendance Deep-Linking

* When a faculty member starts a session, the generated QR code encodes:
  ```text
  https://smart-attendance-kbq3.vercel.app/student.html?session=CODE&code=CODE
  ```
* Students can scan the QR code using any smartphone camera (iOS Camera or Android Google Lens).
* The phone automatically opens the platform, checks authentication, validates campus GPS coordinates, and records attendance in the database.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
