# 股票价值分析系统

基于 AI 的股票价值投资分析工具，使用 Next.js 14+ 构建。

## 功能特性

- 🔍 **股票搜索** - 支持代码和名称搜索，覆盖 A股、港股、美股
- 📊 **五维分析** - 从行业、公司、估值、逆向、定价权五个维度全面评估
- 🤖 **AI 分析** - 使用 Claude AI 进行深度价值分析
- 📈 **实时流式** - 分析过程实时流式展示
- 📋 **报告管理** - 保存、查看、导出分析报告
- 🎯 **风险识别** - 一票否决机制，快速识别潜在风险

## 技术栈

- **框架**: Next.js 14+ (App Router)
- **语言**: TypeScript
- **前端**: React + Tailwind CSS + shadcn/ui
- **图表**: Recharts
- **AI**: Anthropic Claude SDK
- **数据**: Python 脚本作为子进程调用

## 快速开始

### 前置要求

- Node.js 18+
- Python 3.8+ (用于数据采集)
- Anthropic API Key

### 安装

```bash
# 安装依赖
npm install

# 配置环境变量
cp .env.example .env.local
# 编辑 .env.local，添加 ANTHROPIC_API_KEY
```

### 运行

```bash
# 开发模式
npm run dev

# 生产构建
npm run build
npm start
```

访问 http://localhost:3000

## 项目结构

```
src/
├── app/                    # Next.js App Router
│   ├── layout.tsx         # 全局布局
│   ├── page.tsx           # 首页
│   ├── analyze/           # 分析页面
│   └── reports/           # 报告页面
│
├── components/            # React 组件
│   ├── ui/               # shadcn/ui 组件
│   ├── StockSearch.tsx   # 股票搜索
│   ├── AnalysisProgress.tsx  # 分析进度
│   ├── ScoreDashboard.tsx    # 评分仪表盘
│   ├── RadarChart.tsx    # 雷达图
│   ├── MetricCards.tsx   # 指标卡片
│   ├── ReportView.tsx    # 报告视图
│   └── ReportList.tsx    # 报告列表
│
├── lib/                   # 核心逻辑
│   ├── analyzer.ts       # 分析编排器
│   ├── claude.ts         # Claude API 封装
│   ├── data-fetcher.ts   # 数据采集
│   ├── report-parser.ts  # 报告解析
│   ├── storage.ts        # 存储模块
│   ├── stock-search.ts   # 股票搜索
│   └── utils.ts          # 工具函数
│
└── app/api/              # API Routes
    ├── analyze/          # 分析接口
    ├── reports/          # 报告接口
    └── search/           # 搜索接口
```

## API 接口

### POST /api/analyze
触发股票分析（SSE 流式返回）

### GET /api/reports
获取报告列表

### GET /api/reports/[id]
获取单份报告

### DELETE /api/reports/[id]
删除报告

### GET /api/search?q=xxx
搜索股票

## 环境变量

```env
ANTHROPIC_API_KEY=your_api_key_here
```

## 许可证

MIT
