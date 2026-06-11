'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import ReportList from '@/components/ReportList';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Search, Filter } from 'lucide-react';

interface Report {
  id: string;
  symbol: string;
  name: string;
  market: string;
  score: number;
  conclusion: string;
  createdAt: string;
}

export default function ReportsPage() {
  const router = useRouter();
  const [reports, setReports] = useState<Report[]>([]);
  const [filteredReports, setFilteredReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [marketFilter, setMarketFilter] = useState<string>('all');
  const [scoreFilter, setScoreFilter] = useState<string>('all');

  useEffect(() => {
    fetchReports();
  }, []);

  useEffect(() => {
    filterReports();
  }, [reports, searchQuery, marketFilter, scoreFilter]);

  const fetchReports = async () => {
    try {
      const response = await fetch('/api/reports');
      if (!response.ok) {
        throw new Error('获取报告列表失败');
      }
      const data = await response.json();
      if (!Array.isArray(data)) {
        throw new Error('返回数据格式错误');
      }
      setReports(data);
    } catch {
      console.error('Failed to fetch reports');
    } finally {
      setLoading(false);
    }
  };

  const filterReports = () => {
    let filtered = [...reports];

    // Search filter
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(r =>
        r.name.toLowerCase().includes(q) ||
        r.symbol.toLowerCase().includes(q)
      );
    }

    // Market filter
    if (marketFilter !== 'all') {
      filtered = filtered.filter(r => r.market === marketFilter);
    }

    // Score filter
    if (scoreFilter !== 'all') {
      switch (scoreFilter) {
        case 'excellent':
          filtered = filtered.filter(r => r.score >= 80);
          break;
        case 'good':
          filtered = filtered.filter(r => r.score >= 60 && r.score < 80);
          break;
        case 'poor':
          filtered = filtered.filter(r => r.score < 60);
          break;
      }
    }

    setFilteredReports(filtered);
  };

  const handleDeleteReport = async (id: string) => {
    if (!confirm('确定要删除这份报告吗？')) return;

    try {
      await fetch(`/api/reports/${id}`, { method: 'DELETE' });
      setReports(prev => prev.filter(r => r.id !== id));
    } catch {
      console.error('Failed to delete report');
    }
  };

  const getScoreStats = () => {
    const excellent = reports.filter(r => r.score >= 80).length;
    const good = reports.filter(r => r.score >= 60 && r.score < 80).length;
    const poor = reports.filter(r => r.score < 60).length;
    return { excellent, good, poor };
  };

  const stats = getScoreStats();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">分析报告</h1>
        <Button onClick={() => router.push('/analyze')}>
          新建分析
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold">{reports.length}</div>
            <div className="text-sm text-gray-500">总报告数</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-green-600">{stats.excellent}</div>
            <div className="text-sm text-gray-500">优秀 (≥80)</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-yellow-600">{stats.good}</div>
            <div className="text-sm text-gray-500">良好 (60-79)</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-red-600">{stats.poor}</div>
            <div className="text-sm text-gray-500">较差 (&lt;60)</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                  placeholder="搜索股票名称或代码..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <select
                value={marketFilter}
                onChange={(e) => setMarketFilter(e.target.value)}
                className="px-3 py-2 border rounded-md text-sm"
              >
                <option value="all">所有市场</option>
                <option value="A">A股</option>
                <option value="HK">港股</option>
                <option value="US">美股</option>
              </select>
              <select
                value={scoreFilter}
                onChange={(e) => setScoreFilter(e.target.value)}
                className="px-3 py-2 border rounded-md text-sm"
              >
                <option value="all">所有评分</option>
                <option value="excellent">优秀 (≥80)</option>
                <option value="good">良好 (60-79)</option>
                <option value="poor">较差 (&lt;60)</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Report List */}
      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto"></div>
          <p className="mt-4 text-gray-500">加载中...</p>
        </div>
      ) : filteredReports.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <p className="text-gray-500 mb-4">
              {reports.length === 0 ? '暂无分析报告' : '没有匹配的报告'}
            </p>
            {reports.length === 0 && (
              <Button onClick={() => router.push('/analyze')}>
                开始分析第一只股票
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <ReportList reports={filteredReports} onDelete={handleDeleteReport} />
      )}
    </div>
  );
}
