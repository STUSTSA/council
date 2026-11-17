// 語意比對（02D）：舊資料檔 ⇄「從 Firestore 匯出的 schemaVersion 13 JSON」是不是同一份看板內容。
// 遷移測試（讀回來＝原始資料）、往返檢查（--roundtrip）、演練的回復比對（tools/tests/sw1.js）共用這一份。
//
// 不比的欄位（依 docs/architecture/migration.md 第 1 節「不搬」，與只屬於特定部門的欄位；清單同 migration.md 第 9 節）：
// - 檔案層級：schemaVersion、v、id、locked、savedAt、savedBy（記進報告，不搬）
// - 雲端設定與權杖 sync（含 tokenAll、tokenEnc）、部門共用密碼 pwKdf／pwHash、舊身分的 kdf、tok（不搬，V6）
// - 會議紀錄 minutes（搬到 meetingMinutes；看板 firestore 模式不讀，匯入備份時沿用 GitHub 上原本的值）
// - yearLabel、termStart、semester 只比秘書處（其他部門匯出的是全會共用的 org/config）
// - meetGrant、follows 只比會長室（其他部門沒有這兩個功能）
// - 缺值與看板 normalize 補上的預設值視為相同（例如 round 缺＝1、舊身分的角色不是 admin＝member、甘特圖範圍 range 缺＝今天算出的預設範圍，
//   core/js/state.js 的 defaultRange）；週報依日期＋ID 排序後比（新資料庫沒有週報的順序）
export const IGNORED = ['schemaVersion', 'v', 'id', 'locked', 'savedAt', 'savedBy', 'sync', 'pwKdf', 'pwHash', 'members[].kdf', 'members[].tok', 'minutes',
  'yearLabel／termStart／semester（秘書處以外）', 'meetGrant（會長室以外）', 'follows（會長室以外）'];

const ym = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const defaultRange = () => { const d = new Date(); return { start: ym(new Date(d.getFullYear(), d.getMonth() - 1, 1)), end: ym(new Date(d.getFullYear(), d.getMonth() + 4, 1)) }; };
const rangeOf = r => !r || JSON.stringify(r) === JSON.stringify(defaultRange()) ? null : r;

export function canon(s, dept) {
  const ev = e => ({ id: e.id, name: e.name || '', desc: e.desc || '', issueId: e.issueId || null, staff: e.staff || [], labels: e.labels || [],
    links: e.links || [], report: !!e.report, createdAt: e.createdAt || null, doneAt: e.doneAt || null, round: +e.round || 1,
    roundAt: e.roundAt || null, touched: e.touched || [], touchedAt: e.touchedAt || null, fromEv: e.fromEv || null,
    times: (e.times || []).map(x => ({ id: x.id, label: x.label || '', start: x.start || '', end: x.end || '', place: x.place || '', toIssue: !!x.toIssue })) });
  const out = {
    title: s.title || '', range: rangeOf(s.range), reportBase: s.reportBase || null, docs: s.docs || [],
    follows: dept === 'president' ? (s.follows || []) : [],
    members: (s.members || []).map(m => ({ id: m.id, name: m.name, role: m.role === 'admin' ? 'admin' : 'member', createdAt: m.createdAt || '' })),
    labels: s.labels || [],
    issues: (s.issues || []).map(i => ({ id: i.id, title: i.title, cur: i.cur || 0, start: i.start || '', end: i.end || '', note: i.note || '',
      tags: i.tags || [], labels: i.labels || [], links: i.links || [], staff: i.staff || [], doneAt: i.doneAt || null, markers: i.markers || [] })),
    weeks: (s.weeks || []).map(w => ({ id: w.id, date: w.date, text: w.text, auto: !!w.auto })).sort((a, b) => (a.date + a.id < b.date + b.id ? -1 : 1)),
    events: (s.events || []).map(ev),
    meetGrant: dept === 'president' ? (s.meetGrant || null) : null,
  };
  if (dept === 'secretariat') Object.assign(out, { yearLabel: s.yearLabel, termStart: s.termStart, semester: s.semester || '' });
  return JSON.parse(JSON.stringify(out));
}

// 兩份 canon 結果不同的位置（路徑清單，例如 events[3].desc）；相同時回傳空陣列。只列路徑，不印內容
export function diffPaths(a, b, at = '') {
  if (JSON.stringify(a) === JSON.stringify(b)) return [];
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return [`${at}（數量 ${a.length}／${b.length}）`];
    return a.flatMap((x, i) => diffPaths(x, b[i], `${at}[${i}]`));
  }
  if (a && b && typeof a === 'object' && typeof b === 'object')
    return [...new Set([...Object.keys(a), ...Object.keys(b)])].flatMap(k => diffPaths(a[k], b[k], at ? `${at}.${k}` : k));
  return [at || '(整份)'];
}
export const sameBoard = (a, b, dept) => diffPaths(canon(a, dept), canon(b, dept));
