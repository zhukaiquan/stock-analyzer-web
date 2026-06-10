export interface ParsedReport {
  symbol: string;
  name: string;
  market: string;
  score: number;
  conclusion: string;
  dimensions: {
    industry: number;
    company: number;
    valuation: number;
    contrarian: number;
    pricingPower: number;
  };
  metrics: {
    pe: number | null;
    pb: number | null;
    roe: number | null;
    grossMargin: number | null;
    dividendYield: number | null;
    marketCap: number | null;
    revenue: number | null;
    netIncome: number | null;
  };
  vetoItems: Array<{
    item: string;
    triggered: boolean;
    reason: string;
  }>;
  sections: {
    title: string;
    content: string;
  }[];
}

// Flexible number extraction: find metric name, then extract first number after it
function extractMetric(text: string, ...patterns: RegExp[]): number | null {
  for (const p of patterns) {
    const m = text.match(p);
    if (m) {
      // Find the capture group that has the number
      for (let i = 1; i < m.length; i++) {
        if (m[i]) {
          const numStr = m[i].replace(/,/g, '').replace(/~/g, '').trim();
          const num = parseFloat(numStr);
          if (!isNaN(num)) return num;
        }
      }
    }
  }
  return null;
}

function extractNameFromMarkdown(text: string, symbol: string): string {
  const patterns = [
    // "| 分析标的 | **招商银行** |" or "| 分析标的 | 招商银行（600036） |"
    /\|\s*\*?\*?分析标的\*?\*?\s*\|\s*\*?\*?\s*([^\s|（*]+)/,
    // "**招商银行**（600036"
    new RegExp(`\\*\\*([^*]+)\\*\\*（${symbol}`),
    // "600036（招商银行"
    new RegExp(`${symbol}（([^，,）)]+)`),
    // "| 分析标的 | **招商银行（600036）** |"
    /\|\s*\*?\*?分析标的\*?\*?\s*\|\s*\*?\*?\s*\*?\*?([^\s|*（]+(?:银行|集团|公司))/,
  ];

  for (const p of patterns) {
    const m = text.match(p);
    if (m && m[1] && m[1].length >= 2 && !m[1].includes('分析') && !m[1].includes('报告') && !m[1].includes('开始') && !m[1].includes('方法')) {
      return m[1].trim().replace(/\*/g, '');
    }
  }
  return symbol;
}

function extractDimensionScores(text: string, jsonData?: Record<string, unknown> | null): ParsedReport['dimensions'] {
  const dimensionsJson = jsonData?.dimensions && typeof jsonData.dimensions === 'object'
    ? jsonData.dimensions as Record<string, unknown>
    : null;

  const readJsonScore = (...keys: string[]): number => {
    const sources = [dimensionsJson, jsonData].filter(Boolean) as Record<string, unknown>[];
    for (const source of sources) {
      for (const key of keys) {
        const value = source[key];
        if (typeof value === 'number' && Number.isFinite(value)) return value;
        if (typeof value === 'string') {
          const num = parseFloat(value.replace(/,/g, ''));
          if (!isNaN(num)) return num;
        }
      }
    }
    return 0;
  };

  const industryPatterns = [
    /🏭.*?二、行业分析[（(][^）)]*?(\d+(?:\.\d+)?)\s*\/\s*100/,
    /行业分析[（(][^）)]*?(\d+(?:\.\d+)?)\s*\/\s*100/,
    /行业分析[（(]\s*(\d+(?:\.\d+)?)\s*(?:分)?\s*\/\s*100/,
  ];
  const companyPatterns = [
    /🏢.*?三、公司分析[（(][^）)]*?(\d+(?:\.\d+)?)\s*\/\s*100/,
    /公司分析[（(][^）)]*?(\d+(?:\.\d+)?)\s*\/\s*100/,
    /公司分析[（(]\s*(\d+(?:\.\d+)?)\s*(?:分)?\s*\/\s*100/,
  ];
  const valuationPatterns = [
    /💰.*?四、估值分析[（(][^）)]*?(\d+(?:\.\d+)?)\s*\/\s*100/,
    /估值分析[（(][^）)]*?(\d+(?:\.\d+)?)\s*\/\s*100/,
    /估值分析[（(]\s*(\d+(?:\.\d+)?)\s*(?:分)?\s*\/\s*100/,
  ];
  const contrarianPatterns = [
    /(?:🎯|🔄|📉).*?(?:五、)?(?:逆向机会|逆向分析|逆向投资)[^\n（(]*[（(][^）)]*?(\d+(?:\.\d+)?)\s*\/\s*100/,
    /(?:五、)?(?:逆向机会|逆向分析|逆向投资)[^\n（(]*[（(][^）)]*?(\d+(?:\.\d+)?)\s*\/\s*100/,
    /(?:逆向机会|逆向分析|逆向投资)\s*(?:评分|得分)?\s*[：:=|｜]?\s*\*?\*?(\d+(?:\.\d+)?)\s*(?:分)?\s*\/\s*100/,
  ];
  const pricingPowerPatterns = [
    /(?:💪|🏷️|📈).*?(?:六、)?(?:定价权|提价能力|pricing\s*power)[^\n（(]*[（(][^）)]*?(\d+(?:\.\d+)?)\s*\/\s*100/i,
    /(?:六、)?(?:定价权|提价能力|pricing\s*power)[^\n（(]*[（(][^）)]*?(\d+(?:\.\d+)?)\s*\/\s*100/i,
    /(?:定价权|提价能力|pricing\s*power)\s*(?:评分|得分)?\s*[：:=|｜]?\s*\*?\*?(\d+(?:\.\d+)?)\s*(?:分)?\s*\/\s*100/i,
  ];

  const extractWithPatterns = (patterns: RegExp[], fallbackKeys: string[]): number => {
    for (const p of patterns) {
      const m = text.match(p);
      if (m) return parseFloat(m[1]);
    }
    return readJsonScore(...fallbackKeys);
  };

  return {
    industry: extractWithPatterns(industryPatterns, ['industry', '行业', '行业分析']),
    company: extractWithPatterns(companyPatterns, ['company', '公司', '公司分析']),
    valuation: extractWithPatterns(valuationPatterns, ['valuation', '估值', '估值分析']),
    contrarian: extractWithPatterns(contrarianPatterns, ['contrarian', '逆向', '逆向机会', '逆向分析', '逆向投资']),
    pricingPower: extractWithPatterns(pricingPowerPatterns, ['pricingPower', 'pricing_power', '定价权', '提价能力']),
  };
}

function extractSections(text: string): ParsedReport['sections'] {
  const sections: ParsedReport['sections'] = [];
  const sectionRegex = /^#{1,3}\s+(.+)$/gm;
  let match;
  const titles: Array<{ title: string; index: number }> = [];

  while ((match = sectionRegex.exec(text)) !== null) {
    titles.push({ title: match[1], index: match.index });
  }

  for (let i = 0; i < titles.length; i++) {
    const start = titles[i].index;
    const end = i + 1 < titles.length ? titles[i + 1].index : text.length;
    const content = text.slice(start, end).trim();

    if (content.length > 10) {
      sections.push({
        title: titles[i].title,
        content: content
      });
    }
  }

  return sections;
}

/**
 * 尝试从 Markdown 中提取 JSON 块作为 fallback 数据源。
 * 当 LLM 生成的 Markdown 格式不固定导致正则匹配失败时，
 * 可以从报告末尾的 ```json ... ``` 代码块中提取结构化数据。
 */
function extractJsonFallback(markdown: string): Record<string, unknown> | null {
  // 匹配 ```json ... ``` 代码块（取最后一个，通常是 AI 输出的结构化数据）
  const jsonBlocks = [...markdown.matchAll(/```json\s*\n([\s\S]*?)\n\s*```/g)];
  if (jsonBlocks.length === 0) return null;

  for (let i = jsonBlocks.length - 1; i >= 0; i--) {
    try {
      const data = JSON.parse(jsonBlocks[i][1]);
      // 验证是否包含分析相关字段
      if (data && typeof data === 'object' && ('score' in data || '综合评分' in data || 'dimensions' in data)) {
        return data as Record<string, unknown>;
      }
    } catch {
      // Not valid JSON, try next block
    }
  }
  return null;
}

export function parseReport(
  markdown: string,
  symbol: string = '',
  name: string = '',
  market: string = ''
): ParsedReport {
  // 尝试从 Markdown 中提取 JSON 块作为 fallback 数据源
  const jsonData = extractJsonFallback(markdown);

  // Extract overall score (优先用正则，fallback 到 JSON)
  const score = extractMetric(markdown,
    /\|\s*\*?\*?综合评分\*?\*?\s*\|\s*\*?\*?\s*(\d+(?:\.\d+)?)\s*(?:分)?\s*\/?\s*100/,
    /综合评分\*?\*?\s*[|｜]\s*\*?\*?\s*(\d+(?:\.\d+)?)\s*(?:分)?\s*\/?\s*100/,
  ) ?? (jsonData?.score as number) ?? 0;

  // Extract conclusion - FIRST occurrence
  const conclusionPatterns = [
    /\|\s*\*?\*?投资结论\*?\*?\s*\|\s*\*?\*?\s*(🟢|🟡|🔴|🟠)\s*\*?\*?(推荐|可关注|观望|谨慎|不推荐)\*?\*?\s*[-—]?\s*(.*?)\s*\|/,
    /\|\s*\*?\*?投资结论\*?\*?\s*\|\s*\*?\*?\s*(🟢|🟡|🔴|🟠)\s*\*?\*?(推荐|可关注|观望|谨慎|不推荐)\*?\*?\s*(.*)/,
  ];

  let conclusion = '暂无结论';
  for (const p of conclusionPatterns) {
    const m = markdown.match(p);
    if (m) {
      const emoji = m[1] || '';
      const label = m[2] || '';
      const detail = (m[3] || '').trim().replace(/\|.*$/, '').replace(/\*?\*?$/g, '').trim().slice(0, 300);
      conclusion = `${emoji} ${label}${detail ? '——' + detail : ''}`;
      break;
    }
  }

  const extractedName = name || extractNameFromMarkdown(markdown, symbol);
  const dimensions = extractDimensionScores(markdown, jsonData);

  // Flexible metric extraction - search for metric name context, then extract number
  const metrics = {
    // PE: look for "PE" followed by number with optional "x" suffix
    pe: extractMetric(markdown,
      /PE\s*[(（]TTM[）)].*?[~]?(\d+(?:\.\d+)?)\s*(?:倍|x)/i,
      /当前PE.*?[~]?(\d+(?:\.\d+)?)\s*(?:倍|x)/i,
      /PE-TTM.*?[~]?(\d+(?:\.\d+)?)\s*(?:倍|x)/i,
      /PE\s*[≈=:]\s*(\d+(?:\.\d+)?)/i,
      /\|\s*PE.*?\|\s*\*?\*?\s*[~]?(\d+(?:\.\d+)?)\s*(?:倍|x)/i,
    ),

    // PB: look for "PB" followed by number with "倍" or "x" suffix, or in table format
    pb: extractMetric(markdown,
      /\*?\*?PB\s*[(（](?:MRQ|TTM|市净率|当前)[）)]\*?\*?\s*\|\s*\*?\*?\s*[~]?(\d+(?:\.\d+)?)/i,
      /PB\s*[(（](?:MRQ|TTM|市净率)[）)].*?[~]?(\d+(?:\.\d+)?)\s*(?:倍|x)/i,
      /当前PB\s*[：:]\s*[~]?(\d+(?:\.\d+)?)\s*(?:倍|x)/i,
      /当前PB.*?[~]?(\d+(?:\.\d+)?)\s*(?:倍|x)/i,
      /PB\s*[≈=:]\s*(\d+(?:\.\d+)?)\s*(?:倍|x)/i,
      /\|\s*PB\s*\|\s*\*?\*?\s*[~]?(\d+(?:\.\d+)?)\s*(?:倍|x)/i,
      /PB\s*(?:约|为)\s*[~]?(\d+(?:\.\d+)?)\s*(?:倍|x)/i,
      /PB\s*=\s*\d+\s*\/\s*\d+\s*=?\s*[~]?(\d+(?:\.\d+)?)/i,
    ),

    // ROE: look for "ROE" followed by percentage
    roe: extractMetric(markdown,
      /\|\s*ROE[（(][^）)]*[）)]\s*\|\s*\*?\*?\s*(?:年化约)?\s*(\d+(?:\.\d+)?)\s*%/i,
      /ROE\s*[(（](?:年化|加权|2026Q\d|平均)[）)].*?[~]?(\d+(?:\.\d+)?)\s*%/i,
      /ROE\s*(?:年化|加权).*?[~]?(\d+(?:\.\d+)?)\s*%/i,
      /\|\s*ROE\s*\|\s*\*?\*?\s*[~]?(\d+(?:\.\d+)?)\s*%/i,
      /ROE\s*(?:为|：|:|=)\s*\*?\*?\s*(\d+(?:\.\d+)?)\s*%?/i,
    ),

    // 毛利率 - do not substitute net margin or net interest margin
    grossMargin: extractMetric(markdown,
      /\|\s*\*?\*?毛利率\*?\*?\s*\|\s*\*?\*?\s*(\d+(?:\.\d+)?)\s*[%％]/,
      /毛利率\s*[(（][^）)]*[）)]?\s*[|｜]\s*\*?\*?\s*(\d+(?:\.\d+)?)\s*%?/,
      /毛利率\s*(?:为|：|:|=|约|约为)?\s*\*?\*?\s*(\d+(?:\.\d+)?)\s*[%％]/,
    ),

    // 股息率 - must match "股息率" followed by number, NOT "分红比例" or "分红率"
    dividendYield: extractMetric(markdown,
      /股息率\s*[|｜]\s*\*?\*?\s*[~]?(\d+(?:\.\d+)?)\s*%/,
      /股息率\s*(?:约|约为|=|：|为)\s*[~]?(\d+(?:\.\d+)?)\s*%/,
      /股息率\s*[~>]\s*(\d+(?:\.\d+)?)\s*%/,
      /\*?\*?股息率\*?\*?\s*\|\s*[^|]*\|\s*\*?\*?\s*[~]?(\d+(?:\.\d+)?)\s*%/,
    ),

    // 市值
    marketCap: extractMetric(markdown,
      /总市值\s*[|｜]\s*\*?\*?\s*(?:约)?\s*¥?\s*([\d,]+)\s*亿/,
      /\*?\*?总市值\*?\*?\s*\|\s*[^|]*\|\s*\*?\*?\s*¥?\s*([\d,]+)\s*亿/,
      /总市值\s*(?:约|为|：)\s*¥?\s*([\d,]+)\s*亿/,
    ),

    // 营收
    revenue: extractMetric(markdown,
      /\d{4}Q\d\s*营收.*?¥?\s*([\d,.]+)\s*亿/,
      /\|\s*营收\s*\|\s*\*?\*?\s*¥?\s*([\d,.]+)\s*亿/,
      /营业(?:总)?收入\s*[|｜]\s*\*?\*?\s*¥?\s*([\d,]+)\s*亿/,
      /营收\s*(?:约|约为|=|：|为)\s*¥?\s*([\d,]+)\s*亿/,
    ),

    // 净利润 - handle "37.85B" (billions), "378.5亿", "378.52 亿"
    netIncome: (() => {
      // Try billion format first (37.85B = 378.5亿)
      const billionMatch = markdown.match(/(?:归[母属])?净利.*?(\d+(?:\.\d+)?)\s*B/i);
      if (billionMatch) return parseFloat(billionMatch[1]) * 10;
      // Try various 亿 formats
      return extractMetric(markdown,
        /\d{4}\s*Q?\d?\s*归母净利\s*\|\s*[^|]*\|\s*(\d+(?:\.\d+)?)\s*亿/,
        /归母净利润\s*[(（]\d{4}Q\d[）)]\s*\|\s*[^|]*\|\s*\*?\*?\s*¥?\s*([\d.]+)\s*亿/,
        /\d{4}\s*Q?\d?\s*(?:归母)?净利.*?(\d+(?:\.\d+)?)\s*亿/,
        /\|\s*\d{4}\s*归母净利\s*\|\s*[^|]*\|\s*¥?\s*([\d.]+)\s*亿/,
        /(?:归[母属])?净利润\s*[|｜]\s*\*?\*?\s*¥?\s*([\d,]+)\s*亿/,
        /净利润.*?¥?\s*([\d,]+)\s*亿/,
      );
    })(),
  };

  // Extract veto items
  const vetoItems: ParsedReport['vetoItems'] = [];
  const vetoSectionRegex = new RegExp('(?:否决项|一票否决|Veto|估值陷阱)[\\s\\S]*?(?=\\n#{1,3}|\\n---\\n\\n|$)');
  const vetoSectionMatch = markdown.match(vetoSectionRegex);

  if (vetoSectionMatch) {
    const vetoSection = vetoSectionMatch[0];
    const lines = vetoSection.split('\n');
    for (const line of lines) {
      const itemMatch = line.match(/[-•*]\s*(.+?)\s*[|｜]\s*(✅|❌|是|否|触发|通过|🟠)\s*(.*)/);
      if (itemMatch) {
        vetoItems.push({
          item: itemMatch[1].trim(),
          triggered: itemMatch[2].includes('❌') || itemMatch[2].includes('是') || itemMatch[2].includes('触发'),
          reason: itemMatch[3]?.trim() || ''
        });
      }
    }
  }

  const sections = extractSections(markdown);

  return {
    symbol,
    name: extractedName,
    market,
    score,
    conclusion,
    dimensions,
    metrics,
    vetoItems,
    sections
  };
}
