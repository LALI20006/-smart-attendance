// =============================================
// SMART ATTENDANCE PLATFORM — QR Scanner
// =============================================

let scannerStream = null;
let scannerInterval = null;
let onScanSuccess = null;

async function startScanner(videoId, canvasId, onSuccess) {
  onScanSuccess = onSuccess;
  const video = document.getElementById(videoId);
  const canvas = document.getElementById(canvasId);
  if (!video || !canvas) return;

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 640 }, height: { ideal: 480 } }
    });
    scannerStream = stream;
    video.srcObject = stream;
    video.setAttribute('playsinline', true);
    await video.play();

    const ctx = canvas.getContext('2d');
    scannerInterval = setInterval(() => {
      if (video.readyState !== video.HAVE_ENOUGH_DATA) return;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: 'dontInvert',
      });
      if (code && code.data) {
        stopScanner();
        if (onScanSuccess) onScanSuccess(code.data);
      }
    }, 200);
  } catch (err) {
    console.error('Camera error:', err);
    throw err;
  }
}

function stopScanner() {
  if (scannerInterval) { clearInterval(scannerInterval); scannerInterval = null; }
  if (scannerStream) {
    scannerStream.getTracks().forEach(t => t.stop());
    scannerStream = null;
  }
}

// ── GPS Validation (simulated for file:// protocol) ──
async function getLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      resolve({ lat: 0, lng: 0, simulated: true });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, simulated: false }),
      err => {
        console.warn('GPS unavailable, simulating:', err);
        resolve({ lat: 0, lng: 0, simulated: true });
      },
      { timeout: 4000 }
    );
  });
}

function isWithinCampus(lat, lng) {
  // Simulated campus bounds check — always passes for demo
  // In production: compare against real campus GPS polygon
  return true;
}

window.Scanner = { startScanner, stopScanner, getLocation, isWithinCampus };
