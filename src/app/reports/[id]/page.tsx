'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import ScoreDashboard from '@/components/ScoreDashboard';
import DimensionBreakdown from '@/components/DimensionBreakdown';
import KeyMetrics from '@/components/KeyMetrics';
import ReportView from '@/components/ReportView';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Download, RefreshCw, Trash2, ChevronDown, ChevronUp, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

interface Report {
  id: string;
  symbol: string;
  name: string;
  market: string;
  score: number;
  conclusion: string;
  createdAt: string;
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
    vetoItems: Array<{
      item: string;
      triggered: boolean;
      reason: string;
    }>;
  };
}

export default function ReportDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<number>>(new Set());

  useEffect(() => {
    fetchReport();
  }, [params.id]);

  // 报告加载后根据实际显示的章节数量初始化展开状态
  useEffect(() => {
    if (report) {
      const displaySections = getDisplaySections(report.parsed.sections);
      // 默认展开前 3 个章节（不超过实际章节数）
      setExpandedSections(new Set(displaySections.slice(0, 3).map((_, i) => i)));
    }
  }, [report]);

  const fetchReport = async () => {
    try {
      const response = await fetch(`/api/reports/${params.id}`);
      if (!response.ok) {
        throw new Error('报告不存在');
      }
      const data = await response.json();
      setReport(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('确定要删除这份报告吗？')) return;
    try {
      await fetch(`/api/reports/${params.id}`, { method: 'DELETE' });
      router.push('/reports');
    } catch {
      console.error('Failed to delete report');
    }
  };

  const handleReanalyze = () => {
    if (!report) return;
    const ageDays = Math.floor(
      (Date.now() - new Date(report.createdAt).getTime()) / 86400000
    );
    const ageLabel = ageDays < 1 ? '今天' : `${ageDays} 天前`;
    if (!confirm(`这份报告生成于${ageLabel}，确定要重新分析并生成新报告吗？将消耗 DeepSeek token。`)) {
      return;
    }
    // force=1 跳过 7 天缓存，重新跑 DeepSeek
    router.push(`/analyze?symbol=${report.symbol}&market=${report.market}&force=1`);
  };

  const handleExport = () => {
    if (!report) return;
    const blob = new Blob([report.markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${report.name}_${report.symbol}_分析报告.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggleSection = (index: number) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Filter out boilerplate sections and focus on analysis content
  const getDisplaySections = (sections: Array<{ title: string; content: string }>) => {
    const skipTitles = ['Step 0.5', 'Step 1-7', '分析概要'];
    return sections.filter(s => {
      // 跳过匹配的 boilerplate 章节
      return !skipTitles.some(t => s.title.includes(t));
    });
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto"></div>
        <p className="mt-4 text-gray-500">加载中...</p>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="text-center py-12">
        <p className="text-red-500 mb-4">{error || '报告不存在'}</p>
        <Button onClick={() => router.push('/reports')}>
          返回报告列表
        </Button>
      </div>
    );
  }

  const displaySections = getDisplaySections(report.parsed.sections);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="outline" onClick={() => router.push('/reports')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            返回
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{report.name} 价值分析报告</h1>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-gray-500">{report.symbol}</span>
              <Badge variant="outline">{report.market === 'A' ? 'A股' : report.market === 'HK' ? '港股' : '美股'}</Badge>
              <span className="text-sm text-gray-400">
                {formatDate(report.createdAt)}
              </span>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="h-4 w-4 mr-1" />
            导出
          </Button>
          <Button variant="outline" size="sm" onClick={handleReanalyze}>
            <RefreshCw className="h-4 w-4 mr-1" />
            重新分析
          </Button>
          <Button variant="outline" size="sm" onClick={handleDelete} className="text-red-500 hover:text-red-700">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Score Dashboard */}
      <ScoreDashboard
        score={report.parsed.score}
        symbol={report.symbol}
        name={report.name}
        market={report.market}
        conclusion={report.parsed.conclusion}
      />

      {/* Dimension Breakdown + Key Metrics */}
      <div className="grid lg:grid-cols-2 gap-6">
        <DimensionBreakdown dimensions={report.parsed.dimensions} />
        <KeyMetrics metrics={report.parsed.metrics} />
      </div>

      {/* Veto Items */}
      {report.parsed.vetoItems && report.parsed.vetoItems.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
              风险提示 / 否决项检查
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3">
              {report.parsed.vetoItems.map((item, index) => (
                <div
                  key={index}
                  className={`flex items-start gap-3 p-3 rounded-lg border ${
                    item.triggered ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'
                  }`}
                >
                  {item.triggered ? (
                    <XCircle className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
                  ) : (
                    <CheckCircle className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                  )}
                  <div>
                    <div className="font-medium">{item.item}</div>
                    {item.reason && (
                      <div className="text-sm text-gray-600 mt-1">{item.reason}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Detailed Analysis Sections */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">详细分析</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {displaySections.map((section, index) => (
              <div key={index} className="border rounded-lg overflow-hidden">
                <button
                  onClick={() => toggleSection(index)}
                  className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
                >
                  <h3 className="font-semibold text-left">{section.title}</h3>
                  {expandedSections.has(index) ? (
                    <ChevronUp className="h-5 w-5 text-gray-400 flex-shrink-0" />
                  ) : (
                    <ChevronDown className="h-5 w-5 text-gray-400 flex-shrink-0" />
                  )}
                </button>
                {expandedSections.has(index) && (
                  <div className="px-4 pb-4 border-t">
                    <div className="prose prose-sm max-w-none pt-4">
                      <ReactMarkdown>{section.content}</ReactMarkdown>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
