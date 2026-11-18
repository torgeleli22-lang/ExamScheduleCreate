/* ---------- 상수 · 공용 도우미 (DOM 없이도 동작해야 함: 단위 테스트에서 그대로 불러씀) ---------- */
const PERIODS = [['09:00','09:50'],['09:55','10:45'],['10:50','11:40'],['11:45','12:35'],['12:40','13:30'],['13:35','14:25'],['14:30','15:20'],['15:25','16:15'],['16:20','17:10'],['17:15','18:05']];
const NP = 10, LUNCH = 5;
const DOW = ['일','월','화','수','목','금','토'];
const DAY_ORDER = ['월','화','수','목','금','토'];
const METHODS = ['미정','필기','실기','필기+실기','발표','과제 대체','시험 없음'];
const NO_SLOT = new Set(['과제 대체','시험 없음']);
/** 시험 종류. week = 기본 시험 주차 (계획마다 설정에서 바꿀 수 있음) */
const KINDS = { mid: { label: '중간고사', week: 8 }, final: { label: '기말고사', week: 15 } };
const EXCELJS_URL = 'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js';
// 옛 엑셀(.xls)만 SheetJS로 읽는다 (그 밖의 엑셀은 ExcelJS)
const SHEETJS_URL = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
const PDFJS_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js';
const PDFJS_WORKER_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const clone = o => JSON.parse(JSON.stringify(o));
const range = (a, b) => { const r = []; for (let i = a; i <= b; i++) r.push(i); return r; };
const dowOf = iso => new Date(iso + 'T00:00:00Z').getUTCDay();
function fmt(iso) { if (!iso) return '-'; const [, m, d] = iso.split('-'); return `${+m}/${+d}(${DOW[dowOf(iso)]})`; }
const groupOf = c => `${c.year}${c.ban}`;
const lenOf = c => c.end - c.start + 1;
const roomLabel = r => !r ? '-' : (/^\d+$/.test(r) ? r + '호' : r);
const normRoom = r => String(r || '').replace(/호/g, '').replace(/\s+/g, '').toUpperCase();
const cleanRoom = r => String(r || '').replace(/호/g, '').trim();
const pRange = (s, len) => len <= 1 ? `${s}교시` : `${s}~${s + len - 1}교시`;
const tRange = (s, len) => { const e = Math.min(NP, s + len - 1); return `${PERIODS[s - 1]?.[0] ?? '?'}~${PERIODS[e - 1]?.[1] ?? '?'}`; };
const opts = (arr, cur, lab = x => x) => arr.map(v => `<option value="${esc(v)}"${String(v) === String(cur) ? ' selected' : ''}>${esc(lab(v))}</option>`).join('');
const safeName = s => String(s).replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '_');
const fmtStamp = t => { if (!t) return '-'; const d = new Date(t); return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
