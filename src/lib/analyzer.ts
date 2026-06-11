import { fetchData, StockData } from './data-fetcher';
import { claudeAnalyze } from './ai-client';
import { parseReport, ParsedReport } from './report-parser';
import { saveReport } from './storage';

export interface AnalysisResult {
  id: string;
  markdown: string;
  parsed: ParsedReport;
}

export type ProgressCallback = (step: string, data: unknown) => void;

// 根据市场推断本次数据采集会用到的引擎链
// （和 SKILL.md Step 0.0.1「双引擎职责分工」保持一致）
function describeEngines(market: 'A' | 'HK' | 'US'): { primary: string; fallback: string | null } {
  switch (market) {
    case 'A':
      return { primary: 'AkShare（stock_individual_info_em / stock_financial_abstract）', fallback: null };
    case 'HK':
      return { primary: 'yfinance', fallback: 'AkShare（stock_hk_spot_em）' };
    case 'US':
      return { primary: 'yfinance', fallback: 'AkShare（基础行情）' };
  }
}

export async function analyzeStock(
  symbol: string,
  market: 'A' | 'HK' | 'US',
  onProgress?: ProgressCallback
): Promise<AnalysisResult> {
  const startedAt = Date.now();

  // Step 0.0: API 优先取数（SKILL Step 0.0）
  const engines = describeEngines(market);
  onProgress?.('step', {
    key: 'fetch',
    title: 'Step 0.0 · API 优先取数',
    detail: `调用 Python 脚本 fetch_stock_data.py，主引擎：${engines.primary}${engines.fallback ? `；兜底：${engines.fallback}` : ''}`,
    meta: {
      script: '../stock-value-analyzer/scripts/fetch_stock_data.py',
      args: ['--symbol', symbol, '--market', market, '--print'],
      primary_engine: engines.primary,
      fallback_engine: engines.fallback,
    },
    status: 'running',
  });
  // 保留旧事件以向后兼容（如有其它消费方）
  onProgress?.('fetching_data', { symbol, market });

  let rawData: StockData;
  try {
    rawData = await fetchData(symbol, market);
  } catch (err) {
    onProgress?.('step', {
      key: 'fetch',
      title: 'Step 0.0 · API 优先取数',
      status: 'error',
      detail: `数据采集失败：${(err as Error).message}`,
    });
    onProgress?.('data_error', { error: (err as Error).message });
    throw err;
  }

  // 总结取数结果中的关键字段，让用户看到 AI 真正拿到了什么
  const enginesUsed = ((rawData.raw?.meta as Record<string, unknown> | undefined)?.engines_used as string[] | undefined) ?? [];
  const fetchedFields = [
    rawData.price !== null && `现价 ${rawData.price}`,
    rawData.marketCap !== null && `市值 ${(rawData.marketCap / 1e8).toFixed(1)} 亿`,
    rawData.pe !== null && `PE ${rawData.pe.toFixed(2)}`,
    rawData.pb !== null && `PB ${rawData.pb.toFixed(2)}`,
    rawData.roe !== null && `ROE ${rawData.roe.toFixed(2)}%`,
    rawData.grossMargin !== null && `毛利率 ${rawData.grossMargin.toFixed(2)}%`,
    rawData.dividendYield !== null && `股息率 ${rawData.dividendYield.toFixed(2)}%`,
  ].filter(Boolean) as string[];
  const missingFields = [
    rawData.price === null && '现价',
    rawData.pe === null && 'PE',
    rawData.roe === null && 'ROE',
  ].filter(Boolean) as string[];

  onProgress?.('step', {
    key: 'fetch',
    title: 'Step 0.0 · API 优先取数',
    status: 'done',
    detail: `已拿到 ${rawData.name}（${rawData.symbol}）的结构化数据${enginesUsed.length ? `，引擎：${enginesUsed.join(' + ')}` : ''}`,
    meta: {
      name: rawData.name,
      symbol: rawData.symbol,
      engines_used: enginesUsed,
      key_fields: fetchedFields,
      missing_fields: missingFields,
      elapsed_ms: Date.now() - startedAt,
    },
  });
  onProgress?.('data_fetched', rawData);

  // Step 0.5 + Step 1-7：流式 LLM 分析
  onProgress?.('step', {
    key: 'analyze',
    title: 'Step 0.5 ~ Step 7 · AI 分析',
    detail: '把数据 + SKILL.md（邱国鹭三好原则方法论）+ references 喂给 DeepSeek，开始流式生成报告',
    meta: {
      model: 'deepseek-chat',
      system_prompt_source: '../stock-value-analyzer/SKILL.md + references/*.md',
      steps_to_run: [
        'Step 0.5 · 近 30 天事件扫描',
        'Step 1 · 行业分析（权重 30%）',
        'Step 2 · 公司分析（权重 35%）',
        'Step 3 · 估值分析（权重 25%）',
        'Step 4 · 逆向投资检查（5%，可一票否决）',
        'Step 5 · 定价权专项（5%，可加减分）',
        'Step 6 · 综合评分 + 结论矩阵',
        'Step 7 · 输出附录（信源 / 校验记录）',
        'Step 8 · 交卷前自检',
      ],
    },
    status: 'running',
  });
  onProgress?.('analyzing', { status: 'starting' });

  const stream = await claudeAnalyze(symbol, market, rawData);
  let fullMarkdown = '';

  for await (const chunk of stream) {
    fullMarkdown += chunk;
    onProgress?.('analyzing', { chunk });
  }

  onProgress?.('step', {
    key: 'analyze',
    title: 'Step 0.5 ~ Step 7 · AI 分析',
    status: 'done',
    detail: `生成完成，共 ${fullMarkdown.length.toLocaleString()} 字符`,
    meta: {
      char_count: fullMarkdown.length,
    },
  });
  onProgress?.('analysis_complete', { markdown: fullMarkdown });

  // 解析报告 → 提取评分 / 维度 / 关键指标
  onProgress?.('step', {
    key: 'parse',
    title: '解析报告',
    detail: '用正则 + JSON 兜底从 markdown 中抽取综合评分、五维度评分、关键指标',
    status: 'running',
  });
  const parsed = parseReport(fullMarkdown, symbol, rawData.name, market);
  onProgress?.('step', {
    key: 'parse',
    title: '解析报告',
    status: 'done',
    detail: `综合评分 ${parsed.score}/100，识别到 ${parsed.sections.length} 个章节`,
    meta: {
      score: parsed.score,
      dimensions: parsed.dimensions,
      sections_count: parsed.sections.length,
    },
  });
  onProgress?.('parsed', parsed);

  // 落盘
  onProgress?.('step', {
    key: 'save',
    title: '保存报告',
    detail: '写入 ../output/reports/{id}.json + .md',
    status: 'running',
  });
  const reportId = await saveReport(symbol, market, fullMarkdown, parsed as unknown as Record<string, unknown>);
  onProgress?.('step', {
    key: 'save',
    title: '保存报告',
    status: 'done',
    detail: `已保存：${reportId}`,
    meta: { report_id: reportId },
  });
  onProgress?.('saved', { id: reportId });

  return {
    id: reportId,
    markdown: fullMarkdown,
    parsed
  };
}
