'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import StockSearch from '@/components/StockSearch';
import AnalysisProgress from '@/components/AnalysisProgress';
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

export default function AnalyzeContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [selectedStock, setSelectedStock] = useState<Stock | null>(null);
  const [status, setStatus] = useState<'idle' | 'fetching' | 'analyzing' | 'complete' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState('');
  const [partialMarkdown, setPartialMarkdown] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [result, setResult] = useState<AnalysisResult | null>(null);

  // Throttle refs
  const lastUpdateTime = useRef(0);
  const updateTimerRef = useRef<NodeJS.Timeout | null>(null);
  const pendingMarkdown = useRef('');
  const analysisStarted = useRef(false);

  // Auto-start if symbol is in URL (only once)
  useEffect(() => {
    const symbol = searchParams.get('symbol');
    const market = searchParams.get('market') || 'A';

    if (symbol && !analysisStarted.current) {
      analysisStarted.current = true;
      setSelectedStock({ symbol, name: symbol, market });
      startAnalysis(symbol, market);
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
    } else if (!updateTimerRef.current) {
      // Schedule update
      const delay = THROTTLE_MS - (now - lastUpdateTime.current);
      updateTimerRef.current = setTimeout(() => {
        lastUpdateTime.current = Date.now();
        setPartialMarkdown(pendingMarkdown.current);
        updateTimerRef.current = null;
      }, delay);
    }
  }, []);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (updateTimerRef.current) {
        clearTimeout(updateTimerRef.current);
      }
    };
  }, []);

  const startAnalysis = useCallback(async (symbol: string, market: string) => {
    setStatus('fetching');
    setProgress(10);
    setCurrentStep('fetching_data');
    setError(undefined);
    setResult(null);
    setPartialMarkdown('');
    lastUpdateTime.current = 0;
    pendingMarkdown.current = '';

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, market })
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
            case 'fetching_data':
              setStatus('fetching');
              setProgress(20);
              setCurrentStep('fetching_data');
              break;
            case 'data_fetched':
              setStatus('analyzing');
              setProgress(30);
              setCurrentStep('data_fetched');
              break;
            case 'analyzing':
              setStatus('analyzing');
              setCurrentStep('analyzing');
              chunkCount++;
              if (chunkCount % 10 === 0) {
                setProgress(prev => Math.min(80, prev + 1));
              }
              if ((data as Record<string, unknown>).partial) {
                throttledSetMarkdown((data as Record<string, string>).partial);
              } else if ((data as Record<string, unknown>).chunk) {
                throttledSetMarkdown(pendingMarkdown.current + (data as Record<string, string>).chunk);
              }
              break;
            case 'analysis_complete':
              setProgress(85);
              setCurrentStep('analysis_complete');
              if (pendingMarkdown.current) {
                setPartialMarkdown(pendingMarkdown.current);
              }
              break;
            case 'parsed':
              setProgress(90);
              setCurrentStep('parsed');
              break;
            case 'saved':
              setProgress(95);
              setCurrentStep('saved');
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
      setError((err as Error).message);
    }
  }, [throttledSetMarkdown]);

  const handleStockSelect = (stock: Stock) => {
    setSelectedStock(stock);
    router.push(`/analyze?symbol=${stock.symbol}&market=${stock.market}`);
    startAnalysis(stock.symbol, stock.market);
  };

  const handleRetry = () => {
    if (selectedStock) {
      startAnalysis(selectedStock.symbol, selectedStock.market);
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

      {/* Analysis Progress */}
      {status !== 'idle' && status !== 'complete' && (
        <AnalysisProgress
          status={status}
          progress={progress}
          currentStep={currentStep}
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
