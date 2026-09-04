# Smart Attendance Platform — Production Cloud Deployment & Custom Domain Guide

This document outlines the complete architecture and step-by-step instructions to deploy the Smart Attendance Platform as a **24/7 standalone public web application** accessible at:

🔒 **`https://attendence.in.com`**

---

## Technical Architecture Overview

```
User (Laptop / iPhone / Android Phone / Tablet)
                │
                ▼  (HTTPS / Port 443 with SSL)
     https://attendence.in.com  /  https://api.attendence.in.com
                │
                ▼
        [Cloud DNS Provider]
    (Cloudflare / GoDaddy / Namecheap / CentralNic)
                │
                ▼  (CNAME / A Record)
    [Production Cloud Host]
  (Render / Railway / AWS / VPS)
   Node.js Express + SPA Frontend
   - Automated HTTP -> HTTPS Redirection
   - Unified Role Routing (/student, /faculty, /admin)
   - Dynamic Custom Domain QR Generation & Deep-Linking
                │
                ▼  (TLS Encrypted SSL Connection)
    [Production Cloud MySQL]
  (TiDB Cloud Serverless / Aiven / RDS / Railway)
    - users (Permanent user records)
    - user_sessions (Live login/logout session audit)
    - subjects (Subject definitions)
    - attendance_sessions (Faculty QR & code sessions)
    - attendance (Student attendance records)
    - activity_logs (Security & system events)
```

---

## 1. Domain Registration & Domain Structure Notes

### Understanding `attendence.in.com`
- In domain name taxonomy, **`.in.com`** is a third-level domain structure (e.g. `attendence` on top of `in.com`).
- **If you already purchased `attendence.in.com`**:
  You can manage its DNS directly through your registrar's portal (e.g. CentralNic, GoDaddy, or Namecheap) using the DNS records in Step 4 below.
- **If you haven't purchased it yet**:
  - Check whether `attendence.in.com` is available for registration at your preferred registrar.
  - If a registrar does not offer third-level `.in.com` registrations, the standard Indian ccTLD is **`.in`** (e.g. `attendence.in` or `attendance.in`) or global **`.com`** (e.g. `attendenceapp.com` / `smartattendance.in`).
  - Our codebase is dynamically configured to support both `attendence.in.com`, `attendence.in`, and your chosen custom domain without any hardcoding.

---

## 2. Managed Cloud MySQL Database (Zero Localhost)

To run 24/7 without requiring your local computer to stay powered on:

### Recommended: TiDB Cloud Serverless (Free Forever)
1. Sign up at [https://tidbcloud.com](https://tidbcloud.com).
2. Create a free **Starter (Serverless)** cluster.
3. Click **Connect** → Choose **Connect with Node.js**.
4. Copy the connection URI:
   ```
   mysql://<USERNAME>:<PASSWORD>@<HOST>:4000/smart_attendance?ssl={"rejectUnauthorized":true}
   ```
5. Add this URI as the `DATABASE_URL` environment variable on your hosting dashboard.

*(Alternatively, you can use Aiven for MySQL, PlanetScale, Railway MySQL, or AWS RDS).*

---

## 3. Deploying to Cloud Hosting (Render / Railway)

### Option A: Render.com (Recommended — Free SSL & Custom Domains)
1. Push your local repository to GitHub:
   ```bash
   git remote add origin https://github.com/<YOUR_USERNAME>/<YOUR_REPO>.git
   git branch -M main
   git push -u origin main
   ```
2. Go to [https://dashboard.render.com](https://dashboard.render.com) → Click **New +** → **Blueprint**.
3. Select your repository. Render will automatically detect [`render.yaml`](file:///c:/Users/mrhar/Desktop/attendance/render.yaml) and configure your service.
4. In Environment Variables, specify:
   - `DATABASE_URL`: Your Cloud MySQL connection string.
   - `APP_URL`: `https://attendence.in.com`
   - `CORS_ORIGIN`: `https://attendence.in.com,https://www.attendence.in.com,https://api.attendence.in.com`
5. Click **Apply**. Render deploys your application with a temporary web service URL (e.g., `smart-attendance-xxxxx.onrender.com`).

### Option B: Railway.app
1. Go to [https://railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo**.
2. Select your repository.
3. In **Variables**, set:
   - `DATABASE_URL`: Your Cloud MySQL connection string.
   - `NODE_ENV`: `production`
   - `APP_URL`: `https://attendence.in.com`
   - `PORT`: `3000`
4. Click **Deploy**.

---

## 4. Configuring DNS for `https://attendence.in.com`

Once deployed on your hosting provider, connect your domain:

### Step 1: Add Custom Domain on Hosting Platform
- On **Render**: Service Dashboard → **Settings** → **Custom Domains** → Click **Add Custom Domain** → Enter `attendence.in.com` (and optionally `api.attendence.in.com`).
- On **Railway**: Service Dashboard → **Settings** → **Custom Domains** → Add `attendence.in.com`.

### Step 2: Add DNS Records at Your Domain Registrar
Log in to the control panel where you manage DNS for `attendence.in.com` (GoDaddy, Namecheap, Cloudflare, Hostinger, etc.) and add these exact records:

| Type | Name / Host | Target / Value | TTL | Notes |
| :--- | :--- | :--- | :--- | :--- |
| **CNAME** | `attendence` *(or `@` if root zone)* | `smart-attendance-xxxxx.onrender.com` | Auto (or 300) | Points web traffic to your cloud host |
| **CNAME** | `api.attendence` *(or `api`)* | `smart-attendance-xxxxx.onrender.com` | Auto (or 300) | Points API subdomain to cloud host |

*(Note: Replace `smart-attendance-xxxxx.onrender.com` with the actual hostname provided in your Render or Railway dashboard).*

### Step 3: SSL / HTTPS Verification
- The hosting provider automatically provisions a **Let's Encrypt SSL certificate** for `attendence.in.com`.
- Traffic on port 80 (HTTP) is automatically redirected via 301 to port 443 (**HTTPS**).
- Visitors will see the green lock 🔒 in their browser.

---

## 5. QR Code Deep-Linking & Mobile Scanning

The application is built with automatic domain deep-linking:

1. **Faculty Session QR Codes**:
   When faculty starts a session, the generated QR code encodes:
   `https://attendence.in.com/student.html?session=CS123456&code=CS123456`
2. **Native Phone Camera Scan (iOS / Android)**:
   When a student points their camera at the screen, their phone displays a link to `https://attendence.in.com`.
3. **Auto-Attendance Verification**:
   - If logged in: `student.html` automatically extracts the session code, runs GPS check, and marks attendance.
   - If not logged in: `student.html` preserves the session code in `sessionStorage` and prompts login; once authenticated, attendance is marked immediately.
4. **In-App Scanner**:
   If scanned using the in-app scanner modal, the app extracts the session code from the full URL and records attendance.

---

## 6. Route and Role Endpoints

| Role / Feature | Production Custom Domain URL | Description |
| :--- | :--- | :--- |
| **Portal Home / Login** | `https://attendence.in.com/` | Unified Student, Faculty & Admin login |
| **Student Dashboard** | `https://attendence.in.com/student` | Profile, live sessions, 4-year calendar, attendance records |
| **Faculty Dashboard** | `https://attendence.in.com/faculty` | Session creation, QR generator, live roster, at-risk alerts |
| **Admin Control Center** | `https://attendence.in.com/admin` | Real-time active users, login/logout session audit, metrics |
| **System Health Check** | `https://attendence.in.com/api/health` | Uptime check & database connectivity probe |
| **Backend REST API** | `https://attendence.in.com/api/...` | REST endpoints for auth, sessions, attendance |
