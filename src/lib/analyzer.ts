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

export async function analyzeStock(
  symbol: string,
  market: 'A' | 'HK' | 'US',
  onProgress?: ProgressCallback
): Promise<AnalysisResult> {
  // Step 1: Fetch data via Python
  onProgress?.('fetching_data', { symbol, market });

  let rawData: StockData;
  try {
    rawData = await fetchData(symbol, market);
  } catch (err) {
    onProgress?.('data_error', { error: (err as Error).message });
    throw err;
  }

  onProgress?.('data_fetched', rawData);

  // Step 2: Stream Claude analysis
  onProgress?.('analyzing', { status: 'starting' });

  const stream = await claudeAnalyze(symbol, market, rawData);
  let fullMarkdown = '';

  for await (const chunk of stream) {
    fullMarkdown += chunk;
    onProgress?.('analyzing', { chunk });
  }

  onProgress?.('analysis_complete', { markdown: fullMarkdown });

  // Step 3: Parse the report
  const parsed = parseReport(fullMarkdown, symbol, rawData.name, market);
  onProgress?.('parsed', parsed);

  // Step 4: Save to storage
  const reportId = await saveReport(symbol, market, fullMarkdown, parsed as unknown as Record<string, unknown>);
  onProgress?.('saved', { id: reportId });

  return {
    id: reportId,
    markdown: fullMarkdown,
    parsed
  };
}
