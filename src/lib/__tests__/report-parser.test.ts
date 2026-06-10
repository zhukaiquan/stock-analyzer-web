import { describe, it, expect } from 'vitest';
import { parseReport } from '@/lib/report-parser';

// =========================================================================
// 测试用例：报告解析器 + JSON Fallback 优化
// 验收标准：
//   1. 标准 Markdown 报告能正确提取评分、结论、维度、指标
//   2. 当正则匹配失败时，JSON fallback 能作为兜底
//   3. 各种格式的指标都能被正确提取
// =========================================================================

// 模拟一份标准报告
const SAMPLE_REPORT = `# 招商银行股份有限公司（600036）价值投资分析报告

> 本分析基于邱国鹭《投资中最简单的事》价值投资方法论（Skill v1.6）

---

## 📋 一、分析概要

| 项目 | 内容 |
|------|------|
| 分析标的 | **招商银行**（600036） |
| 分析日期 | 2026-06-09 |
| **综合评分** | **72 分 / 100** |
| **投资结论** | 🟢 推荐 —— 好行业好公司，估值合理，可标准仓位买入 |

---

## 🏭 二、行业分析（75/100分）

| 维度 | 得分 |
|------|------|
| 行业格局 | 20/25 |
| 定价权 | 18/25 |
| 需求稳定性 | 20/25 |
| 进入壁垒 | 17/25 |

---

## 🏢 三、公司分析（80/100分）

| 维度 | 得分 |
|------|------|
| 护城河 | 30/40 |
| 盈利能力 | 18/20 |
| 财务健康 | 16/20 |
| 管理层 | 16/20 |

### 关键财务指标

| 指标 | 数值 |
|------|------|
| PE(TTM) | 6.5x |
| PB(MRQ) | 0.95x |
| ROE(年化) | 15.2% |
| 净利率 | 48.5% |
| 股息率 | 4.8% |
| 总市值 | ¥16800 亿 |
| 营业收入 | ¥3400 亿 |
| 净利润 | ¥1480 亿 |

---

## 💰 四、估值分析（65/100分）

---

## 🎯 五、投资结论

| 项目 | 内容 |
|------|------|
| 综合得分 | **72/100** |

---

## ⚠️ 一票否决项检查

- 行业评分 < 30 | ✅ 通过 | 行业分75
- 护城河评分 < 10 | ✅ 通过 | 护城河分30
- 财务造假历史 | ✅ 通过 | 无
- 管理层诚信 = 0 | ✅ 通过 | 正常
- 连续3年经营现金流为负 | ✅ 通过 | 正向
- 有息负债率 > 80% | ✅ 通过 | 正常
`;

describe('parseReport - 标准 Markdown 解析', () => {
  it('提取综合评分：72 分', () => {
    const result = parseReport(SAMPLE_REPORT, '600036', '招商银行', 'A');
    expect(result.score).toBe(72);
  });

  it('提取投资结论：🟢 推荐', () => {
    const result = parseReport(SAMPLE_REPORT, '600036', '招商银行', 'A');
    expect(result.conclusion).toContain('🟢');
    expect(result.conclusion).toContain('推荐');
  });

  it('提取公司名称：招商银行', () => {
    const result = parseReport(SAMPLE_REPORT, '600036', '', 'A');
    expect(result.name).toBe('招商银行');
  });

  it('提取行业分析分数：75', () => {
    const result = parseReport(SAMPLE_REPORT, '600036', '招商银行', 'A');
    expect(result.dimensions.industry).toBe(75);
  });

  it('提取公司分析分数：80', () => {
    const result = parseReport(SAMPLE_REPORT, '600036', '招商银行', 'A');
    expect(result.dimensions.company).toBe(80);
  });

  it('提取估值分析分数：65', () => {
    const result = parseReport(SAMPLE_REPORT, '600036', '招商银行', 'A');
    expect(result.dimensions.valuation).toBe(65);
  });

  it('提取逆向机会和定价权分数', () => {
    const report = SAMPLE_REPORT + `
## 🎯 五、逆向机会（62/100分）

## 💪 六、定价权分析（88/100分）
`;
    const result = parseReport(report, '600036', '招商银行', 'A');
    expect(result.dimensions.contrarian).toBe(62);
    expect(result.dimensions.pricingPower).toBe(88);
  });

  it('毛利率不会被净利率抢先匹配', () => {
    const report = `
| 指标 | 数值 |
| 净利率 | 20% |
| 毛利率 | 60% |
`;
    const result = parseReport(report, 'TEST', '测试公司', 'A');
    expect(result.metrics.grossMargin).toBe(60);
  });

  it('只有净利率时不填充毛利率', () => {
    const report = '| 净利率 | 20% |';
    const result = parseReport(report, 'TEST', '测试公司', 'A');
    expect(result.metrics.grossMargin).toBeNull();
  });

  it('提取 PE 指标：6.5', () => {
    const result = parseReport(SAMPLE_REPORT, '600036', '招商银行', 'A');
    expect(result.metrics.pe).toBe(6.5);
  });

  it('提取 PB 指标：0.95', () => {
    const result = parseReport(SAMPLE_REPORT, '600036', '招商银行', 'A');
    expect(result.metrics.pb).toBe(0.95);
  });

  it('提取 ROE 指标：15.2', () => {
    const result = parseReport(SAMPLE_REPORT, '600036', '招商银行', 'A');
    expect(result.metrics.roe).toBe(15.2);
  });

  it('提取股息率：4.8', () => {
    const result = parseReport(SAMPLE_REPORT, '600036', '招商银行', 'A');
    expect(result.metrics.dividendYield).toBe(4.8);
  });

  it('提取市值：16800', () => {
    const result = parseReport(SAMPLE_REPORT, '600036', '招商银行', 'A');
    expect(result.metrics.marketCap).toBe(16800);
  });

  it('提取否决项', () => {
    const result = parseReport(SAMPLE_REPORT, '600036', '招商银行', 'A');
    expect(result.vetoItems.length).toBeGreaterThan(0);
    // 所有否决项应该都通过
    expect(result.vetoItems.every(v => !v.triggered)).toBe(true);
  });

  it('提取章节结构', () => {
    const result = parseReport(SAMPLE_REPORT, '600036', '招商银行', 'A');
    expect(result.sections.length).toBeGreaterThan(0);
    const titles = result.sections.map(s => s.title);
    expect(titles.some(t => t.includes('行业分析'))).toBe(true);
  });
});

describe('parseReport - JSON Fallback 优化（P2 验证）', () => {
  it('当 Markdown 无法提取评分时，从 JSON fallback 获取', () => {
    const reportWithJson = `
# 某公司分析报告

这里是一些分析内容，但格式不符合标准表格。

综合评分大概在 68 分左右。

\`\`\`json
{
  "score": 68,
  "dimensions": {
    "industry": 70,
    "company": 75,
    "valuation": 55,
    "contrarian": 61,
    "pricingPower": 82
  },
  "conclusion": "🟡 可关注"
}
\`\`\`
`;
    const result = parseReport(reportWithJson, 'TEST', '测试公司', 'A');
    // JSON fallback 应能提取到 68 分
    expect(result.score).toBe(68);
    expect(result.dimensions.contrarian).toBe(61);
    expect(result.dimensions.pricingPower).toBe(82);
  });

  it('当 Markdown 和 JSON 都有评分时，优先用 Markdown', () => {
    const reportBoth = SAMPLE_REPORT + `
\`\`\`json
{
  "score": 99,
  "dimensions": {}
}
\`\`\`
`;
    const result = parseReport(reportBoth, '600036', '招商银行', 'A');
    // Markdown 正则应该优先匹配到 72
    expect(result.score).toBe(72);
  });

  it('空报告应返回默认值', () => {
    const result = parseReport('', '', '', '');
    expect(result.score).toBe(0);
    expect(result.conclusion).toBe('暂无结论');
    expect(result.dimensions.industry).toBe(0);
    expect(result.metrics.pe).toBeNull();
  });

  it('非分析 JSON 块不会被误识别', () => {
    const reportWithUnrelatedJson = `
# 分析报告

\`\`\`json
{
  "config": {
    "theme": "dark",
    "version": "1.0"
  }
}
\`\`\`

## 📋 一、分析概要

| **综合评分** | **85 分 / 100** |
`;
    const result = parseReport(reportWithUnrelatedJson, 'TEST', '', 'A');
    // 应该从 Markdown 提取到 85，不受无关 JSON 影响
    expect(result.score).toBe(85);
  });
});

describe('parseReport - 边界情况', () => {
  it('PE 格式：带波浪号 ~6.5x', () => {
    const report = '| PE(TTM) | ~6.5x |';
    const result = parseReport(report, 'TEST', '', 'A');
    expect(result.metrics.pe).toBe(6.5);
  });

  it('市值格式：带逗号 ¥16,800 亿', () => {
    const report = '总市值约 ¥16,800 亿';
    const result = parseReport(report, 'TEST', '', 'A');
    expect(result.metrics.marketCap).toBe(16800);
  });

  it('ROE 格式：ROE(年化) 15.2%', () => {
    const report = '| ROE(年化) | 15.2% |';
    const result = parseReport(report, 'TEST', '', 'A');
    expect(result.metrics.roe).toBe(15.2);
  });
});
