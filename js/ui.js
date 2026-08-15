// =============================================
// SMART ATTENDANCE PLATFORM — UI Utilities
// =============================================

// ── Toast Notifications ───────────────────────
function getOrCreateToastContainer() {
  let el = document.getElementById('toast-container');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast-container';
    el.className = 'toast-container';
    document.body.appendChild(el);
  }
  return el;
}

function showToast(message, type = 'info', duration = 4000) {
  const icons = { success: '✓', error: '✕', info: 'ℹ', warning: '⚠' };
  const container = getOrCreateToastContainer();
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span style="font-size:16px;font-weight:700">${icons[type]}</span><span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.transition = 'all 0.3s ease';
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(120%)';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ── Ring Progress SVG ─────────────────────────
function renderRing(pct, size = 120, strokeWidth = 10) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dash = (pct / 100) * circumference;
  const color = pct >= 75 ? '#00D4A1' : pct >= 50 ? '#FFB347' : '#FF5B79';
  return `
    <div class="ring-progress" style="width:${size}px;height:${size}px">
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        <circle cx="${size/2}" cy="${size/2}" r="${radius}"
          fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="${strokeWidth}"/>
        <circle cx="${size/2}" cy="${size/2}" r="${radius}"
          fill="none" stroke="${color}" stroke-width="${strokeWidth}"
          stroke-dasharray="${dash} ${circumference - dash}"
          stroke-linecap="round"
          style="filter: drop-shadow(0 0 8px ${color}66); transition: stroke-dasharray 1s ease"/>
      </svg>
      <div class="ring-text">
        <span class="ring-value" style="color:${color}">${pct}%</span>
        <span class="ring-label">Attendance</span>
      </div>
    </div>`;
}

// ── Attendance Badge ──────────────────────────
function attendanceBadge(pct) {
  if (pct >= 75) return `<span class="badge badge-success">✓ ${pct}%</span>`;
  if (pct >= 60) return `<span class="badge badge-warning">⚠ ${pct}%</span>`;
  return `<span class="badge badge-danger">✕ ${pct}%</span>`;
}

// ── Avatar Initial ────────────────────────────
function avatarEl(name, size = 40, bg = null) {
  const initials = name.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();
  const colors = ['#6C63FF','#00D4A1','#FF6B9D','#FFB347','#4ECDC4','#A855F7'];
  const color = bg || colors[name.charCodeAt(0) % colors.length];
  return `<div class="avatar" style="width:${size}px;height:${size}px;font-size:${size*0.35}px;background:${color}">${initials}</div>`;
}

// ── Format Helpers ────────────────────────────
function formatDate(isoStr) {
  if (!isoStr) return '—';
  const d = new Date(isoStr);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatDateTime(isoStr) {
  if (!isoStr) return '—';
  const d = new Date(isoStr);
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function timeAgo(isoStr) {
  const ms = Date.now() - new Date(isoStr).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h/24)}d ago`;
}

function countdown(expiresAt) {
  const remaining = expiresAt - Date.now();
  if (remaining <= 0) return '00:00';
  const m = Math.floor(remaining / 60000);
  const s = Math.floor((remaining % 60000) / 1000);
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

// ── Loading Button ────────────────────────────
function setButtonLoading(btn, loading) {
  if (loading) {
    btn.dataset.originalText = btn.innerHTML;
    btn.innerHTML = `<div class="spinner" style="width:18px;height:18px;border-width:2px"></div>`;
    btn.disabled = true;
  } else {
    btn.innerHTML = btn.dataset.originalText || btn.innerHTML;
    btn.disabled = false;
  }
}

// ── Modal Helpers ─────────────────────────────
function openModal(id) {
  document.getElementById(id)?.classList.add('active');
  document.body.style.overflow = 'hidden';
}
function closeModal(id) {
  document.getElementById(id)?.classList.remove('active');
  document.body.style.overflow = '';
}

// ── Confirm Dialog ────────────────────────────
function confirm(message, onConfirm) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay active';
  overlay.innerHTML = `
    <div class="modal" style="max-width:360px;text-align:center">
      <div style="font-size:40px;margin-bottom:16px">⚠️</div>
      <h3 style="margin-bottom:8px">Are you sure?</h3>
      <p style="font-size:14px;margin-bottom:24px">${message}</p>
      <div style="display:flex;gap:12px;justify-content:center">
        <button id="conf-cancel" class="btn btn-ghost">Cancel</button>
        <button id="conf-ok" class="btn btn-danger">Confirm</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#conf-cancel').onclick = () => overlay.remove();
  overlay.querySelector('#conf-ok').onclick = () => { overlay.remove(); onConfirm(); };
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
}

// ── Require Auth ──────────────────────────────
function requireAuth(role) {
  const user = SAP.getCurrentUser();
  if (!user) { window.location.href = 'index.html'; return null; }
  if (role && user.role !== role) { window.location.href = 'index.html'; return null; }
  return user;
}

// Export
window.UI = {
  showToast, renderRing, attendanceBadge, avatarEl,
  formatDate, formatDateTime, timeAgo, countdown,
  setButtonLoading, openModal, closeModal, confirm, requireAuth,
};
