/* ---------- 엑셀 내보내기 · 파일 저장 ----------
   시트: 시험시간표(공지) / 과목별 목록 / 교수님별. 공지 시트는 학과 강의시간표처럼 학년 색(1 노랑, 2 파랑, 3 초록). */
function sortedExams() {
  return S.classes.slice().sort((a, b) => {
    const ea = S.exams[a.id], eb = S.exams[b.id];
    const na = hasSlot(ea) ? 0 : 1, nb = hasSlot(eb) ? 0 : 1;
    return na - nb || (ea.date || '').localeCompare(eb.date || '') || ea.start - eb.start || groupOf(a).localeCompare(groupOf(b));
  });
}
async function buildWorkbook() {
  const ExcelJS = await loadExcelJS();
  const wb = new ExcelJS.Workbook();
  wb.creator = S.dept; wb.created = new Date();
  const thin = { style: 'thin', color: { argb: 'FF9AA3AF' } };
  const border = { top: thin, left: thin, bottom: thin, right: thin };
  const fill = argb => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
  const YF = { '1': ['FFFFF8E1', 'FFFFE08A'], '2': ['FFEAF2FC', 'FFBCD5F5'], '3': ['FFEBF6E6', 'FFC3E3B5'] };
  const yf = y => YF[String(y)] || ['FFF5F5F5', 'FFDDDDDD'];
  const F = (o = {}) => ({ name: '맑은 고딕', size: 10, ...o });
  const center = { vertical: 'middle', horizontal: 'center', wrapText: true };
  const lastCol = 4 + NP;

  // 1) 학생 공지용 시간표
  const ws = wb.addWorksheet('시험시간표(공지)', { views: [{ state: 'frozen', ySplit: 5 }],
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, horizontalCentered: true, margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 } } });
  ws.getColumn(1).width = 2; ws.getColumn(2).width = 10; ws.getColumn(3).width = 5; ws.getColumn(4).width = 5;
  for (let p = 1; p <= NP; p++) ws.getColumn(4 + p).width = p === LUNCH ? 7 : 16;
  ws.mergeCells(2, 2, 2, lastCol);
  const tc = ws.getCell(2, 2); const tm = String(S.title).match(/^(.*학기)\s*(.*)$/);
  tc.value = tm ? `${tm[1]} ${S.dept} ${tm[2]} 시간표`.replace(/\s+/g, ' ') : `${S.dept} ${S.title} 시간표`; tc.font = F({ size: 16, bold: true }); tc.alignment = center;
  ws.getRow(2).height = 30;
  ws.mergeCells(4, 2, 5, 2); ws.mergeCells(4, 3, 5, 3); ws.mergeCells(4, 4, 5, 4);
  ws.getCell(4, 2).value = '날짜'; ws.getCell(4, 3).value = '학년'; ws.getCell(4, 4).value = '반';
  for (let p = 1; p <= NP; p++) { ws.getCell(4, 4 + p).value = p; ws.getCell(5, 4 + p).value = p === LUNCH ? '점심' : `${PERIODS[p - 1][0]}-${PERIODS[p - 1][1]}`; }
  for (let r = 4; r <= 5; r++) for (let c = 2; c <= lastCol; c++) { const cell = ws.getCell(r, c); cell.border = border; cell.alignment = center; cell.fill = fill('FFE5E8EE'); cell.font = F({ bold: r === 4, size: r === 4 ? 10 : 8.5 }); }
  const exDates = [...new Set(S.classes.map(c => S.exams[c.id]).filter(ex => hasSlot(ex) && ex.date).map(ex => ex.date))].sort();
  let r = 6;
  for (const d of exDates) {
    const top = r; let yStart = r, curY = null;
    for (const g of D.groups) {
      const y = g.slice(0, -1), ban = g.slice(-1);
      if (curY !== y) { if (curY !== null && r - 1 > yStart) ws.mergeCells(yStart, 3, r - 1, 3); yStart = r; curY = y; ws.getCell(r, 3).value = +y; }
      ws.getCell(r, 4).value = ban;
      ws.getRow(r).height = 34;
      for (let c = 2; c <= lastCol; c++) { const cell = ws.getCell(r, c); cell.border = border; cell.alignment = center; cell.font = F(); if (c >= 3) cell.fill = fill(c === 4 + LUNCH ? 'FFF2F2F2' : yf(y)[0]); }
      const blocks = S.classes.filter(c => groupOf(c) === g && hasSlot(S.exams[c.id]) && S.exams[c.id].date === d).sort((a, b) => S.exams[a.id].start - S.exams[b.id].start);
      const used = new Array(NP + 2).fill(0);
      for (const c of blocks) {
        const ex = S.exams[c.id];
        const s = Math.max(1, ex.start), e = Math.min(NP, ex.start + ex.len - 1);
        const text = `${c.course}(${c.prof})\n${roomLabel(ex.room)}${ex.method !== '미정' ? ' · ' + ex.method : ''}`;
        const clashAt = range(s, e).find(p => used[p]);
        if (clashAt) {
          const mc = ws.getCell(r, 4 + used[clashAt]);
          mc.value = `${mc.value}\n+ ${text.replace('\n', ' ')}`; mc.fill = fill('FFF8C9C9');
          ws.getRow(r).height = 60;
          continue;
        }
        if (e > s) ws.mergeCells(r, 4 + s, r, 4 + e);
        const cell = ws.getCell(r, 4 + s);
        cell.value = text; cell.fill = fill(yf(y)[1]); cell.font = F({ size: 9.5, bold: false }); cell.alignment = center;
        for (let p = s; p <= e; p++) used[p] = s;
      }
      r++;
    }
    if (r - 1 > yStart) ws.mergeCells(yStart, 3, r - 1, 3);
    ws.mergeCells(top, 2, r - 1, 2);
    const dc = ws.getCell(top, 2);
    const [, mm, dd] = d.split('-');
    dc.value = `${+mm}/${+dd}\n(${DOW[dowOf(d)]})`; dc.font = F({ bold: true, size: 12 }); dc.alignment = center;
    r++;
  }
  const none = S.classes.filter(c => !hasSlot(S.exams[c.id]));
  if (none.length) {
    ws.getCell(r, 2).value = `※ 시험 시간 없음: ` + none.map(c => `${c.course}(${c.prof}, ${groupOf(c)}) ${S.exams[c.id].method}`).join(' / ');
    ws.getCell(r, 2).font = F({ size: 9 });
    r++;
  }

  // 2) 과목별 목록
  const ls = wb.addWorksheet('과목별 목록', { views: [{ state: 'frozen', ySplit: 1 }] });
  ls.columns = [
    { header: '날짜', key: 'date', width: 11 }, { header: '요일', key: 'dow', width: 6 }, { header: '교시', key: 'per', width: 10 },
    { header: '시간', key: 'time', width: 13 }, { header: '학년', key: 'year', width: 6 }, { header: '반', key: 'ban', width: 5 },
    { header: '과목', key: 'course', width: 24 }, { header: '교수', key: 'prof', width: 10 }, { header: '강의실', key: 'room', width: 11 },
    { header: '방식', key: 'method', width: 11 }, { header: `원래 ${S.examWeek}주차`, key: 'orig', width: 22 }, { header: '변경', key: 'moved', width: 6 },
    { header: '확정', key: 'done', width: 6 }, { header: '겹침·확인 필요', key: 'issues', width: 44 }, { header: '요청사항·메모', key: 'note', width: 36 }];
  for (const c of sortedExams()) {
    const ex = S.exams[c.id], st = statusOf(c), ok = hasSlot(ex);
    const row = ls.addRow({
      date: ok && ex.date ? `${+ex.date.split('-')[1]}/${+ex.date.split('-')[2]}` : '', dow: ok && ex.date ? DOW[dowOf(ex.date)] : '',
      per: ok ? pRange(ex.start, ex.len) : '', time: ok ? tRange(ex.start, ex.len) : '', year: c.year, ban: c.ban, course: c.course, prof: c.prof,
      room: ok ? roomLabel(ex.room) : '', method: ex.method, orig: `${fmt(defaultDate(c))} ${pRange(c.start, lenOf(c))}`,
      moved: st.moved ? 'O' : '', done: ex.done ? 'O' : '', issues: [...st.bad.map(describeConflict), ...st.warn].join('\n'), note: ex.note });
    row.alignment = { vertical: 'middle', wrapText: true };
    if (st.bad.length) row.getCell('issues').font = F({ color: { argb: 'FFC42B2B' } });
  }
  ls.getRow(1).font = F({ bold: true }); ls.getRow(1).fill = fill('FFE5E8EE');
  ls.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 15 } };
  ls.eachRow(row => row.eachCell(cell => { cell.border = border; if (!cell.font || !cell.font.name) cell.font = F(cell.font || {}); }));

  // 3) 교수님별
  const ps = wb.addWorksheet('교수님별', { views: [{ state: 'frozen', ySplit: 1 }] });
  ps.columns = [{ header: '교수', key: 'prof', width: 10 }, { header: '과목', key: 'course', width: 24 }, { header: '반', key: 'grp', width: 6 },
    { header: '날짜', key: 'date', width: 11 }, { header: '교시', key: 'per', width: 10 }, { header: '시간', key: 'time', width: 13 },
    { header: '강의실', key: 'room', width: 11 }, { header: '방식', key: 'method', width: 11 }, { header: '확정', key: 'done', width: 6 }, { header: '메모', key: 'note', width: 36 }];
  const byProf = S.classes.slice().sort((a, b) => a.prof.localeCompare(b.prof, 'ko') || (S.exams[a.id].date || '').localeCompare(S.exams[b.id].date || '') || S.exams[a.id].start - S.exams[b.id].start);
  for (const c of byProf) {
    const ex = S.exams[c.id], ok = hasSlot(ex);
    ps.addRow({ prof: c.prof, course: c.course, grp: groupOf(c), date: ok ? fmt(ex.date) : '', per: ok ? pRange(ex.start, ex.len) : '', time: ok ? tRange(ex.start, ex.len) : '',
      room: ok ? roomLabel(ex.room) : '', method: ex.method, done: ex.done ? 'O' : '', note: ex.note }).alignment = { vertical: 'middle', wrapText: true };
  }
  ps.getRow(1).font = F({ bold: true }); ps.getRow(1).fill = fill('FFE5E8EE');
  ps.eachRow(row => row.eachCell(cell => { cell.border = border; if (!cell.font || !cell.font.name) cell.font = F(cell.font || {}); }));

  return wb.xlsx.writeBuffer();
}
let dlP = null;
function getDownloads() {
  if (!dlP) dlP = (window.claude && typeof window.claude.use === 'function') ? Promise.resolve(window.claude.use('downloads')).catch(() => null) : Promise.resolve(null);
  return dlP;
}
async function saveFile(filename, data) {
  const inClaude = !!(window.claude && typeof window.claude.use === 'function');
  if (!inClaude) {
    try {
      const blob = data instanceof Blob ? data : new Blob([data]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      toast('파일을 저장했어요.'); return true;
    } catch { toast('파일을 저장하지 못했어요.'); return false; }
  }
  const dl = await getDownloads();
  if (!dl) { toast('이 화면에서는 파일 저장을 쓸 수 없어요. claude.ai에서 이 페이지를 열어 다시 눌러 주세요.'); return false; }
  try { await dl.save({ filename, data }); toast('파일을 저장했어요.'); return true; }
  catch (err) {
    const code = err && err.code;
    if (code === 'declined') toast('저장을 취소했어요.');
    else if (code === 'rate_limited') toast('저장 창이 이미 열려 있어요. 잠시 후 다시 눌러 주세요.');
    else toast('파일을 저장하지 못했어요. ' + (err && err.message ? err.message : ''));
    return false;
  }
}
async function exportExcel() {
  const btn = $('#btnExport');
  btn.disabled = true; const old = btn.textContent; btn.textContent = '만드는 중…';
  try {
    const buf = await buildWorkbook();
    await saveFile(`${safeName(S.title)}_시간표.xlsx`, new Blob([buf]));
  } catch (err) { toast(err && err.message ? err.message : '엑셀 파일을 만들지 못했어요.'); }
  finally { btn.disabled = false; btn.textContent = old; }
}
