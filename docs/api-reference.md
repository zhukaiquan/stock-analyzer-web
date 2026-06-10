# API 参考

## POST /api/analyze

触发股票分析，SSE 流式返回进度。

**请求体:**
```json
{
  "symbol": "600036",
  "market": "A"  // 可选，默认自动检测
}
```

**SSE 事件:**
| 事件 | 数据 | 描述 |
|------|------|------|
| `fetching_data` | `{symbol, market}` | 开始获取数据 |
| `data_fetched` | `{...stockData}` | 数据获取完成 |
| `analyzing` | `{chunk, partial}` | AI 分析中 (流式) |
| `analysis_complete` | `{markdown}` | 分析完成 |
| `parsed` | `{...parsedReport}` | 报告解析完成 |
| `saved` | `{id}` | 报告已保存 |
| `complete` | `{id, markdown, parsed}` | 全部完成 |
| `error` | `{message}` | 错误 |

**前端使用示例:**
```typescript
const response = await fetch('/api/analyze', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ symbol: '600036', market: 'A' })
});

const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  // Parse SSE events from decoder.decode(value)
}
```

---

## GET /api/reports

获取报告列表，按创建时间倒序。

**响应:**
```json
[
  {
    "id": "uuid",
    "symbol": "600036",
    "name": "招商银行",
    "market": "A",
    "score": 72,
    "conclusion": "🟢 推荐——...",
    "createdAt": "2026-06-08T12:00:00Z"
  }
]
```

---

## GET /api/reports/[id]

获取单份报告详情。

**响应:**
```json
{
  "id": "uuid",
  "symbol": "600036",
  "name": "招商银行",
  "market": "A",
  "score": 72,
  "conclusion": "🟢 推荐——...",
  "createdAt": "2026-06-08T12:00:00Z",
  "markdown": "...完整 markdown...",
  "parsed": {
    "score": 72,
    "conclusion": "🟢 推荐——...",
    "dimensions": {
      "industry": 80,
      "company": 82,
      "valuation": 55,
      "contrarian": 0,
      "pricingPower": 0
    },
    "metrics": {
      "pe": 6.21,
      "pb": 0.87,
      "roe": 13.5,
      "grossMargin": 43.76,
      "dividendYield": 5.0,
      "marketCap": 9990,
      "revenue": null,
      "netIncome": 378.5
    },
    "sections": [...],
    "vetoItems": [...]
  }
}
```

---

## DELETE /api/reports/[id]

删除报告。

**响应:**
```json
{ "success": true }
```

---

## GET /api/search?q=xxx

搜索股票。

**参数:**
- `q` — 搜索关键词 (代码或名称)

**响应:**
```json
[
  {
    "symbol": "600036",
    "name": "招商银行",
    "market": "A",
    "industry": "银行"
  }
]
```
