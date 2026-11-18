/* ---------- 파일 읽기: 수업일 현황(PDF·붙여넣기), 강의시간표(xlsx) ---------- */

/** 외부 라이브러리는 처음 필요할 때만 CDN에서 불러온다. */
const libP = {};
function loadScript(url, globalName, failMsg) {
  if (window[globalName]) return Promise.resolve(window[globalName]);
  if (!libP[url]) libP[url] = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = url;
    s.onload = () => window[globalName] ? res(window[globalName]) : rej(new Error(failMsg));
    s.onerror = () => { delete libP[url]; rej(new Error(failMsg + ' 인터넷 연결을 확인해 주세요.')); };
    document.head.appendChild(s);
  });
  return libP[url];
}
const loadExcelJS = () => loadScript(EXCELJS_URL, 'ExcelJS', '엑셀 기능을 불러오지 못했어요.');
const loadSheetJS = () => loadScript(SHEETJS_URL, 'XLSX', '옛 엑셀(.xls) 읽기 기능을 불러오지 못했어요.');

/** 옛 엑셀(.xls, BIFF) → { xlsx: 같은 내용의 .xlsx 바이트(병합 칸 유지), text: 행은 줄·칸은 탭 } */
async function xlsToXlsx(buf) {
  const XLSX = await loadSheetJS();
  const wb = XLSX.read(new Uint8Array(buf), { type: 'array', cellDates: false });
  const text = wb.SheetNames.map(n => XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: false, defval: '' })
    .map(r => r.map(v => String(v ?? '').replace(/\s*\n\s*/g, ' ').trim()).join('\t')).filter(l => l.replace(/\t/g, '').trim()).join('\n')).join('\n');
  const xlsx = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  return { xlsx, text };
}
async function loadPdfJs() {
  const lib = await loadScript(PDFJS_URL, 'pdfjsLib', 'PDF 읽기 기능을 불러오지 못했어요.');
  if (!lib.GlobalWorkerOptions.workerSrc) lib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
  return lib;
}

/**
 * '주 / 월~토' 표 텍스트 → { cols, weeks }.
 * 각 줄: "주차번호 날짜 날짜 …" (예: "14 12/14 12/1 12/9 12/10 12/15(화) 12/19").
 * 주차 번호가 없는 표면 위에서부터 1주차로 센다.
 */
function parseCalendarText(text) {
  const lines = String(text || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  let cols = DAY_ORDER.slice();
  const weeks = [], unnumbered = [];
  const tokRe = /\d{1,2}\s*\/\s*\d{1,2}(?:\s*\(\s*[월화수목금토일]\s*\))?/g;
  for (const l of lines) {
    if (!/\d{1,2}\s*\/\s*\d{1,2}/.test(l)) {
      const hdr = l.match(/[월화수목금토일]/g);
      if (hdr && hdr.length >= 5 && /주/.test(l)) cols = hdr.filter(h => DAY_ORDER.includes(h));
      continue;
    }
    const m = l.match(/^(\d{1,2})(?:\s*주(?:차)?)?\s+(.*)$/);
    const body = m && !/^\s*\//.test(m[2]) ? m[2] : l;
    const toks = (body.match(tokRe) || []).map(t => t.replace(/\s+/g, ''));
    if (toks.length < Math.min(5, cols.length)) continue;
    if (m && body === m[2]) weeks[+m[1] - 1] = toks.slice(0, cols.length);
    else unnumbered.push(toks.slice(0, cols.length));
  }
  if (!weeks.filter(Boolean).length && unnumbered.length) unnumbered.forEach((r, i) => { weeks[i] = r; });
  const n = weeks.filter(Boolean).length;
  if (!n) return { error: true, msg: '표에서 주차별 날짜를 찾지 못했어요. 각 줄이 "주차 번호 + 날짜들" 순서인지 확인해 주세요.' };
  for (let i = 0; i < weeks.length; i++) if (!weeks[i]) weeks[i] = null;
  return { data: { cols, weeks }, msg: `${n}주 × ${cols.length}요일(${cols.join('·')})을 읽었어요.` };
}
function calendarText(cal) {
  const lines = ['주\t' + cal.cols.join('\t')];
  cal.weeks.forEach((row, i) => { if (row) lines.push(`${i + 1}\t${row.join('\t')}`); });
  return lines.join('\n');
}

/** PDF 글자 조각(pdf.js textContent.items) → 줄 텍스트. 같은 높이(y)끼리 묶고 왼쪽부터 잇는다. */
function pdfItemsToLines(items, tol = 3) {
  const its = items.filter(it => it && String(it.str || '').trim())
    .map(it => ({ s: String(it.str).trim(), x: it.transform[4], y: it.transform[5] }))
    .sort((a, b) => b.y - a.y || a.x - b.x);
  const rows = [];
  for (const it of its) {
    const row = rows.find(r => Math.abs(r.y - it.y) <= tol);
    if (row) row.items.push(it); else rows.push({ y: it.y, items: [it] });
  }
  return rows.sort((a, b) => b.y - a.y).map(r => r.items.sort((a, b) => a.x - b.x).map(i => i.s).join(' '));
}
async function pdfToText(buf) {
  const lib = await loadPdfJs();
  const doc = await lib.getDocument({ data: new Uint8Array(buf) }).promise;
  const out = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    out.push(...pdfItemsToLines(tc.items));
  }
  return out.join('\n');
}
/** 수업일 현황 PDF → parseCalendarText 결과 + 읽은 텍스트(사용자가 고칠 수 있게) */
async function parseCalendarPdf(buf) {
  const text = await pdfToText(buf);
  const res = parseCalendarText(text);
  if (res.error && !text.trim()) res.msg = 'PDF에서 글자를 찾지 못했어요. 스캔한 이미지 PDF라면 표를 직접 붙여 넣어 주세요.';
  return { ...res, text: res.data ? calendarText(res.data) : text };
}

function assignIds(list) {
  const seen = {};
  return list.map(o => { let id = `${o.day}-${o.year}${o.ban}-${o.start}`; if (seen[id]) id += '-' + (++seen[id]); else seen[id] = 1; return { ...o, id }; });
}
/**
 * 강의시간표 xlsx → { sheet, classes }.
 * '요일 | 학년 | 반 | 1 | 2 | … | 10' 머리글이 있는 첫 시트를 읽는다.
 * 칸 내용 "과목명(교수)-강의실", 가로로 병합된 칸 = 연속 교시.
 */
async function parseTimetableXlsx(buf) {
  const ExcelJS = await loadExcelJS();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const txt = cell => { try { return String(cell.text ?? '').trim(); } catch { return ''; } };
  for (const ws of wb.worksheets) {
    let hdr = null;
    ws.eachRow({ includeEmpty: false }, (row, r) => { if (hdr) return; row.eachCell((cell, c) => { if (!hdr && /^요\s*일$/.test(txt(cell))) hdr = { r, c }; }); });
    if (!hdr) continue;
    let np = 0;
    for (let k = 0; k < 14; k++) { if (txt(ws.getCell(hdr.r, hdr.c + 3 + k)) === String(k + 1)) np = k + 1; else break; }
    if (!np) np = NP;
    const out = []; let day = null, year = null;
    for (let r = hdr.r + 1; r <= ws.rowCount; r++) {
      const dcell = ws.getCell(r, hdr.c);
      const dt = txt(dcell);
      if (/^요\s*일$/.test(dt) && !(dcell.isMerged && dcell.master && dcell.master.address !== dcell.address)) break;
      if (DAY_ORDER.includes(dt)) day = dt;
      const yt = txt(ws.getCell(r, hdr.c + 1)); if (/^\d$/.test(yt)) year = +yt;
      const ban = txt(ws.getCell(r, hdr.c + 2));
      if (!day || !year || !/^[A-Za-z]$/.test(ban)) continue;
      for (let k = 0; k < np; k++) {
        const cell = ws.getCell(r, hdr.c + 3 + k);
        if (cell.isMerged && cell.master && cell.master.address !== cell.address) continue;
        const t = txt(cell); if (!t) continue;
        let span = 1;
        while (k + span < np) { const nx = ws.getCell(r, hdr.c + 3 + k + span); if (nx.isMerged && nx.master && nx.master.address === cell.address) span++; else break; }
        const m = t.match(/^(.+?)\s*\(([^)]+)\)\s*-?\s*(.*)$/);
        out.push({ day, year, ban: ban.toUpperCase(), start: k + 1, end: k + span, course: (m ? m[1] : t).trim(), prof: m ? m[2].trim() : '', room: (m ? m[3] : '').replace(/호/g, '').replace(/\s+/g, '') });
        k += span - 1;
      }
    }
    if (out.length) return { sheet: ws.name, classes: assignIds(out) };
  }
  throw new Error('강의시간표 형식을 찾지 못했어요. "요일·학년·반·교시" 머리글이 있는 시트인지 확인해 주세요.');
}

/** xlsx 모든 시트 → 글자 (행은 줄, 칸은 탭). 날짜 칸은 "월/일"로 */
async function xlsxToText(buf) {
  const ExcelJS = await loadExcelJS();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const cellText = v => {
    if (v == null) return '';
    if (v instanceof Date) return `${v.getUTCFullYear()}/${v.getUTCMonth() + 1}/${v.getUTCDate()}`;
    if (typeof v === 'object') { if (v.richText) return v.richText.map(r => r.text).join(''); if ('result' in v) return cellText(v.result); if (v.text) return String(v.text); return ''; }
    return String(v);
  };
  const lines = [];
  for (const ws of wb.worksheets) ws.eachRow({ includeEmpty: false }, row => {
    const vals = []; row.eachCell({ includeEmpty: true }, cell => vals.push(cellText(cell.value).replace(/\s*\n\s*/g, ' ').trim()));
    if (vals.some(Boolean)) lines.push(vals.join('\t'));
  });
  return lines.join('\n');
}

/**
 * 파일 하나가 무슨 자료인지 알아낸다.
 * → { name, type: 'timetable' | 'calendar' | 'makeups' | 'unknown', classes?, sheet?, calendar?, text?, msg }
 *   timetable: 학과 강의시간표 (xlsx, '요일·학년·반·1~10교시' 머리글)
 *   calendar:  요일별 수업일 현황 (pdf · hwp · xlsx · 글자)
 *   makeups:   보강결과보고서·보강 신청 목록 (hwp · xls · xlsx · pdf · 글자). 수업과 짝짓기는 적용할 때 parseMakeups()로.
 */
async function recognizeFile(file) {
  const name = file.name || '파일';
  const ext = (name.match(/\.([^.]+)$/) || [])[1]?.toLowerCase() || '';
  const buf = await file.arrayBuffer();
  let text = '';
  try {
    if (ext === 'xlsx' || ext === 'xlsm') {
      try { const tt = await parseTimetableXlsx(buf); return { name, type: 'timetable', classes: tt.classes, sheet: tt.sheet, msg: `강의시간표 · '${tt.sheet}' 시트에서 수업 ${tt.classes.length}개` }; } catch {}
      text = await xlsxToText(buf);
    } else if (ext === 'pdf') text = await pdfToText(buf);
    else if (ext === 'hwp') text = await hwpToText(new Uint8Array(buf));
    else if (['txt', 'csv', 'tsv', 'json'].includes(ext) || !ext) text = new TextDecoder().decode(buf);
    else if (ext === 'xls') {
      const conv = await xlsToXlsx(buf);
      try { const tt = await parseTimetableXlsx(conv.xlsx); return { name, type: 'timetable', classes: tt.classes, sheet: tt.sheet, msg: `강의시간표 · '${tt.sheet}' 시트에서 수업 ${tt.classes.length}개` }; } catch {}
      text = conv.text;
    }
    else if (ext === 'hwpx') return { name, type: 'unknown', msg: '.hwpx는 아직 못 읽어요. 한글에서 .hwp로 다시 저장해 주세요.' };
    else return { name, type: 'unknown', msg: '읽을 수 없는 파일 형식이에요 (.xlsx, .xls, .pdf, .hwp, .txt).' };
  } catch (err) { return { name, type: 'unknown', msg: err.message || '파일을 읽지 못했어요.' }; }
  const kind = classifyText(text);
  if (kind === 'calendar') { const cal = parseCalendarText(text); return { name, type: 'calendar', calendar: cal.data, text: calendarText(cal.data), msg: `요일별 수업일 현황 · ${cal.msg}` }; }
  if (kind === 'makeups') { const n = text.split(/\r?\n/).filter(l => (l.match(DATE_RE) || []).length >= 1 && (linePeriods(l).length || /\d{5}-\d{3}/.test(l))).length; return { name, type: 'makeups', text, msg: `보강 자료 · ${n}줄` }; }
  return { name, type: 'unknown', text, msg: text.trim() ? '시간표·수업일 현황·보강 중 어느 것인지 알아보지 못했어요.' : '파일에서 글자를 찾지 못했어요 (스캔한 이미지일 수 있어요).' };
}
const TYPE_LABEL = { timetable: '강의시간표', calendar: '요일별 수업일 현황', makeups: '보강', unknown: '알 수 없음' };
