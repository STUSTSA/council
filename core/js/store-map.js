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

  /* ===== 卡片的逐行內容（03） =====
     畫面上（state、GitHub 模式的資料檔）：ev.blocks＝[{id, text, check, timeId}]，每一行三種之一：
       純文字（check null）、核取（check false／true）、時間＋核取（check＋timeId 指向這張卡片的一個時間標記 times[].id）。
     id＝行 ID（只在這張卡片裡不重複），插入、刪除一行時其他行的勾選與時間跟著 ID 走，不會掛錯行。
     desc 由 blocks 衍生（descOf，核取攤成「☑ 」「☐ 」開頭的文字）：搜尋、會議紀錄、舊網站、回復匯出都讀 desc。
     Firestore 的 cards.blocks（與版本）是四個一樣長的陣列 {id:[], text:[], check:[], time:[]}（fsBlocks／fromFsBlocks；
     規則要逐行檢查形狀，陣列才能整欄一次檢查，見 firestore.rules 的 blocksOk）。02D 遷移的舊卡片是 [{id, text, check, timeId}]，讀得到，存檔時換成新格式。
     上限跟規則相同：最多 BLK_MAX 行、每行最多 TXT_MAX 字。 */
  const BLK_MAX = 50, TXT_MAX = 1000, CHK = { done: "☑ ", todo: "☐ " };
  /* 03 審查（P1-1）：卡片最多 LNK_MAX 個超連結；超連結、議題註記的顏色只收 #rrggbb（畫面把顏色放進 style，規則 linksOk 也檢查卡片的超連結）。
     讀回來時不合格的超連結顏色換成預設色（＝util.js 的 COLORS[0]）、註記拿掉顏色（畫面用預設色）；網頁 normalize 時再清一次（state.js 的 linksFix） */
  const LNK_MAX = 10, HEX = /^#[0-9a-f]{6}$/i, LINK_COLOR = "#6a4fd8";
  const linksIn = l => (Array.isArray(l) ? l : []).filter(x => x && typeof x === "object").map(x => ({ ...copy(x), color: HEX.test(x.color) ? x.color : LINK_COLOR }));
  const lineOf = b => (b && typeof b.check === "boolean" ? (b.check ? CHK.done : CHK.todo) : "") + String((b && b.text) || "");
  const descOf = blocks => (blocks || []).map(lineOf).join("\n");
  /* 新的行 ID：決定性（L0、L1…），跟這張卡片已有的 ID 撞到就加後綴 */
  const freshId = (seen, n) => { let id = `L${n}`, k = 0; while (seen.has(id)) id = `L${n}_${++k}`; seen.add(id); return id; };
  const checkOf = c => typeof c === "boolean" ? c : c && typeof c === "object" ? !!c.done : null;   /* 舊的 {done} 物件也接受 */
  /* 整理一份 blocks：形狀不對的修好（行 ID 不合格或重複就換新的、文字去掉換行、check 只能是 null／true／false）；
     timeIds＝這張卡片的時間標記 ID（Set），不在裡面或被前面的行用過的 timeId 改成 null；有 timeId 一定有 check */
  function cleanBlocks(list, timeIds) {
    const seen = new Set(), used = new Set(), out = [];
    (Array.isArray(list) ? list : []).forEach(b => {
      if (!b || typeof b !== "object") return;
      const id = typeof b.id === "string" && SAFE_ID.test(b.id) && !seen.has(b.id) ? b.id : null;
      if (id) seen.add(id);
      const t = typeof b.timeId === "string" && timeIds && timeIds.has(b.timeId) && !used.has(b.timeId) ? b.timeId : null;
      if (t) used.add(t);
      const c = checkOf(b.check);
      out.push({ id, text: String(b.text == null ? "" : b.text).replace(/[\r\n]+/g, " "), check: c === null && t ? false : c, timeId: t });
    });
    out.forEach((b, n) => { if (!b.id) b.id = freshId(seen, n); });
    return out;
  }
  /* 從 desc 重建 blocks：跟舊的某一行（攤平後）完全相同的沿用那一行（ID、勾選、時間），其他是純文字的新行。
     舊卡片（只有 desc）、舊網站或會議編輯只改了 desc 的資料都走這裡 */
  function blocksFromDesc(desc, old) {
    const pool = new Map(), keep = new Set();
    (old || []).forEach(b => { const k = lineOf(b); if (!pool.has(k)) pool.set(k, []); pool.get(k).push(b); });
    const out = (desc ? String(desc).split("\n") : []).map(line => {
      const m = (pool.get(line) || []).shift();
      if (m) { keep.add(m.id); return copy(m); }
      return { id: null, text: line.replace(/\r/g, ""), check: null, timeId: null };
    });
    out.forEach((b, n) => { if (!b.id) b.id = freshId(keep, n); });
    return out;
  }
  /* 一張卡片（畫面上的格式：e.times、e.blocks、e.desc）的 blocks 與 desc 對齊：沒有 blocks＝每行純文字；
     desc 跟 blocks 攤平後不同（舊網站、會議編輯改了 desc）＝照 desc 重建、能對上的行沿用。回傳整理好的 blocks（不改 e） */
  function blocksOf(e) {
    const tids = new Set((e.times || []).map(t => t.id));
    const hasDesc = typeof e.desc === "string";
    if (!Array.isArray(e.blocks)) return cleanBlocks(blocksFromDesc(hasDesc ? e.desc : "", []), tids);
    const b = cleanBlocks(e.blocks, tids);
    return hasDesc && descOf(b) !== e.desc ? cleanBlocks(blocksFromDesc(e.desc, b), tids) : b;
  }
  /* 畫面 → Firestore（timeId 加部門前綴） */
  const fsBlocks = (dept, list) => ({ id: list.map(b => b.id), text: list.map(b => b.text), check: list.map(b => b.check),
    time: list.map(b => b.timeId ? nid(dept, b.timeId) : null) });
  /* Firestore → 畫面（timeId 拿掉部門前綴）：新格式（四個陣列）或 02D 遷移的舊格式（每行一個物件） */
  function fromFsBlocks(dept, v) {
    const tid = x => typeof x === "string" ? oid(dept, x) : null;
    if (Array.isArray(v)) return v.filter(b => b && typeof b === "object").map(b => ({ id: b.id, text: b.text, check: checkOf(b.check), timeId: tid(b.timeId) }));
    if (!v || typeof v !== "object" || !Array.isArray(v.id)) return [];
    return v.id.map((id, n) => ({ id, text: (v.text || [])[n], check: checkOf((v.check || [])[n]), timeId: tid((v.time || [])[n]) }));
  }

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
      /* 舊資料（只有 desc）：每行一個純文字行（ID {卡片}_L{n}）。03 之後 GitHub 模式存的檔案有 blocks：照 blocks 搬（timeId 加部門前綴） */
      const own = Array.isArray(e.blocks) ? blocksOf(e) : lines.map((text, n) => ({ id: `${id}_L${n}`, text, check: null, timeId: null }));
      const blocks = fsBlocks(dept, own);
      const blockOfTime = new Map(own.filter(b => b.timeId).map(b => [nid(dept, b.timeId), b.id]));
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
          deptId: dept, cardId: id, blockId: blockOfTime.get(nid(dept, t.id)) || null, label: t.label || "", start: ts(st.ms), end: ts(Math.max(en.ms, st.ms)),
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
      note: i.note, tags: copy(i.tags || []), labels: (i.labels || []).map(x => oid(dept, x)), links: linksIn(i.links),
      staff: (i.staff || []).map(x => fromStaff(dept, x)), doneAt: i.doneAt || null,
      markers: (i.markers || []).map(m => clean({ ...copy(m), color: HEX.test(m.color) ? m.color : undefined, evId: m.evId ? oid(dept, m.evId) : m.evId, tmId: m.tmId ? oid(dept, m.tmId) : m.tmId })) }));
    s.weeks = (src.weeks || []).slice().sort((a, b) => (a.date < b.date ? 1 : -1)).map(w => clean({ id: oid(dept, w.id), date: w.date, text: w.text, auto: w.auto || undefined }));
    const evByCard = {};
    (src.events || []).forEach(e => { if (e.cardId) (evByCard[e.cardId] = evByCard[e.cardId] || []).push(e); });
    s.events = (src.cards || []).filter(c => c.state === "open" || c.state === "done").sort(byOrder).map(c => {
      const ev = evByCard[c.id] || [], order = c.timeIds || [];
      ev.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
      /* 03：逐行內容原樣帶進畫面（timeId 拿掉部門前綴）；desc 由 blocks 衍生（舊網站、回復匯出讀的是 desc） */
      const blocks = fromFsBlocks(dept, c.blocks);
      return clean({ id: oid(dept, c.id), name: c.title, desc: descOf(blocks), blocks,
        issueId: c.issueId ? oid(dept, c.issueId) : null, staff: (c.staff || []).map(x => fromStaff(dept, x)),
        labels: (c.labels || []).map(x => oid(dept, x)), links: linksIn(c.links), report: !!c.report,
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
      const id = evIds[k], r = R.cards.get(id), st = e.doneAt ? "done" : "open";
      /* 03：以 e.blocks 為準（行 ID 穩定，勾選與時間跟著行走）；只改了 desc 的（舊流程）照 desc 對齊，見 blocksOf */
      const own = blocksOf(e), blocks = fsBlocks(dept, own);
      const blockOfTime = new Map(own.filter(b => b.timeId).map(b => [nid(dept, b.timeId), b.id]));
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
        out.events[eid] = clean({ deptId: dept, cardId: id, blockId: blockOfTime.get(eid) || null, label: t.label || "",
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

  const api = { parseTaipei, fmtTaipei, toDocs, toState, desired, nid, oid, plain, SAFE_ID, BLK_MAX, TXT_MAX, LNK_MAX, descOf, lineOf, blocksOf, blocksFromDesc, fromFsBlocks };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.StoreMap = api;
})(typeof window !== "undefined" ? window : globalThis);
