'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import StockSearch from '@/components/StockSearch';
import AnalysisTimeline, { TimelineStep } from '@/components/AnalysisTimeline';
import ScoreDashboard from '@/components/ScoreDashboard';
import DimensionBreakdown from '@/components/DimensionBreakdown';
import KeyMetrics from '@/components/KeyMetrics';
import ReportView from '@/components/ReportView';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Save } from 'lucide-react';
import { SSEParser } from '@/lib/sse-parser';

interface Stock {
  symbol: string;
  name: string;
  market: string;
}

interface AnalysisResult {
  id: string;
  markdown: string;
  parsed: {
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
    sections: Array<{
      title: string;
      content: string;
    }>;
  };
}

interface StepEventPayload {
  key: string;
  title: string;
  detail?: string;
  status: 'pending' | 'running' | 'done' | 'error';
  meta?: Record<string, unknown>;
}

/** 从流式 markdown 中提取已写过的标题（# / ## / ### 行） */
function extractHeadings(markdown: string): string[] {
  const headings: string[] = [];
  const lines = markdown.split('\n');
  for (const line of lines) {
    const m = line.match(/^#{1,3}\s+(.+?)\s*$/);
    if (m) {
      const title = m[1].trim().replace(/[#*`]/g, '');
      if (title.length >= 2) headings.push(title);
    }
  }
  return headings;
}

export default function AnalyzeContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [selectedStock, setSelectedStock] = useState<Stock | null>(null);
  const [status, setStatus] = useState<'idle' | 'fetching' | 'analyzing' | 'complete' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [partialMarkdown, setPartialMarkdown] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [result, setResult] = useState<AnalysisResult | null>(null);
  // 时间线步骤：按 SSE 'step' 事件 upsert
  const [steps, setSteps] = useState<TimelineStep[]>([]);

  // Throttle refs
  const lastUpdateTime = useRef(0);
  const updateTimerRef = useRef<NodeJS.Timeout | null>(null);
  const pendingMarkdown = useRef('');
  const analysisStarted = useRef(false);
  // force=1 → 跳过 7 天报告缓存，强制重新跑 DeepSeek
  const forceRef = useRef(false);

  /** Upsert：相同 key 覆盖（保留旧的 meta + writtenSections），不存在则追加 */
  const upsertStep = useCallback((payload: StepEventPayload) => {
    setSteps(prev => {
      const idx = prev.findIndex(s => s.key === payload.key);
      const next: TimelineStep = {
        key: payload.key,
        title: payload.title,
        detail: payload.detail,
        status: payload.status,
        meta: payload.meta,
      };
      if (idx >= 0) {
        // 合并 meta（done 时保留 running 阶段写入的 meta，覆盖式更新）
        const merged: TimelineStep = {
          ...prev[idx],
          ...next,
          meta: { ...(prev[idx].meta || {}), ...(payload.meta || {}) },
        };
        const copy = [...prev];
        copy[idx] = merged;
        return copy;
      }
      return [...prev, next];
    });
  }, []);

  /** 更新 analyze 步骤的"正在写的章节"和"已完成章节" */
  const updateAnalyzeHeadings = useCallback((markdown: string) => {
    const headings = extractHeadings(markdown);
    if (headings.length === 0) return;
    // 最后一个标题视为"正在写"，前面的视为"已完成"
    const current = headings[headings.length - 1];
    const written = headings.slice(0, -1);
    setSteps(prev => {
      const idx = prev.findIndex(s => s.key === 'analyze');
      if (idx < 0) return prev;
      // 只有 running 时才更新「正在写」；done 之后保留全部章节
      const isRunning = prev[idx].status === 'running';
      const copy = [...prev];
      copy[idx] = {
        ...prev[idx],
        currentSection: isRunning ? current : undefined,
        writtenSections: isRunning ? written : headings,
      };
      return copy;
    });
  }, []);

  // Auto-start if symbol is in URL (only once)
  useEffect(() => {
    const symbol = searchParams.get('symbol');
    const market = searchParams.get('market') || 'A';
    const name = searchParams.get('name');
    const force = searchParams.get('force') === '1';

    if (symbol && !analysisStarted.current) {
      analysisStarted.current = true;
      forceRef.current = force;
      setSelectedStock({ symbol, name: name || symbol, market });
      startAnalysis(symbol, market, force);
    }
  }, []);

  // Throttled markdown update
  const throttledSetMarkdown = useCallback((markdown: string) => {
    const now = Date.now();
    const THROTTLE_MS = 300; // Update UI at most every 300ms

    pendingMarkdown.current = markdown;

    if (now - lastUpdateTime.current >= THROTTLE_MS) {
      // Update immediately
      lastUpdateTime.current = now;
      setPartialMarkdown(markdown);
      updateAnalyzeHeadings(markdown);
    } else if (!updateTimerRef.current) {
      // Schedule update
      const delay = THROTTLE_MS - (now - lastUpdateTime.current);
      updateTimerRef.current = setTimeout(() => {
        lastUpdateTime.current = Date.now();
        setPartialMarkdown(pendingMarkdown.current);
        updateAnalyzeHeadings(pendingMarkdown.current);
        updateTimerRef.current = null;
      }, delay);
    }
  }, [updateAnalyzeHeadings]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (updateTimerRef.current) {
        clearTimeout(updateTimerRef.current);
      }
    };
  }, []);

  const startAnalysis = useCallback(async (symbol: string, market: string, force: boolean = false) => {
    setStatus('fetching');
    setProgress(5);
    setError(undefined);
    setResult(null);
    setPartialMarkdown('');
    setSteps([]);
    lastUpdateTime.current = 0;
    pendingMarkdown.current = '';

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, market, force })
      });

      if (!response.ok) {
        throw new Error('分析请求失败');
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('无法读取响应流');

      const decoder = new TextDecoder();
      const sseParser = new SSEParser();
      let chunkCount = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const events = sseParser.parse(chunk);

        for (const { event, data } of events) {
          switch (event) {
            case 'cached': {
              // 命中 7 天报告缓存：直接跳到已有报告页，不再走 DeepSeek
              const { reportId } = data as { reportId: string; ageDays: number };
              setStatus('complete');
              setProgress(100);
              router.replace(`/reports/${reportId}`);
              return;
            }
            // 新的统一步骤事件：直接 upsert 到时间线
            case 'step': {
              const payload = data as StepEventPayload;
              upsertStep(payload);
              // 进度条按 key + status 推进
              if (payload.key === 'fetch' && payload.status === 'running') setProgress(p => Math.max(p, 15));
              if (payload.key === 'fetch' && payload.status === 'done')    setProgress(p => Math.max(p, 25));
              if (payload.key === 'analyze' && payload.status === 'running') {
                setStatus('analyzing');
                setProgress(p => Math.max(p, 30));
              }
              if (payload.key === 'analyze' && payload.status === 'done')  setProgress(p => Math.max(p, 88));
              if (payload.key === 'parse' && payload.status === 'done')    setProgress(p => Math.max(p, 93));
              if (payload.key === 'save'  && payload.status === 'done')    setProgress(p => Math.max(p, 97));
              break;
            }
            // 旧事件继续保留：用于流式追加 markdown
            case 'fetching_data':
              setStatus('fetching');
              break;
            case 'data_fetched':
              setStatus('analyzing');
              break;
            case 'analyzing':
              setStatus('analyzing');
              chunkCount++;
              if (chunkCount % 10 === 0) {
                setProgress(prev => Math.min(85, prev + 1));
              }
              if ((data as Record<string, unknown>).partial) {
                throttledSetMarkdown((data as Record<string, string>).partial);
              } else if ((data as Record<string, unknown>).chunk) {
                throttledSetMarkdown(pendingMarkdown.current + (data as Record<string, string>).chunk);
              }
              break;
            case 'analysis_complete':
              if (pendingMarkdown.current) {
                setPartialMarkdown(pendingMarkdown.current);
                updateAnalyzeHeadings(pendingMarkdown.current);
              }
              break;
            case 'complete':
              setStatus('complete');
              setProgress(100);
              setResult(data as AnalysisResult);
              break;
            case 'error':
              setStatus('error');
              setError((data as Record<string, string>).message);
              break;
          }
        }
      }
    } catch (err) {
      setStatus('error');
      const raw = (err as Error).message || '未知错误';
      // 浏览器 fetch 的网络层错误通常是 "Failed to fetch" / "Load failed" / "NetworkError"
      // 翻译成中文，方便用户判断是 dev server 没跑、端口对不上、还是流被中断
      const isNetworkError = /failed to fetch|load failed|networkerror|err_/i.test(raw);
      setError(isNetworkError
        ? `无法连接到分析服务（${raw}）。请确认开发服务器正在运行、当前浏览器地址端口与服务器一致，然后重试。`
        : raw);
    }
  }, [throttledSetMarkdown, updateAnalyzeHeadings, upsertStep, router]);

  const handleStockSelect = (stock: Stock) => {
    setSelectedStock(stock);
    // 切换到新股票时重置 force：用户主动选股的语义是「分析这只」，应允许缓存命中
    forceRef.current = false;
    router.push(`/analyze?symbol=${stock.symbol}&market=${stock.market}&name=${encodeURIComponent(stock.name)}`);
    startAnalysis(stock.symbol, stock.market, false).catch(err => {
      console.error('Analysis failed:', err);
      setStatus('error');
      setError((err as Error).message);
    });
  };

  const handleRetry = () => {
    if (selectedStock) {
      // 沿用本次会话的 force 值（用户从报告页带 force=1 进来时，重试也应继续强制）
      startAnalysis(selectedStock.symbol, selectedStock.market, forceRef.current).catch(err => {
        console.error('Analysis failed:', err);
        setStatus('error');
        setError((err as Error).message);
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="outline" onClick={() => router.push('/')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          返回
        </Button>
        <h1 className="text-2xl font-bold">股票分析</h1>
      </div>

      {/* Stock Selection */}
      <Card>
        <CardHeader>
          <CardTitle>选择股票</CardTitle>
        </CardHeader>
        <CardContent>
          <StockSearch onSelect={handleStockSelect} />
        </CardContent>
      </Card>

      {/* Analysis Timeline */}
      {status !== 'idle' && status !== 'complete' && (
        <AnalysisTimeline
          status={status}
          progress={progress}
          steps={steps}
          partialMarkdown={partialMarkdown}
          error={error}
        />
      )}

      {/* Error State */}
      {status === 'error' && (
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-red-500 mb-4">{error}</p>
            <Button onClick={handleRetry}>重试</Button>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {result && status === 'complete' && (
        <div className="space-y-6">
          <ScoreDashboard
            score={result.parsed.score}
            symbol={selectedStock?.symbol || ''}
            name={selectedStock?.name || ''}
            market={selectedStock?.market || 'A'}
            conclusion={result.parsed.conclusion}
          />

          <div className="grid lg:grid-cols-2 gap-6">
            <DimensionBreakdown dimensions={result.parsed.dimensions} />
            <KeyMetrics metrics={result.parsed.metrics} />
          </div>

          {/* 完成后也保留一份「分析过程」时间线，让用户回看 AI 走过的步骤 */}
          {steps.length > 0 && (
            <details className="bg-white rounded-lg border p-4">
              <summary className="cursor-pointer text-sm font-medium text-gray-700 hover:text-gray-900">
                查看本次分析过程（{steps.length} 步）
              </summary>
              <div className="mt-3">
                <AnalysisTimeline
                  status="complete"
                  progress={100}
                  steps={steps}
                  partialMarkdown=""
                  error={undefined}
                />
              </div>
            </details>
          )}

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>分析报告摘要</CardTitle>
                <Button
                  variant="outline"
                  onClick={() => router.push(`/reports/${result.id}`)}
                >
                  <Save className="h-4 w-4 mr-2" />
                  查看完整报告
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <ReportView
                markdown={result.markdown}
                sections={result.parsed.sections.slice(0, 5)}
              />
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
