# qrcode-generator（第三方程式，不要修改）

- 用途：系統管理 → QR 邀請畫出 QR（`core/js/account.js` 的 `qrSvg`，只有打開那個畫面才載入）。
- 來源：npm 套件 `qrcode-generator` **1.4.4** 裡的 `qrcode.js`，原檔沒有修改。
  - 作者：Kazuhiko Arase（https://github.com/kazuhikoarase/qrcode-generator）
  - 授權：MIT（`LICENSE`，取自上游 repo；`qrcode.js` 檔頭也有授權聲明）
  - npm integrity：`sha512-HM7yY8O2ilqhmULxGMpcHSF1EhJJ9yBj8gvDEuZ6M+KGJ0YY2hKpnXvRD+hZPLrDVck3ExIGhmPtSdcjC+guuw==`
  - `qrcode.js` 的 SHA-256：`18ae399f81182bc9de916e9c77b195df20cc58d6f2d55a62b085a299f1bf1780`
- 2026-11-13（階段 02B）加入。要換版本時整個檔案換掉、更新這份說明的版本與雜湊，並重跑 `npm run test:web`（`tools/tests/acc1.js`）。
