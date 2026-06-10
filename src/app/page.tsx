'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import StockSearch from '@/components/StockSearch';
import ReportList from '@/components/ReportList';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { BarChart3, TrendingUp, Shield, Zap } from 'lucide-react';

interface Stock {
  symbol: string;
  name: string;
  market: string;
}

interface Report {
  id: string;
  symbol: string;
  name: string;
  market: string;
  score: number;
  conclusion: string;
  createdAt: string;
}

export default function Home() {
  const router = useRouter();
  const [recentReports, setRecentReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchReports();
  }, []);

  const fetchReports = async () => {
    try {
      const response = await fetch('/api/reports');
      const data = await response.json();
      setRecentReports(data.slice(0, 6));
    } catch {
      console.error('Failed to fetch reports');
    } finally {
      setLoading(false);
    }
  };

  const handleStockSelect = (stock: Stock) => {
    router.push(`/analyze?symbol=${stock.symbol}&market=${stock.market}`);
  };

  const handleDeleteReport = async (id: string) => {
    if (!confirm('确定要删除这份报告吗？')) return;

    try {
      await fetch(`/api/reports/${id}`, { method: 'DELETE' });
      setRecentReports(prev => prev.filter(r => r.id !== id));
    } catch {
      console.error('Failed to delete report');
    }
  };

  return (
    <div className="space-y-8">
      {/* Hero Section */}
      <section className="text-center py-12">
        <h1 className="text-4xl font-bold mb-4">AI 驱动的股票价值分析</h1>
        <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
          基于深度学习和价值投资理念，为您提供全面、专业的股票分析报告
        </p>

        <div className="max-w-xl mx-auto">
          <StockSearch onSelect={handleStockSelect} />
        </div>
      </section>

      {/* Features */}
      <section className="grid md:grid-cols-4 gap-6">
        <Card>
          <CardContent className="p-6 text-center">
            <BarChart3 className="h-12 w-12 text-blue-600 mx-auto mb-4" />
            <h3 className="font-semibold mb-2">五维分析</h3>
            <p className="text-sm text-gray-600">
              从行业、公司、估值、逆向、定价权五个维度全面评估
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6 text-center">
            <TrendingUp className="h-12 w-12 text-green-600 mx-auto mb-4" />
            <h3 className="font-semibold mb-2">数据驱动</h3>
            <p className="text-sm text-gray-600">
              实时获取最新财务数据，确保分析的时效性
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6 text-center">
            <Shield className="h-12 w-12 text-purple-600 mx-auto mb-4" />
            <h3 className="font-semibold mb-2">风险识别</h3>
            <p className="text-sm text-gray-600">
              一票否决机制，快速识别潜在风险点
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6 text-center">
            <Zap className="h-12 w-12 text-yellow-600 mx-auto mb-4" />
            <h3 className="font-semibold mb-2">AI 分析</h3>
            <p className="text-sm text-gray-600">
              Claude AI 深度分析，提供专业投资建议
            </p>
          </CardContent>
        </Card>
      </section>

      {/* Recent Reports */}
      <section>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold">最近分析报告</h2>
          <Button variant="outline" onClick={() => router.push('/reports')}>
            查看全部
          </Button>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto"></div>
            <p className="mt-4 text-gray-500">加载中...</p>
          </div>
        ) : recentReports.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <p className="text-gray-500 mb-4">暂无分析报告</p>
              <Button onClick={() => router.push('/analyze')}>
                开始分析第一只股票
              </Button>
            </CardContent>
          </Card>
        ) : (
          <ReportList reports={recentReports} onDelete={handleDeleteReport} />
        )}
      </section>
    </div>
  );
}
