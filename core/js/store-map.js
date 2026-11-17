/* 核心｜資料對照（01B）：舊資料檔（schemaVersion 13）⇄ Firestore 文件
   遷移程式（backend/migrate/，Node）與網頁的 Firestore 讀取（core/js/store-firestore.js）共用這一份，
   所以「搬進去」與「讀回來」一定是同一套對照（欄位表見 docs/architecture/migration.md 第 1 節）。
   純函式、不碰網路與畫面。時間值一律用 {__ts: 毫秒}，伺服器時間用 {__now: true}，由呼叫端換成 Firestore 的型別。
   只用白名單搬欄位：sync（權杖）、pwKdf、members[].kdf／tok 永遠不會被搬（migration.md V6）。 */
(function (root) {
  "use strict";
  const TZ_MS = 8 * 3600 * 1000;                     /* Asia/Taipei，沒有日光節約時間 */
  const NOW = { __now: true };
  const ts = ms => ({ __ts: ms });

  /* "YYYY-MM-DD"＝全天；"YYYY-MM-DDTHH:MM" 或空白分隔＝台灣時間。其他格式回傳 null（列進報告，不猜） */
  function parseTaipei(s) {
    if (typeof s !== "string") return null;
    const m = s.trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
    if (!m) return null;
    const ms = Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)) - TZ_MS;
    return { ms, allDay: m[4] == null };
  }
  const pad = n => String(n).padStart(2, "0");
  function fmtTaipei(ms, allDay) {
    const d = new Date(ms + TZ_MS);
    const day = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
    return allDay ? day : `${day} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
  }
  /* 舊資料的日期欄位（createdAt、doneAt）：只有日期就存當天 00:00；讀回來時是 00:00 就只顯示日期 */
  const tsOf = s => { const p = parseTaipei(s); return p ? ts(p.ms) : null; };
  const strOf = v => v && typeof v.__ts === "number" ? fmtTaipei(v.__ts, (v.__ts + TZ_MS) % 86400000 === 0) : null;

  const nid = (dept, id) => `${dept}__${id}`;
  /* 02D 審查（P0）：文件 ID 只接受英數、底線、連字號（跟規則 safeId 相同）。讀回來時不合格的文件整份略過，不放進畫面
     （ID 會進到畫面的屬性；規則已擋下建立，這裡是第二道） */
  const SAFE_ID = /^[A-Za-z0-9_-]{1,120}$/;
  const safe = list => (list || []).filter(d => d && typeof d.id === "string" && SAFE_ID.test(d.id));
  const oid = (dept, id) => typeof id === "string" && id.startsWith(dept + "__") ? id.slice(dept.length + 2) : id;
  const legacyStaff = (dept, id) => `legacy:${dept}__${id}`;
  const fromStaff = (dept, s) => typeof s === "string" && s.startsWith(`legacy:${dept}__`) ? s.slice(`legacy:${dept}__`.length) : s;
  const clean = o => { Object.keys(o).forEach(k => o[k] === undefined && delete o[k]); return o; };
  const copy = v => v == null ? v : JSON.parse(JSON.stringify(v));

  /* ===== 舊 → 新 =====
     state：已經是 schemaVersion 13 的部門資料；dept：部門代號；opt：{batch, uid}
     回傳 {docs:[{path, data, kind}], report}；kind 決定寫入順序與分批（遷移程式用） */
  function toDocs(dept, state, opt) {
    const B = opt.batch, U = opt.uid;
    const docs = [], report = { dept, broken: [], badTimes: [], multiline: 0, counts: {} };
    const add = (kind, path, data) => { docs.push({ kind, path, data: clean(data) }); report.counts[kind] = (report.counts[kind] || 0) + 1; };
    const stamp = { updatedAt: NOW, updatedBy: U };
    const evIds = new Set((state.events || []).map(e => e.id));
    const tmIds = new Set([].concat(...(state.events || []).map(e => (e.times || []).map(t => t.id))));
    const isIds = new Set((state.issues || []).map(i => i.id));
    const lbIds = new Set((state.labels || []).map(l => l.id));
    const memIds = new Set((state.members || []).map(m => m.id));
    const link = (what, from, id, ok) => { if (id != null && id !== "" && !ok) report.broken.push({ what, from, id }); };

    (state.members || []).forEach(m => add("legacyIdentities", `legacyIdentities/${nid(dept, m.id)}`, {
      deptId: dept, name: String(m.name || ""), oldRole: m.role === "admin" ? "admin" : "member", createdAt: String(m.createdAt || ""),
      claimedBy: null, claimedAt: null, rev: 1, ...stamp }));

    (state.labels || []).forEach(l => add("labels", `labels/${nid(dept, l.id)}`, { deptId: dept, kind: l.kind, name: l.name, importBatch: B, ...stamp }));

    (state.issues || []).forEach((i, k) => {
      (i.staff || []).forEach(s => link("issue.staff", i.id, s, memIds.has(s)));
      (i.labels || []).forEach(s => link("issue.labels", i.id, s, lbIds.has(s)));
      const st = parseTaipei(i.start), en = parseTaipei(i.end);
      add("issues", `issues/${nid(dept, i.id)}`, {
        deptId: dept, title: String(i.title || ""), cur: +i.cur || 0, start: i.start || "", end: i.end || "",
        startAt: st ? ts(st.ms) : null, endAt: en ? ts(en.ms) : null, note: i.note || "", tags: copy(i.tags || []),
        labels: (i.labels || []).map(x => nid(dept, x)), links: copy(i.links || []), staff: (i.staff || []).map(s => legacyStaff(dept, s)),
        markers: (i.markers || []).map(m => { link("marker.evId", i.id, m.evId, evIds.has(m.evId)); link("marker.tmId", i.id, m.tmId, tmIds.has(m.tmId));
          return clean({ ...copy(m), evId: m.evId ? nid(dept, m.evId) : m.evId, tmId: m.tmId ? nid(dept, m.tmId) : m.tmId }); }),
        doneAt: i.doneAt || null, order: k * 1000, rev: 1, importBatch: B, ...stamp });
    });

    (state.weeks || []).forEach(w => add("weeks", `weeks/${nid(dept, w.id)}`, {
      deptId: dept, date: w.date || "", text: String(w.text || ""), auto: !!w.auto, createdAt: NOW, importBatch: B, ...stamp }));

    (state.events || []).forEach((e, k) => {
      const id = nid(dept, e.id), desc = String(e.desc || "");
      const lines = desc.split("\n");
      if (lines.length > 1) report.multiline++;
      const blocks = lines.map((text, n) => ({ id: `${id}_L${n}`, text, check: null, timeId: null }));
      link("card.issueId", e.id, e.issueId, isIds.has(e.issueId));
      link("card.fromEv", e.id, e.fromEv, evIds.has(e.fromEv));
      (e.staff || []).forEach(s => link("card.staff", e.id, s, memIds.has(s)));
      (e.labels || []).forEach(s => link("card.labels", e.id, s, lbIds.has(s)));
      const done = !!e.doneAt;
      const card = {
        deptId: dept, title: String(e.name || ""), blocks, timeIds: (e.times || []).map(t => nid(dept, t.id)),
        issueId: e.issueId ? nid(dept, e.issueId) : null, staff: (e.staff || []).map(s => legacyStaff(dept, s)),
        labels: (e.labels || []).map(x => nid(dept, x)), links: copy(e.links || []), report: !!e.report,
        state: done ? "done" : "open", doneAt: done ? tsOf(e.doneAt) : null, deletedAt: null, deletedBy: null, order: k * 1000,
        round: e.round, roundAt: e.roundAt, touched: copy(e.touched), touchedAt: e.touchedAt, fromEv: e.fromEv ? nid(dept, e.fromEv) : undefined,
        version: 1, createdAt: e.createdAt ? tsOf(e.createdAt) : null, createdBy: "legacy:import", legacyDesc: desc, importBatch: B, ...stamp };
      if (done && !card.doneAt) report.badTimes.push({ what: "card.doneAt", id: e.id, value: e.doneAt });
      if (e.createdAt && !card.createdAt) report.badTimes.push({ what: "card.createdAt", id: e.id, value: e.createdAt });
      const times = (e.times || []).map(t => ({ id: nid(dept, t.id), label: t.label || "", startRaw: t.start || "", endRaw: t.end || "" }));
      add("cards", `cards/${id}`, card);
      add("versions", `cards/${id}/versions/1`, { cardId: id, deptId: dept, version: 1, title: card.title, blocks: copy(blocks),
        times: times, state: card.state, by: U, at: NOW, imported: true, importBatch: B });
      (e.times || []).forEach(t => {
        const st = parseTaipei(t.start), en = parseTaipei(t.end) || st;
        if (!st) { report.badTimes.push({ what: "time.start", id: t.id, value: t.start }); return; }
        add("events", `events/${nid(dept, t.id)}`, {
          deptId: dept, cardId: id, blockId: null, label: t.label || "", start: ts(st.ms), end: ts(Math.max(en.ms, st.ms)),
          startRaw: t.start || "", endRaw: t.end || "", allDay: st.allDay, place: t.place || "", toIssue: !!t.toIssue,
          scope: "dept", visibility: "internal", rev: 1, importBatch: B, ...stamp });
      });
    });

    const rb = state.reportBase ? { date: state.reportBase.date || "", issues: {} } : null;
    if (rb) Object.entries(state.reportBase.issues || {}).forEach(([k, v]) => { link("reportBase.issue", "reportBase", k, isIds.has(k)); rb.issues[nid(dept, k)] = copy(v); });
    add("deptSettings", `deptSettings/${dept}`, clean({ title: String(state.title || ""), range: copy(state.range || null), reportBase: rb,
      follows: dept === "president" ? (state.follows || []).map(f => ({ ...copy(f), ref: nid(f.dept, f.ref) })) : undefined,
      docs: copy(state.docs || []), rev: 1, ...stamp }));

    if (dept === "secretariat") add("org", "org/config", { yearLabel: state.yearLabel || "", termStart: state.termStart || "",
      semester: ["up", "down"].includes(state.semester) ? state.semester : "", ...stamp });
    if (dept === "president" && state.meetGrant && state.meetGrant.date) {
      const day = parseTaipei(state.meetGrant.date), at = parseTaipei(state.meetGrant.at);
      if (day) add("grants", "grants/meetingEdit", { until: ts(day.ms + 86400000), by: String(state.meetGrant.by || ""),
        at: at ? ts(at.ms) : ts(day.ms), rev: 1, ...stamp });
    }
    const byDate = {};
    (state.minutes || []).forEach(m => { const k = m.date || "unknown"; (byDate[k] = byDate[k] || []).push(copy(m)); });
    Object.entries(byDate).forEach(([k, items]) => add("meetingMinutes", `meetingMinutes/${k}`, { date: k, items, deptId: dept }));
    return { docs, report };
  }

  /* ===== 新 → 舊（網頁讀 Firestore 時用；回傳 schemaVersion 13 的部門資料，交給 normalize） =====
     src：{settings, org, grant, cards, issues, weeks, labels, events, legacy}，每份文件是 {id, ...data}，時間值是 {__ts} */
  function toState(dept, src0, base) {
    const src = Object.assign({}, src0, { cards: safe(src0.cards), issues: safe(src0.issues), weeks: safe(src0.weeks), labels: safe(src0.labels),
      events: safe(src0.events), legacy: safe(src0.legacy) });
    const s = Object.assign({ schemaVersion: 13 }, base || {});
    const st = src.settings || {};
    s.title = st.title || s.title || "";
    if (st.range) s.range = copy(st.range);
    s.reportBase = st.reportBase ? { date: st.reportBase.date, issues: Object.fromEntries(Object.entries(st.reportBase.issues || {}).map(([k, v]) => [oid(dept, k), copy(v)])) } : null;
    s.docs = copy(st.docs || []);
    s.follows = (st.follows || []).map(f => ({ ...copy(f), ref: oid(f.dept, f.ref) }));
    if (src.org) { s.yearLabel = src.org.yearLabel; s.termStart = src.org.termStart; s.semester = src.org.semester; }
    s.meetGrant = null;
    if (src.grant && src.grant.until) s.meetGrant = { date: fmtTaipei(src.grant.until.__ts - 86400000, true), by: src.grant.by || "",
      at: src.grant.at ? fmtTaipei(src.grant.at.__ts, false) : "" };
    s.members = (src.legacy || []).filter(m => m.deptId === dept).map(m => ({ id: oid(dept, m.id), name: m.name, role: m.oldRole, createdAt: m.createdAt }));
    s.labels = (src.labels || []).map(l => ({ id: oid(dept, l.id), kind: l.kind, name: l.name }));
    const byOrder = (a, b) => (a.order || 0) - (b.order || 0);
    s.issues = (src.issues || []).slice().sort(byOrder).map(i => clean({ id: oid(dept, i.id), title: i.title, cur: i.cur, start: i.start, end: i.end,
      note: i.note, tags: copy(i.tags || []), labels: (i.labels || []).map(x => oid(dept, x)), links: copy(i.links || []),
      staff: (i.staff || []).map(x => fromStaff(dept, x)), doneAt: i.doneAt || null,
      markers: (i.markers || []).map(m => clean({ ...copy(m), evId: m.evId ? oid(dept, m.evId) : m.evId, tmId: m.tmId ? oid(dept, m.tmId) : m.tmId })) }));
    s.weeks = (src.weeks || []).slice().sort((a, b) => (a.date < b.date ? 1 : -1)).map(w => clean({ id: oid(dept, w.id), date: w.date, text: w.text, auto: w.auto || undefined }));
    const evByCard = {};
    (src.events || []).forEach(e => { if (e.cardId) (evByCard[e.cardId] = evByCard[e.cardId] || []).push(e); });
    s.events = (src.cards || []).filter(c => c.state === "open" || c.state === "done").sort(byOrder).map(c => {
      const ev = evByCard[c.id] || [], order = c.timeIds || [];
      ev.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
      return clean({ id: oid(dept, c.id), name: c.title, desc: (c.blocks || []).map(b => b.text).join("\n"),
        issueId: c.issueId ? oid(dept, c.issueId) : null, staff: (c.staff || []).map(x => fromStaff(dept, x)),
        labels: (c.labels || []).map(x => oid(dept, x)), links: copy(c.links || []), report: !!c.report,
        times: ev.map(e => ({ id: oid(dept, e.id), label: e.label, start: e.startRaw || fmtTaipei(e.start.__ts, e.allDay),
          end: e.endRaw != null ? e.endRaw : fmtTaipei(e.end.__ts, e.allDay), place: e.place || "", toIssue: !!e.toIssue })),
        createdAt: c.createdAt ? strOf(c.createdAt) : undefined, doneAt: c.state === "done" ? strOf(c.doneAt) : null,
        round: c.round, roundAt: c.roundAt, touched: copy(c.touched), touchedAt: c.touchedAt, fromEv: c.fromEv ? oid(dept, c.fromEv) : undefined });
    });
    return s;
  }

  /* ===== 畫面 → 文件內容（02D：網頁在 firestore 模式的寫入，core/js/store-write.js） =====
     s：畫面上的部門資料（schemaVersion 13）；raw：上次讀回來的文件（toState 的 src），用來保留畫面上沒有的欄位
     （importBatch、legacyDesc、createdAt、行的 id 等）；uid：新卡片的 createdBy。
     回傳每份文件「應該是什麼內容」（不含 updatedAt／updatedBy／version／rev）。store-write.js 對「上次讀回來時的畫面資料」
     與「現在的畫面資料」各算一次，只寫內容不一樣的文件，所以 normalize 補上的預設值不會讓沒改的文件被重寫。
     新文件的 ID 跟遷移一樣是 {deptId}__{畫面上的 ID}（讀回來時 oid 拿掉前綴，畫面上的 ID 不變）。 */
  function desired(dept, s, raw, uid) {
    const by = k => new Map(((raw && raw[k]) || []).map(d => [d.id, d]));
    const R = { cards: by("cards"), issues: by("issues"), weeks: by("weeks"), labels: by("labels"), events: by("events") };
    const keep = (r, keys) => { const o = {}; if (r) keys.forEach(k => { if (k in r) o[k] = copy(r[k]); }); return o; };
    const mem = new Set((s.members || []).map(m => m.id));
    const staff = a => (a || []).map(x => mem.has(x) ? legacyStaff(dept, x) : x);
    const ids = a => (a || []).map(x => nid(dept, x));
    /* 排序值：照畫面順序，原本的值還是遞增就沿用，否則接在前一張後面（只動到順序真的變了的文件） */
    const ordered = (list, M) => { let last = null; return list.map(id => { const r = M.get(id);
      const o = r && typeof r.order === "number" && (last === null || r.order > last) ? r.order : last === null ? 0 : last + 1000; last = o; return o; }); };
    const out = { labels: {}, issues: {}, weeks: {}, cards: {}, events: {}, settings: null };

    (s.labels || []).forEach(l => { const id = nid(dept, l.id);
      out.labels[id] = clean({ deptId: dept, kind: l.kind, name: String(l.name || ""), ...keep(R.labels.get(id), ["importBatch"]) }); });

    const isIds = (s.issues || []).map(i => nid(dept, i.id)), iord = ordered(isIds, R.issues);
    (s.issues || []).forEach((i, k) => { const id = isIds[k], a = parseTaipei(i.start), b = parseTaipei(i.end);
      out.issues[id] = clean({ deptId: dept, title: String(i.title || ""), cur: +i.cur || 0, start: i.start || "", end: i.end || "",
        startAt: a ? ts(a.ms) : null, endAt: b ? ts(b.ms) : null, note: i.note || "", tags: copy(i.tags || []), labels: ids(i.labels),
        links: copy(i.links || []), staff: staff(i.staff),
        markers: (i.markers || []).map(m => clean({ ...copy(m), evId: m.evId ? nid(dept, m.evId) : m.evId, tmId: m.tmId ? nid(dept, m.tmId) : m.tmId })),
        doneAt: i.doneAt || null, order: iord[k], ...keep(R.issues.get(id), ["importBatch"]) }); });

    (s.weeks || []).forEach(w => { const id = nid(dept, w.id), r = R.weeks.get(id);
      out.weeks[id] = clean({ deptId: dept, date: w.date || "", text: String(w.text || ""), auto: !!w.auto,
        ...(r ? keep(r, ["createdAt", "importBatch"]) : { createdAt: NOW }) }); });

    const evIds = (s.events || []).map(e => nid(dept, e.id)), cord = ordered(evIds, R.cards);
    (s.events || []).forEach((e, k) => {
      const id = evIds[k], r = R.cards.get(id), st = e.doneAt ? "done" : "open", rb = (r && r.blocks) || [];
      const blocks = String(e.desc || "").split("\n").map((text, n) => { const b = rb[n];
        return b && b.text === text ? copy(b) : { id: (b && b.id) || `${id}_L${n}`, text, check: b && b.check !== undefined ? copy(b.check) : null, timeId: b && b.timeId !== undefined ? b.timeId : null }; });
      const times = e.times || [];
      const c = { deptId: dept, title: String(e.name || ""), blocks, timeIds: times.map(t => nid(dept, t.id)),
        issueId: e.issueId ? nid(dept, e.issueId) : null, staff: staff(e.staff), labels: ids(e.labels), links: copy(e.links || []),
        report: !!e.report, state: st, order: cord[k], round: e.round, roundAt: e.roundAt, touched: copy(e.touched), touchedAt: e.touchedAt,
        fromEv: e.fromEv ? nid(dept, e.fromEv) : undefined,
        ...keep(r, ["createdAt", "createdBy", "importBatch", "legacyDesc", "purgeLog", "deletedAt", "deletedBy"]) };
      /* 結案時間只能是伺服器時間（規則 stateMove）：狀態沒變就沿用原本的值，剛結案＝伺服器時間，移回＝null */
      if (!r) Object.assign(c, { doneAt: st === "done" ? NOW : null, deletedAt: null, deletedBy: null, createdAt: NOW, createdBy: uid });
      else if (r.state === st) Object.assign(c, keep(r, ["doneAt"]));
      else c.doneAt = st === "done" ? NOW : null;
      out.cards[id] = clean(c);
      times.forEach(t => { const eid = nid(dept, t.id), r2 = R.events.get(eid), a = parseTaipei(t.start), b = parseTaipei(t.end) || a;
        out.events[eid] = clean({ deptId: dept, cardId: id, blockId: r2 && r2.blockId !== undefined ? r2.blockId : null, label: t.label || "",
          start: a ? ts(a.ms) : null, end: a ? ts(Math.max(b.ms, a.ms)) : null, startRaw: t.start || "", endRaw: t.end || "",
          allDay: a ? a.allDay : true, place: t.place || "", toIssue: !!t.toIssue,
          scope: (r2 && r2.scope) || "dept", visibility: (r2 && r2.visibility) || "internal", ...keep(r2, ["title", "summary", "importBatch"]) }); });
    });

    const rb = s.reportBase ? { date: s.reportBase.date || "", issues: Object.fromEntries(Object.entries(s.reportBase.issues || {}).map(([k, v]) => [nid(dept, k), copy(v)])) } : null;
    out.settings = clean({ title: String(s.title || ""), range: copy(s.range || null), reportBase: rb,
      follows: dept === "president" ? (s.follows || []).map(f => ({ ...copy(f), ref: nid(f.dept, f.ref) })) : undefined, docs: copy(s.docs || []) });
    return out;
  }

  /* Firestore 讀回來的值 → 這裡的格式：Timestamp（有 toMillis）換成 {__ts}，其他原樣 */
  const plain = v => Array.isArray(v) ? v.map(plain) : v && typeof v === "object"
    ? (typeof v.toMillis === "function" ? { __ts: v.toMillis() } : Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plain(x)]))) : v;

  const api = { parseTaipei, fmtTaipei, toDocs, toState, desired, nid, oid, plain, SAFE_ID };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.StoreMap = api;
})(typeof window !== "undefined" ? window : globalThis);
