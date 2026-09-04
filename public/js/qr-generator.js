// =============================================
// SMART ATTENDANCE PLATFORM — QR Generator
// =============================================

// Wraps qrcode.js library

function generateQR(containerId, text, size = 240) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';

  // Create a wrapper with glow effect
  const wrapper = document.createElement('div');
  wrapper.style.cssText = `
    display:inline-flex; align-items:center; justify-content:center;
    padding: 20px; background: white; border-radius: 16px;
    box-shadow: 0 0 40px rgba(108,99,255,0.4), 0 0 80px rgba(108,99,255,0.2);
  `;
  container.appendChild(wrapper);

  new QRCode(wrapper, {
    text,
    width: size,
    height: size,
    colorDark: '#0A0B1A',
    colorLight: '#FFFFFF',
    correctLevel: QRCode.CorrectLevel.H,
  });
}

function startSessionQR(session, containerId, timerDisplayId, onExpire) {
  const currentOrigin = (typeof window !== 'undefined' && window.location.origin && window.location.origin !== 'null' && !window.location.origin.includes('file:'))
    ? window.location.origin
    : 'https://attendence.in.com';
  const qrUrl = session.qrUrl || `${currentOrigin}/student.html?session=${session.sessionCode || session.qrToken}&code=${session.sessionCode || session.qrToken}`;
  generateQR(containerId, qrUrl, 220);

  const timer = document.getElementById(timerDisplayId);
  const interval = setInterval(() => {
    const remaining = session.expiresAt - Date.now();
    if (remaining <= 0) {
      clearInterval(interval);
      SAP.expireSession(session.id);
      if (timer) { timer.textContent = '00:00'; timer.style.color = 'var(--danger)'; }
      if (onExpire) onExpire();
      return;
    }
    const m = Math.floor(remaining / 60000);
    const s = Math.floor((remaining % 60000) / 1000);
    if (timer) {
      timer.textContent = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
      if (remaining < 60000) timer.style.color = 'var(--danger)';
      else if (remaining < 120000) timer.style.color = 'var(--warning)';
      else timer.style.color = 'var(--secondary)';
    }
  }, 500);

  return interval; // Return so caller can clear if needed
}

window.QRGen = { generateQR, startSessionQR };
