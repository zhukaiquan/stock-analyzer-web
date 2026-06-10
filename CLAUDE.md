# 股票价值分析系统 — 项目规则

## 技术栈
- Next.js 16 (App Router) + TypeScript + Tailwind CSS + shadcn/ui
- DeepSeek API (OpenAI-compatible) for AI analysis
- Python script (`../stock-value-analyzer/scripts/fetch_stock_data.py`) for data fetching
- Recharts for charts, ReactMarkdown for rendering

## 目录结构
```
src/
├── app/                    # Pages (App Router)
│   ├── page.tsx           # Home (search + recent reports)
│   ├── analyze/page.tsx   # Analysis page (SSE streaming)
│   └── reports/[id]/      # Report detail
├── components/            # UI components
│   ├── ui/               # shadcn/ui primitives
│   ├── ScoreDashboard    # Score circle + conclusion
│   ├── DimensionBreakdown # 5-dimension progress bars
│   ├── KeyMetrics        # Metric cards grid
│   ├── ReportView        # Markdown renderer
│   └── StockSearch       # Search with debounce
├── lib/                   # Core logic
│   ├── analyzer.ts       # Orchestrates fetch → Claude → parse → save
│   ├── claude.ts         # DeepSeek API (streaming)
│   ├── data-fetcher.ts   # Python subprocess wrapper
│   ├── report-parser.ts  # Markdown → structured data
│   ├── storage.ts        # JSON file storage
│   └── stock-search.ts   # Stock symbol/name lookup
└── app/api/              # API Routes
    ├── analyze/          # POST: trigger analysis (SSE)
    ├── reports/          # GET: list reports
    ├── reports/[id]/     # GET/DELETE: single report
    └── search/           # GET: stock search
```

## 环境变量
- `DEEPSEEK_API_KEY` — DeepSeek API key (required)

## 关键规则
1. **Python 脚本路径**: `../stock-value-analyzer/scripts/fetch_stock_data.py` (relative to project root)
2. **报告存储**: `../output/reports/{id}.json` + `.md`
3. **API 使用 DeepSeek** (not Anthropic Claude) — base URL: `https://api.deepseek.com`
4. **流式分析**: 使用 SSE (Server-Sent Events) 推送进度
5. **报告解析**: `report-parser.ts` 使用灵活正则匹配 AI 生成的各种 markdown 格式

## 常用命令
```bash
npm run dev      # Start dev server (port 3000)
npm run build    # Production build
npm start        # Start production server
```

## 已知问题
- Python 数据采集脚本的 `stock_individual_info_em` 接口可能因代理问题失败，导致股价/市值为 null
- AI 每次生成的 markdown 格式不完全一致，parser 使用多模式匹配处理
- ROE 需要区分季度值和年化值，parser 优先取年化值

## 深入文档
- [系统架构](docs/architecture.md)
- [API 参考](docs/api-reference.md)
