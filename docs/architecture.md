# 系统架构

## 数据流

```
用户输入股票代码
    ↓
[1] StockSearch → 解析代码/名称，确定市场 (A/HK/US)
    ↓
[2] DataFetcher → Python 子进程调用 fetch_stock_data.py
    ↓           返回 JSON (价格/估值/财务/增长/分红)
[3] Claude API → DeepSeek 流式分析
    ↓           发送 SKILL.md + 数据 + 股票代码
[4] ReportParser → 从 Markdown 提取结构化数据
    ↓              (评分/维度/指标/结论)
[5] Storage → 保存到 output/reports/{id}.json + .md
    ↓
[6] 前端渲染 → ScoreDashboard + DimensionBreakdown + KeyMetrics
```

## 核心模块

### analyzer.ts — 分析编排器
编排整个分析流程：fetchData → claudeAnalyze → parseReport → saveReport

### claude.ts — AI API 封装
使用 OpenAI-compatible SDK 调用 DeepSeek API，支持流式返回

### data-fetcher.ts — 数据采集
封装 Python 脚本调用，处理 NaN 值 (JSON 不支持 NaN)

### report-parser.ts — 报告解析
使用多模式正则匹配从 AI 生成的 markdown 中提取：
- 综合评分、投资结论
- 五维分析 (行业/公司/估值/逆向/定价权)
- 关键指标 (PE/PB/ROE/毛利率/市值/净利润)

### storage.ts — 文件存储
JSON 文件存储，预留 SQLite 接口

## 前端组件

| 组件 | 职责 |
|------|------|
| ScoreDashboard | 大号评分圆环 + 投资结论 |
| DimensionBreakdown | 五维分析进度条 + 评级 |
| KeyMetrics | 关键指标卡片网格 |
| ReportView | Markdown 渲染 (分段折叠) |
| StockSearch | 股票搜索 (防抖 + 下拉) |
| AnalysisProgress | 流式分析进度 |

## API Routes

| 路由 | 方法 | 描述 |
|------|------|------|
| `/api/analyze` | POST | 触发分析 (SSE 流式返回) |
| `/api/reports` | GET | 报告列表 |
| `/api/reports/[id]` | GET/DELETE | 单份报告 |
| `/api/search?q=xxx` | GET | 股票搜索 |

## 存储结构

```
output/reports/
├── {id}.json    # 完整报告数据 (parsed + markdown)
└── {id}.md      # 原始 markdown 报告
```
