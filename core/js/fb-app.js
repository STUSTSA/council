/* 核心｜Firebase 初始化（02B）。ES module：store-firestore.js（讀看板）與 fb-account.js（登入、角色、邀請）共用同一個 app。
   cfg＝dept/config.js 的 BOARD_BASE.firebase（網頁設定，不是機密）。emulator 只給本機測試用：
   { host, port }＝Firestore 模擬器；auth＝Auth 模擬器網址（例如 "http://127.0.0.1:9099"）；mockUserToken＝不經 Auth、直接假裝登入（01B 的測試）。
   只開 Google 一種登入方式（規則也只接受 google.com 且信箱已驗證）；登入狀態存在這台裝置（Firebase 預設的本機保存）。 */
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import { getFirestore, connectFirestoreEmulator } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";
import { getAuth, connectAuthEmulator } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

let fbs = null;
export function fb(cfg) {
  if (fbs) return fbs;
  if (!cfg || !cfg.projectId) throw new Error("dept/config.js 的 firebase 設定還沒填");
  const app = initializeApp({ apiKey: cfg.apiKey, authDomain: cfg.authDomain, projectId: cfg.projectId, appId: cfg.appId });
  const db = getFirestore(app), auth = getAuth(app), e = cfg.emulator;
  auth.languageCode = "zh-TW";
  if (e) {
    connectFirestoreEmulator(db, e.host, e.port, e.mockUserToken ? { mockUserToken: e.mockUserToken } : undefined);
    if (e.auth) connectAuthEmulator(auth, e.auth, { disableWarnings: true });
  }
  return (fbs = { app, db, auth });
}
/* 等登入狀態從這台裝置讀回來（重新整理後不會先被當成未登入） */
export const authReady = cfg => fb(cfg).auth.authStateReady();
