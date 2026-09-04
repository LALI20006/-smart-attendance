// =============================================
// SMART ATTENDANCE PLATFORM — Charts
// =============================================

let chartInstances = {};

function destroyChart(id) {
  if (chartInstances[id]) {
    chartInstances[id].destroy();
    delete chartInstances[id];
  }
}

// ── Doughnut: Overall Attendance ─────────────
function renderOverallDoughnut(canvasId, present, total) {
  destroyChart(canvasId);
  const ctx = document.getElementById(canvasId)?.getContext('2d');
  if (!ctx) return;
  const absent = total - present;
  chartInstances[canvasId] = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Present', 'Absent'],
      datasets: [{
        data: [present, absent],
        backgroundColor: ['rgba(0,212,161,0.85)', 'rgba(255,91,121,0.6)'],
        borderColor: ['#00D4A1', '#FF5B79'],
        borderWidth: 2,
        hoverOffset: 6,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '72%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: '#9B9EC8', font: { family: 'Inter', size: 12 }, padding: 20 }
        },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.label}: ${ctx.raw} sessions`
          },
          backgroundColor: 'rgba(22,24,48,0.95)',
          titleColor: '#F0F2FF',
          bodyColor: '#9B9EC8',
          borderColor: 'rgba(108,99,255,0.3)',
          borderWidth: 1,
        }
      }
    }
  });
}

// ── Bar: Per-Subject Attendance ───────────────
function renderSubjectBar(canvasId, subjectStats) {
  destroyChart(canvasId);
  const ctx = document.getElementById(canvasId)?.getContext('2d');
  if (!ctx) return;

  const labels = subjectStats.map(s => s.subject.code);
  const data   = subjectStats.map(s => s.avgAttendance);
  const colors = data.map(v => v >= 75 ? 'rgba(0,212,161,0.8)' : v >= 60 ? 'rgba(255,179,71,0.8)' : 'rgba(255,91,121,0.8)');
  const borders = data.map(v => v >= 75 ? '#00D4A1' : v >= 60 ? '#FFB347' : '#FF5B79');

  chartInstances[canvasId] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Average Attendance %',
        data,
        backgroundColor: colors,
        borderColor: borders,
        borderWidth: 2,
        borderRadius: 8,
        borderSkipped: false,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.raw}% attendance`,
            title: ctxs => subjectStats[ctxs[0].dataIndex]?.subject.name || ''
          },
          backgroundColor: 'rgba(22,24,48,0.95)',
          titleColor: '#F0F2FF',
          bodyColor: '#9B9EC8',
          borderColor: 'rgba(108,99,255,0.3)',
          borderWidth: 1,
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: '#9B9EC8', font: { family: 'Inter', size: 11 } },
          border: { display: false },
        },
        y: {
          min: 0, max: 100,
          grid: { color: 'rgba(255,255,255,0.04)' },
          ticks: {
            color: '#5C5F80', font: { family: 'Inter', size: 11 },
            callback: v => v + '%'
          },
          border: { display: false },
        }
      }
    }
  });
}

// ── Line: Weekly Trend ────────────────────────
function renderWeeklyLine(canvasId, weeklyData) {
  destroyChart(canvasId);
  const ctx = document.getElementById(canvasId)?.getContext('2d');
  if (!ctx) return;

  const gradient = ctx.createLinearGradient(0, 0, 0, 200);
  gradient.addColorStop(0, 'rgba(108,99,255,0.3)');
  gradient.addColorStop(1, 'rgba(108,99,255,0)');

  chartInstances[canvasId] = new Chart(ctx, {
    type: 'line',
    data: {
      labels: weeklyData.map(w => w.label),
      datasets: [{
        label: 'Avg Attendance %',
        data: weeklyData.map(w => w.pct),
        borderColor: '#6C63FF',
        backgroundColor: gradient,
        borderWidth: 2.5,
        pointBackgroundColor: '#6C63FF',
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
        pointRadius: 5,
        pointHoverRadius: 7,
        fill: true,
        tension: 0.4,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: { label: ctx => ` ${ctx.raw}% avg attendance` },
          backgroundColor: 'rgba(22,24,48,0.95)',
          titleColor: '#F0F2FF',
          bodyColor: '#9B9EC8',
          borderColor: 'rgba(108,99,255,0.3)',
          borderWidth: 1,
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: '#9B9EC8', font: { family: 'Inter', size: 11 } },
          border: { display: false },
        },
        y: {
          min: 0, max: 100,
          grid: { color: 'rgba(255,255,255,0.04)' },
          ticks: {
            color: '#5C5F80', font: { family: 'Inter', size: 11 },
            callback: v => v + '%'
          },
          border: { display: false },
        }
      }
    }
  });
}

// ── Student Attendance Bar (horizontal) ───────
function renderStudentAttendanceBar(canvasId, studentStats) {
  destroyChart(canvasId);
  const ctx = document.getElementById(canvasId)?.getContext('2d');
  if (!ctx) return;

  const labels = studentStats.slice(0,8).map(s => s.student.name.split(' ')[0]);
  const data   = studentStats.slice(0,8).map(s => s.percentage);
  const colors = data.map(v => v >= 75 ? 'rgba(0,212,161,0.8)' : v >= 60 ? 'rgba(255,179,71,0.8)' : 'rgba(255,91,121,0.8)');

  chartInstances[canvasId] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors,
        borderRadius: 6,
        borderSkipped: false,
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: { label: ctx => ` ${ctx.raw}%` },
          backgroundColor: 'rgba(22,24,48,0.95)',
          titleColor: '#F0F2FF',
          bodyColor: '#9B9EC8',
        }
      },
      scales: {
        x: {
          min: 0, max: 100,
          grid: { color: 'rgba(255,255,255,0.04)' },
          ticks: { color: '#5C5F80', callback: v => v+'%' },
          border: { display: false },
        },
        y: {
          grid: { display: false },
          ticks: { color: '#9B9EC8', font: { size: 11 } },
          border: { display: false },
        }
      }
    }
  });
}

window.Charts = { renderOverallDoughnut, renderSubjectBar, renderWeeklyLine, renderStudentAttendanceBar };
