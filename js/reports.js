// =============================================
// SMART ATTENDANCE PLATFORM — Reports
// =============================================

function buildReportData({ facultyId, subjectId, startDate, endDate }) {
  const subjects = subjectId
    ? [SAP.getSubjectById(subjectId)].filter(Boolean)
    : SAP.getSubjectsByFaculty(facultyId);

  const subjectIds = subjects.map(s => s.id);
  let sessions = SAP.getSessionsByFaculty(facultyId)
    .filter(s => subjectIds.includes(s.subjectId));

  if (startDate) sessions = sessions.filter(s => s.date >= startDate);
  if (endDate)   sessions = sessions.filter(s => s.date <= endDate);

  const sessionIds = sessions.map(s => s.id);
  const allAttendance = SAP.getAttendance().filter(a => sessionIds.includes(a.sessionId));
  const students = SAP.getStudents();

  // Build matrix: student × subject
  const rows = students.map(student => {
    const subjectData = subjects.map(sub => {
      const subSessions = sessions.filter(s => s.subjectId === sub.id && sub.enrolledStudents.includes(student.id));
      const attended = allAttendance.filter(a => a.studentId === student.id && a.subjectId === sub.id && sessionIds.includes(a.sessionId)).length;
      const total = subSessions.length;
      const pct = total > 0 ? Math.round((attended / total) * 100) : null;
      return { subjectId: sub.id, subjectCode: sub.code, attended, total, pct };
    }).filter(sd => sd.total > 0);

    if (!subjectData.length) return null;
    const totalAttended = subjectData.reduce((a,b) => a + b.attended, 0);
    const totalSessions  = subjectData.reduce((a,b) => a + b.total,    0);
    const overallPct = totalSessions > 0 ? Math.round((totalAttended / totalSessions) * 100) : 0;

    return { student, subjectData, totalAttended, totalSessions, overallPct };
  }).filter(Boolean);

  return { sessions, rows, subjects };
}

function renderReportTable(containerId, data) {
  const el = document.getElementById(containerId);
  if (!el) return;

  if (!data.rows.length) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">📋</div><div class="empty-title">No data for selected filters</div></div>`;
    return;
  }

  const subjectHeaders = data.subjects.map(s =>
    `<th>${s.code}</th>`
  ).join('');

  const rowsHTML = data.rows.map(row => {
    const subjectCells = data.subjects.map(sub => {
      const sd = row.subjectData.find(d => d.subjectId === sub.id);
      if (!sd) return `<td style="color:var(--text-muted)">—</td>`;
      const color = sd.pct >= 75 ? 'var(--success)' : sd.pct >= 60 ? 'var(--warning)' : 'var(--danger)';
      return `<td style="color:${color};font-weight:600">${sd.pct}% <span style="color:var(--text-muted);font-weight:400;font-size:11px">(${sd.attended}/${sd.total})</span></td>`;
    }).join('');

    const overallColor = row.overallPct >= 75 ? 'var(--success)' : row.overallPct >= 60 ? 'var(--warning)' : 'var(--danger)';
    const atRisk = row.overallPct < 75 ? '⚠ ' : '';

    return `
      <tr>
        <td class="bold">${atRisk}${row.student.name}</td>
        <td style="color:var(--text-muted)">${row.student.rollNo || '—'}</td>
        ${subjectCells}
        <td style="color:${overallColor};font-weight:700">${row.overallPct}%</td>
      </tr>`;
  }).join('');

  el.innerHTML = `
    <div class="table-wrapper">
      <table class="data-table">
        <thead>
          <tr>
            <th>Student Name</th>
            <th>Roll No.</th>
            ${subjectHeaders}
            <th>Overall %</th>
          </tr>
        </thead>
        <tbody>${rowsHTML}</tbody>
      </table>
    </div>`;
}

function exportCSV(data, filename = 'attendance_report.csv') {
  const subjectHeaders = data.subjects.map(s => `"${s.code} (${s.name})"`).join(',');
  const header = `"Student Name","Roll No.",${subjectHeaders},"Overall %"\n`;

  const csvRows = data.rows.map(row => {
    const subjectCols = data.subjects.map(sub => {
      const sd = row.subjectData.find(d => d.subjectId === sub.id);
      return sd ? `"${sd.pct}% (${sd.attended}/${sd.total})"` : '""';
    }).join(',');
    return `"${row.student.name}","${row.student.rollNo || ''}",${subjectCols},"${row.overallPct}%"`;
  }).join('\n');

  const blob = new Blob([header + csvRows], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

window.Reports = { buildReportData, renderReportTable, exportCSV };
