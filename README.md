# ACT Market Overlay

OverlayPlugin 用前端，會監聽 `LogLine` 內的「正在確認『物品』的持有數量。」訊息，將物品名轉成 item id 後查詢 Universalis 目前在售列表。

## 開發

```powershell
npm install
npm run dev
```

## 建置

```powershell
npm run build
```

開發時可將 OverlayPlugin 指到 `http://127.0.0.1:5173/`。建置後也可以將 OverlayPlugin 指到 `dist/index.html`。