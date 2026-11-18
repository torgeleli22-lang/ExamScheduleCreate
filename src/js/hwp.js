/* ---------- 한글(.hwp 5.0) 문서 → 글자 ----------
   학교 양식(보강결과보고서, 수업일 현황 등)이 .hwp로 오기 때문에 브라우저에서 직접 읽는다. 라이브러리 없음.
   1) .hwp는 MS 복합 문서(CFB) 안에 FileHeader, BodyText/Section0.. 스트림이 들어 있다 → cfbStreams()
   2) Section 스트림은 (압축되어 있으면 raw deflate를 풀고) 레코드의 나열이다 → hwpRecordsToLines()
   3) 표는 칸(LIST_HEADER)마다 행·열 번호가 있으므로, 같은 행의 칸은 탭으로 이어 한 줄로 만든다.
      예) "35382-101\tJAVA프로그래밍응용\t2\t2026/09/22\t화\t6~8\t2026/12/15\t화\t6~8\t양숙희" */

/** CFB(복합 문서) → { 경로: Uint8Array } (경로 예: 'FileHeader', 'BodyText/Section0') */
function cfbStreams(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const sig = [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1];
  if (bytes.length < 512 || sig.some((b, i) => bytes[i] !== b)) throw new Error('한글(.hwp 5.0) 파일이 아니에요.');
  const u32 = o => dv.getUint32(o, true);
  const secSize = 1 << dv.getUint16(0x1E, true), miniSize = 1 << dv.getUint16(0x20, true);
  const nFat = u32(0x2C), firstDir = u32(0x30), cutoff = u32(0x38), firstMiniFat = u32(0x3C), firstDifat = u32(0x44);
  const END = 0xFFFFFFFA;
  const secOff = sid => (sid + 1) * secSize;
  // FAT 섹터 목록 (헤더의 109개 + DIFAT 사슬)
  const fatSecs = [];
  for (let i = 0; i < 109 && fatSecs.length < nFat; i++) { const s = u32(0x4C + i * 4); if (s < END) fatSecs.push(s); }
  for (let d = firstDifat, guard = 0; d < END && fatSecs.length < nFat && guard < 10000; guard++) {
    const per = secSize / 4 - 1;
    for (let i = 0; i < per && fatSecs.length < nFat; i++) { const s = u32(secOff(d) + i * 4); if (s < END) fatSecs.push(s); }
    d = u32(secOff(d) + per * 4);
  }
  const fat = [];
  for (const s of fatSecs) for (let i = 0; i < secSize / 4; i++) fat.push(u32(secOff(s) + i * 4));
  const chain = (start, table) => { const out = []; for (let s = start, g = 0; s < END && g < 1e6; g++) { out.push(s); s = table[s]; } return out; };
  const readChain = start => {
    const secs = chain(start, fat), out = new Uint8Array(secs.length * secSize);
    secs.forEach((s, i) => out.set(bytes.subarray(secOff(s), secOff(s) + secSize), i * secSize));
    return out;
  };
  // 디렉터리
  const dir = readChain(firstDir), ddv = new DataView(dir.buffer);
  const entries = [];
  for (let o = 0; o + 128 <= dir.length; o += 128) {
    const nameLen = ddv.getUint16(o + 0x40, true);
    let name = '';
    for (let i = 0; i < Math.max(0, nameLen / 2 - 1); i++) name += String.fromCharCode(ddv.getUint16(o + i * 2, true));
    entries.push({ name, type: dir[o + 0x42], left: ddv.getUint32(o + 0x44, true), right: ddv.getUint32(o + 0x48, true),
      child: ddv.getUint32(o + 0x4C, true), start: ddv.getUint32(o + 0x74, true), size: ddv.getUint32(o + 0x78, true) });
  }
  const root = entries[0];
  const miniStream = root && root.start < END ? readChain(root.start) : new Uint8Array(0);
  const miniFat = [];
  if (firstMiniFat < END) { const mf = readChain(firstMiniFat), mdv = new DataView(mf.buffer); for (let i = 0; i + 4 <= mf.length; i += 4) miniFat.push(mdv.getUint32(i, true)); }
  const readStream = e => {
    if (e.size < cutoff) {
      const secs = chain(e.start, miniFat), out = new Uint8Array(secs.length * miniSize);
      secs.forEach((s, i) => out.set(miniStream.subarray(s * miniSize, (s + 1) * miniSize), i * miniSize));
      return out.subarray(0, e.size);
    }
    return readChain(e.start).subarray(0, e.size);
  };
  // 트리(왼쪽·오른쪽 형제, 자식)를 돌며 경로를 만든다
  const out = {};
  const walk = (idx, prefix, seen) => {
    if (idx >= END || idx >= entries.length || seen.has(idx)) return;
    seen.add(idx);
    const e = entries[idx];
    walk(e.left, prefix, seen); walk(e.right, prefix, seen);
    const path = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.type === 2) out[path] = readStream(e);
    else if (e.type === 1) walk(e.child, path, seen);
  };
  if (root) walk(root.child, '', new Set());
  return out;
}

async function inflateRaw(bytes) {
  const ds = new DecompressionStream('deflate-raw');
  const buf = await new Response(new Blob([bytes]).stream().pipeThrough(ds)).arrayBuffer();
  return new Uint8Array(buf);
}

/** HWP 레코드 → 줄 목록. 본문 문단은 한 줄씩, 표는 한 행이 한 줄(칸은 탭) */
function hwpRecordsToLines(data) {
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const lines = [];
  let cur = null;          // 지금 쓰는 줄
  let table = 0, row = -1; // 지금 표 번호·행
  let inCell = false, cellLevel = -1, cellHasText = false;
  const flush = () => { if (cur !== null && cur.replace(/\t/g, '').trim()) lines.push(cur.replace(/[  ]+/g, ' ').trim()); cur = null; };
  for (let i = 0; i + 4 <= data.length;) {
    const h = dv.getUint32(i, true); i += 4;
    const tag = h & 0x3ff, level = (h >> 10) & 0x3ff;
    let size = (h >>> 20) & 0xfff;
    if (size === 0xfff) { size = dv.getUint32(i, true); i += 4; }
    const rec = data.subarray(i, i + size); i += size;
    if (tag === 77) { table++; row = -1; continue; }                       // HWPTAG_TABLE
    if (tag === 72 && size >= 16) {                                         // HWPTAG_LIST_HEADER (표의 칸)
      const rdv = new DataView(rec.buffer, rec.byteOffset, rec.byteLength);
      const r = rdv.getUint16(10, true);
      if (r !== row || cur === null) { flush(); cur = ''; row = r; } else cur += '\t';
      inCell = true; cellLevel = level; cellHasText = false;
      continue;
    }
    if (tag === 66) {                                                       // HWPTAG_PARA_HEADER
      if (inCell && level < cellLevel) { inCell = false; flush(); row = -1; }
      if (!inCell) { flush(); cur = ''; }
      continue;
    }
    if (tag !== 67) continue;                                               // HWPTAG_PARA_TEXT
    let t = '';
    for (let j = 0; j + 2 <= rec.length;) {
      const ch = rec[j] | (rec[j + 1] << 8);
      if (ch < 32) {
        if ([1, 2, 3, 11, 12, 14, 15, 16, 17, 18, 21, 22, 23, 4, 5, 6, 7, 8, 9, 19, 20].includes(ch)) { if (ch === 9) t += ' '; j += 16; continue; }
        if (ch === 10) t += ' ';
        j += 2; continue;
      }
      t += String.fromCharCode(ch); j += 2;
    }
    if (cur === null) cur = '';
    cur += t;   // 한 칸 안의 여러 문단(줄바꿈된 과목명 등)은 붙여 쓴다
    cellHasText = true;
  }
  flush();
  return lines;
}

/** .hwp 바이트 → 글자(줄바꿈으로 구분) */
async function hwpToText(bytes) {
  const st = cfbStreams(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
  const fh = st['FileHeader'];
  if (!fh || !String.fromCharCode(...fh.subarray(0, 17)).startsWith('HWP Document File')) throw new Error('한글(.hwp 5.0) 문서가 아니에요.');
  const props = new DataView(fh.buffer, fh.byteOffset, fh.byteLength).getUint32(36, true);
  if (props & 2) throw new Error('암호가 걸린 한글 문서는 읽을 수 없어요. 암호를 풀고 다시 저장해 주세요.');
  const secs = Object.keys(st).filter(k => /^BodyText\/Section\d+$/.test(k)).sort((a, b) => +a.slice(16) - +b.slice(16));
  const out = [];
  for (const k of secs) out.push(...hwpRecordsToLines((props & 1) ? await inflateRaw(st[k]) : st[k]));
  return out.join('\n');
}
