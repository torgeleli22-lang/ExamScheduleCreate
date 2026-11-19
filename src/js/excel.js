/* ---------- 엑셀 내보내기 · 파일 저장 ----------
   시트: 주차별 시험 시간표(① ② ③ …, 학과 2026-2 중간고사 시간표 양식) / 과목별 목록 / 교수님별.

   주차별 시트 양식 (사용자가 손으로 만든 '중간고사 시험 진행 관련 3주치 시간표'를 그대로 따름):
   - 시트 하나 = 한 주(월~금, 시험 있는 토요일만 포함). 날짜는 '날짜 선택'에서 고른 날(stripDates)
   - 세로 = 학년·반, 가로 = 요일. 시험이 있는 날은 1~10교시 칸으로 펼치고, 없는 날은 한 칸에 '기존 수업 진행'
   - 칸 글자: '과목\n(교수) 강의실\n13시 35분 ~ 16시 15분' / 기존 시간표대로면 '기존 수업시간 진행'
   - 색: 1학년 주황 FAC090 · 2학년 연두 C3D69B · 3학년 하늘 92CDDC (그 파일의 Office 2007 테마 Accent6·3·5, 밝게 40%),
         회색 A6A6A6 = 기존 수업(그날 정상 수업·보강·기존 시간대로 보는 시험), 점심 칸 F2DCDB */
const WK = { navy: 'FF203864', dayHead: 'FF17375D', per: 'FFD9E1F2', gray: 'FFA6A6A6', lunch: 'FFF2DCDB', white: 'FFFFFFFF', red: 'FFC00000', clash: 'FFF8C9C9',
  year: { 1: 'FFFAC090', 2: 'FFC3D69B', 3: 'FF92CDDC' } };
const CIRCLED = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮';
/** 엑셀 주차별 시트에 들어갈 날짜들: 고른 날짜를 주마다, 시험 없는 토요일은 뺀다 */
function exportWeeks() {
  const exDays = new Set(S.classes.map(c => S.exams[c.id]).filter(ex => hasSlot(ex) && ex.date).map(ex => ex.date));
  const weeks = new Map();
  for (const d of stripDates()) {
    if (dowOf(d) === 6 && !exDays.has(d) && !dayTouched(d)) continue;
    const m = mondayOf(d);
    if (!weeks.has(m)) weeks.set(m, []);
    weeks.get(m).push(d);
  }
  return [...weeks.values()];
}
/** 칸 하나의 글자·색 */
function weekCellOf(it) {
  const c = it.c;
  if (it.kind === 'exam') {
    const ex = S.exams[c.id], kept = isKept(c), tm = ex.time || periodTime(ex.start, ex.len);
    const extra = [ex.method !== '미정' ? ex.method : '', combinedAt(c, ex).length ? '합반' : ''].filter(Boolean).join(' · ');
    return { text: `${c.course}\n(${c.prof}) ${roomLabel(ex.room)}\n${kept ? '기존 수업시간 진행' : koRange(tm.from, tm.to)}${extra ? ` · ${extra}` : ''}`, fill: kept ? WK.gray : (WK.year[c.year] || WK.gray), exam: true };
  }
  const what = it.kind === 'makeup' ? (it.m && it.m.manual ? `${it.week || ''}주차 수업 옮김` : '보강 수업 진행') : '기존 수업 진행';
  return { text: `${c.course}\n(${c.prof}) ${roomLabel(it.room)}\n${what}${it.tm ? ` · ${koRange(it.tm.from, it.tm.to)}` : ''}`, fill: WK.gray, exam: false };
}
function addWeekSheets(wb) {
  const F = (o = {}) => ({ name: '맑은 고딕', size: 11, ...o });
  const fill = argb => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
  const center = { vertical: 'middle', horizontal: 'center', wrapText: true };
  const side = style => (style ? { style, color: { argb: 'FF000000' } } : undefined);
  const weeks = exportWeeks();
  const all = weeks.flat();
  const label = KINDS[S.kind]?.label || '시험';
  const title = all.length ? `${label} 시험 진행 관련 ${weeks.length}주치 시간표  ${fmt(all[0])} ~ ${fmt(all[all.length - 1])}` : `${label} 시험 시간표`;
  weeks.forEach((days, wi) => {
    const name = `${wi + 1}주차 (${days[0].slice(5).replace('-', '')}(${DOW[dowOf(days[0])]})-${days[days.length - 1].slice(5).replace('-', '')}(${DOW[dowOf(days[days.length - 1])]}))`;
    const ws = wb.addWorksheet(name.slice(0, 31), { views: [{ state: 'frozen', xSplit: 1, ySplit: 7 }],
      pageSetup: { paperSize: 8, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 1, horizontalCentered: true, margins: { left: 0.25, right: 0.25, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 } } });
    // 날짜마다 열: 시험이 있거나 손댄 날(dayTouched)은 1~10교시, 아니면 한 칸
    let col = 2;
    const layout = days.map(d => {
      const items = itemsOn(d, null);
      const open = items.some(it => it.kind === 'exam') || dayTouched(d);   // 시험이 없어도 손댄 날은 수업을 다 보여 준다
      const L = { d, items, open, col, n: open ? NP : 1 };
      col += L.n;
      return L;
    });
    const lastCol = col - 1;
    ws.getColumn(1).width = 10;
    for (const L of layout) {
      if (!L.open) ws.getColumn(L.col).width = 20.6;
      else for (let p = 1; p <= NP; p++) ws.getColumn(L.col + p - 1).width = p === LUNCH ? 5 : 12;
    }
    // 제목·안내
    ws.getCell(1, 2).value = title; ws.getCell(1, 2).font = F({ size: 20, bold: true }); ws.getCell(1, 2).alignment = { vertical: 'middle' };
    ws.getRow(1).height = 57;
    ws.getCell(2, 2).value = '회색 칸은 기존 수업이 진행되는 시간.        색깔별로 1, 2, 3학년별 시험 구분.        시험일정 변경 시 공지예정';
    ws.getCell(2, 2).font = F({ size: 14, bold: true, color: { argb: WK.red } });
    ws.getCell(4, 2).value = `${CIRCLED[wi] || `(${wi + 1})`} ${fmt(days[0])} ~ ${fmt(days[days.length - 1])}`;
    ws.getCell(4, 2).font = F({ size: 30, bold: true, color: { argb: WK.navy } });
    ws.getRow(4).height = 45;
    // 머리글: 학년·반 / 요일·날짜 / 교시 / 시작 시각
    ws.mergeCells(5, 1, 7, 1);
    Object.assign(ws.getCell(5, 1), { value: '학년·반', fill: fill(WK.navy), font: F({ bold: true, color: { argb: 'FFFFFFFF' } }), alignment: center });
    ws.getRow(5).height = 30; ws.getRow(6).height = 16; ws.getRow(7).height = 14;
    for (const L of layout) {
      const info = D.dateMap[L.d], real = DOW[dowOf(L.d)];
      if (L.n > 1) ws.mergeCells(5, L.col, 5, L.col + L.n - 1);
      const head = ws.getCell(5, L.col);
      head.value = `${real} ${+L.d.slice(5, 7)}/${+L.d.slice(8)}${info && info.col !== real ? ` (${info.col}요일 수업)` : ''}`;
      head.fill = fill(WK.dayHead); head.font = F({ size: 14, bold: true, color: { argb: 'FFFFFFFF' } }); head.alignment = center;
      head.border = { left: side('thick'), bottom: side('thin') };
      for (let k = 0; k < L.n; k++) {
        const p = k + 1;
        for (const r of [6, 7]) {
          const cell = ws.getCell(r, L.col + k);
          cell.value = L.open ? (r === 6 ? `${p}교시` : PERIODS[p - 1][0].replace(/^0/, '')) : null;
          cell.fill = fill(WK.per); cell.font = F({ size: r === 6 ? 8 : 7, bold: r === 6 }); cell.alignment = center;
          cell.border = { left: side(k === 0 ? 'thick' : 'thin'), right: side('thin'), top: side('thin'), bottom: side('thin') };
        }
      }
    }
    // 반마다 한 줄
    const first = 8;
    D.groups.forEach((g, gi) => {
      const r = first + gi, y = g.slice(0, -1), ban = g.slice(-1);
      const yearTop = gi > 0 && D.groups[gi - 1].slice(0, -1) !== y;
      ws.getRow(r).height = 42;
      Object.assign(ws.getCell(r, 1), { value: `${y}학년 ${ban}반`, font: F({ bold: true }), alignment: center,
        border: { left: side('thin'), right: side('thin'), top: side(yearTop ? 'thick' : 'thin'), bottom: side('thin') } });
      for (const L of layout) {
        if (!L.open) continue;
        for (let p = 1; p <= NP; p++) {
          const cell = ws.getCell(r, L.col + p - 1);
          cell.fill = fill(p === LUNCH ? WK.lunch : WK.white);
          cell.border = { left: side(p === 1 ? 'thick' : 'thin'), right: side('thin'), top: side(yearTop ? 'thick' : 'thin'), bottom: side('thin') };
        }
        // 시험 먼저, 그다음 그날 수업(회색). 같은 칸이 겹치면 앞 칸에 이어 쓰고 붉게
        const mine = L.items.filter(it => groupOf(it.c) === g).sort((a, b) => (a.kind === 'exam' ? 0 : 1) - (b.kind === 'exam' ? 0 : 1) || a.s - b.s);
        const used = new Array(NP + 2).fill(0);
        for (const it of mine) {
          const s = Math.max(1, it.s), e = Math.min(NP, it.e);
          const cc = weekCellOf(it);
          const clash = range(s, e).find(p => used[p]);
          if (clash) {
            const mc = ws.getCell(r, L.col + used[clash] - 1);
            mc.value = `${mc.value}\n+ ${cc.text.replace(/\n/g, ' ')}`; mc.fill = fill(WK.clash);
            ws.getRow(r).height = 64;
            continue;
          }
          if (e > s) ws.mergeCells(r, L.col + s - 1, r, L.col + e - 1);
          const cell = ws.getCell(r, L.col + s - 1);
          cell.value = cc.text; cell.fill = fill(cc.fill); cell.font = F({ size: 9, bold: true }); cell.alignment = center;
          for (let p = s; p <= e; p++) used[p] = s;
        }
      }
    });
    const last = first + D.groups.length - 1;
    // 시험도 없고 손댄 것도 없는 날: 한 칸으로 '기존 수업 진행'
    for (const L of layout) {
      if (L.open) continue;
      ws.mergeCells(first, L.col, last, L.col);
      const hasClass = L.items.length > 0;
      Object.assign(ws.getCell(first, L.col), { value: hasClass ? '기존 수업\n진행' : '수업 없음', fill: fill(WK.white), font: F({ bold: true }), alignment: center,
        border: { left: side('thick'), right: side('thick'), top: side('thin'), bottom: side('thin') } });
    }
    // 아래 색 안내
    const lg = last + 3;
    [['1학년', WK.year[1]], ['2학년', WK.year[2]], ['3학년', WK.year[3]], ['기존 수업', WK.gray]].forEach(([t, c], i) => {
      ws.getRow(lg + i).height = 40;
      ws.getCell(lg + i, 3).fill = fill(c);
      Object.assign(ws.getCell(lg + i, 4), { value: `  ${t}`, font: F({ size: 14 }), alignment: { vertical: 'middle', horizontal: 'left' } });
    });
    if (lastCol < 4) ws.getColumn(4).width = 12;
  });
  if (!weeks.length) wb.addWorksheet('시험 시간표').getCell(1, 1).value = '날짜를 골라 주세요.';
}

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
  const F = (o = {}) => ({ name: '맑은 고딕', size: 10, ...o });
  const center = { vertical: 'middle', horizontal: 'center', wrapText: true };

  // 1) 시험 시간표: 학과 '중간고사 시험 진행 관련 3주치 시간표' 양식 (주마다 시트)
  addWeekSheets(wb);

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
      per: ok ? pRange(ex.start, ex.len) : '', time: ok ? examTime(ex) : '', year: c.year, ban: c.ban, course: c.course, prof: c.prof,
      room: ok ? roomLabel(ex.room) : '', method: methodLabel(c), orig: `${fmt(defaultDate(c))} ${pRange(defaultStart(c), defaultLen(c))}`,
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
    ps.addRow({ prof: c.prof, course: c.course, grp: groupOf(c), date: ok ? fmt(ex.date) : '', per: ok ? pRange(ex.start, ex.len) : '', time: ok ? examTime(ex) : '',
      room: ok ? roomLabel(ex.room) : '', method: methodLabel(c), done: ex.done ? 'O' : '', note: ex.note }).alignment = { vertical: 'middle', wrapText: true };
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
