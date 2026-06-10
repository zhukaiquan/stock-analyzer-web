export interface StockInfo {
  symbol: string;
  name: string;
  market: 'A' | 'HK' | 'US';
  industry?: string;
}

// Common A-share stocks for demo purposes
const DEMO_STOCKS: StockInfo[] = [
  { symbol: '600519', name: '贵州茅台', market: 'A', industry: '白酒' },
  { symbol: '000858', name: '五粮液', market: 'A', industry: '白酒' },
  { symbol: '600036', name: '招商银行', market: 'A', industry: '银行' },
  { symbol: '601318', name: '中国平安', market: 'A', industry: '保险' },
  { symbol: '000333', name: '美的集团', market: 'A', industry: '家电' },
  { symbol: '600900', name: '长江电力', market: 'A', industry: '电力' },
  { symbol: '601012', name: '隆基绿能', market: 'A', industry: '光伏' },
  { symbol: '300750', name: '宁德时代', market: 'A', industry: '电池' },
  { symbol: '002594', name: '比亚迪', market: 'A', industry: '汽车' },
  { symbol: '600276', name: '恒瑞医药', market: 'A', industry: '医药' },
  { symbol: '000568', name: '泸州老窖', market: 'A', industry: '白酒' },
  { symbol: '002304', name: '洋河股份', market: 'A', industry: '白酒' },
  { symbol: '603259', name: '药明康德', market: 'A', industry: '医药' },
  { symbol: '600809', name: '山西汾酒', market: 'A', industry: '白酒' },
  { symbol: '000001', name: '平安银行', market: 'A', industry: '银行' },
  { symbol: '600030', name: '中信证券', market: 'A', industry: '证券' },
  { symbol: '601888', name: '中国中免', market: 'A', industry: '零售' },
  { symbol: '300059', name: '东方财富', market: 'A', industry: '互联网' },
  { symbol: '002714', name: '牧原股份', market: 'A', industry: '养殖' },
  { symbol: '600887', name: '伊利股份', market: 'A', industry: '乳业' },
  { symbol: '00700', name: '腾讯控股', market: 'HK', industry: '互联网' },
  { symbol: '09988', name: '阿里巴巴', market: 'HK', industry: '互联网' },
  { symbol: '03690', name: '美团', market: 'HK', industry: '互联网' },
  { symbol: '09999', name: '网易', market: 'HK', industry: '游戏' },
  { symbol: '01810', name: '小米集团', market: 'HK', industry: '科技' },
  { symbol: 'AAPL', name: 'Apple', market: 'US', industry: '科技' },
  { symbol: 'MSFT', name: 'Microsoft', market: 'US', industry: '科技' },
  { symbol: 'GOOGL', name: 'Alphabet', market: 'US', industry: '互联网' },
  { symbol: 'AMZN', name: 'Amazon', market: 'US', industry: '电商' },
  { symbol: 'TSLA', name: 'Tesla', market: 'US', industry: '汽车' },
];

export async function searchStocks(query: string): Promise<StockInfo[]> {
  const q = query.toLowerCase().trim();

  if (!q) {
    return DEMO_STOCKS.slice(0, 10);
  }

  // 先在内置股票库中搜索
  const matchedStocks = DEMO_STOCKS.filter(stock =>
    stock.symbol.toLowerCase().includes(q) ||
    stock.name.toLowerCase().includes(q) ||
    stock.name.includes(query) ||
    (stock.industry && stock.industry.includes(query))
  ).slice(0, 20);

  if (matchedStocks.length > 0) {
    return matchedStocks;
  }

  // 内置库无匹配时，尝试将输入识别为股票代码，允许用户分析任意股票
  const arbitraryStock = tryParseArbitraryCode(query.trim());
  if (arbitraryStock) {
    return [arbitraryStock];
  }

  return [];
}

/**
 * 尝试将用户输入解析为任意股票代码。
 * 如果输入匹配已知的代码模式，返回一个虚拟的 StockInfo。
 */
function tryParseArbitraryCode(input: string): StockInfo | null {
  const trimmed = input.trim();

  // A 股：6 位数字，以 0/3/6 开头
  if (/^[036]\d{5}$/.test(trimmed)) {
    return { symbol: trimmed, name: trimmed, market: 'A' };
  }

  // A 股：6 位数字（其他开头，如 688xxx 科创板）
  if (/^\d{6}$/.test(trimmed)) {
    return { symbol: trimmed, name: trimmed, market: 'A' };
  }

  // 港股：1-5 位数字
  if (/^\d{1,5}$/.test(trimmed)) {
    const padded = trimmed.padStart(5, '0');
    return { symbol: padded, name: padded, market: 'HK' };
  }

  // 美股：纯字母，2-5 位
  if (/^[A-Za-z]{2,5}$/.test(trimmed)) {
    const upper = trimmed.toUpperCase();
    return { symbol: upper, name: upper, market: 'US' };
  }

  return null;
}

export function detectMarket(symbol: string): 'A' | 'HK' | 'US' {
  const s = symbol.toUpperCase();

  // A-share: 6-digit numbers (0xx, 3xx, 6xx, 688xxx 科创板, etc.)
  if (/^\d{6}$/.test(s)) return 'A';

  // HK: 1-5 digit numbers
  if (/^\d{1,5}$/.test(s)) return 'HK';

  // US: Letters only
  if (/^[A-Z]+$/.test(s)) return 'US';

  // Default to A-share
  return 'A';
}
