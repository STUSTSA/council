/* 核心｜AI 小幫手的模型連線（ES module，只有小幫手第一次被打開時才載入，其他頁面完全不載入）。
   用 Firebase AI Logic 接 Gemini Developer API：金鑰放在 Firebase 後端，網頁裡沒有任何機密；防濫用靠 App Check（有填 appCheckSiteKey 才啟用）。
   SDK 版本要跟 fb-app.js 的 import 網址同一個（改版時兩邊一起改）。
   decls＝查詢函式的宣告：[{name, description, params:{名稱:{d:說明, enum?:[…]}}}]（參數都是選填字串）。
   回傳 {send(parts)}：send 回 {text, calls:[{name,args}]}；parts＝字串，或要回給模型的 [{functionResponse:{name,response}}]。 */
import { fb } from "./fb-app.js";
import { getAI, getGenerativeModel, GoogleAIBackend, Schema } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-ai.js";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app-check.js";

let acOn = false;
const toDecl = d => {
  const keys = Object.keys(d.params || {});
  const o = { name: d.name, description: d.description };
  if (keys.length) o.parameters = Schema.object({
    properties: Object.fromEntries(keys.map(k => [k, d.params[k].enum
      ? Schema.enumString({ enum: d.params[k].enum, description: d.params[k].d })
      : Schema.string({ description: d.params[k].d })])),
    optionalProperties: keys });
  return o;
};

async function start(cfg, ai, system, decls) {
  const { app } = fb(cfg);
  if (ai.appCheckSiteKey && !acOn) {
    acOn = true;
    initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(ai.appCheckSiteKey), isTokenAutoRefreshEnabled: true });
  }
  const model = getGenerativeModel(getAI(app, { backend: new GoogleAIBackend() }), {
    model: ai.model, systemInstruction: system,
    tools: [{ functionDeclarations: decls.map(toDecl) }],
    generationConfig: { temperature: 0.2, maxOutputTokens: 900 } });
  const chat = model.startChat();
  return { send: async parts => {
    const r = (await chat.sendMessage(parts)).response, calls = r.functionCalls() || [];
    return { text: calls.length ? "" : r.text(), calls: calls.map(c => ({ name: c.name, args: c.args || {} })) };
  } };
}

window.BoardAI = { start };
dispatchEvent(new Event("board-ai-ready"));
