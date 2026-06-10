'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Trash2, ExternalLink } from 'lucide-react';
import Link from 'next/link';

interface Report {
  id: string;
  symbol: string;
  name: string;
  market: string;
  score: number;
  conclusion: string;
  createdAt: string;
}

interface ReportListProps {
  reports: Report[];
  onDelete?: (id: string) => void;
}

export default function ReportList({ reports, onDelete }: ReportListProps) {
  const getScoreColor = (score: number) => {
    if (score >= 80) return 'bg-green-100 text-green-800';
    if (score >= 60) return 'bg-yellow-100 text-yellow-800';
    return 'bg-red-100 text-red-800';
  };

  const getMarketLabel = (market: string) => {
    const labels: Record<string, string> = {
      'A': 'A股',
      'HK': '港股',
      'US': '美股'
    };
    return labels[market] || market;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (reports.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <p className="text-gray-500">暂无分析报告</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {reports.map((report) => (
        <Card key={report.id} className="hover:shadow-md transition-shadow">
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between">
              <div>
                <CardTitle className="text-lg">{report.name}</CardTitle>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-sm text-gray-500">{report.symbol}</span>
                  <Badge variant="outline" className="text-xs">
                    {getMarketLabel(report.market)}
                  </Badge>
                </div>
              </div>
              <Badge className={getScoreColor(report.score)}>
                {report.score}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600 line-clamp-3 mb-4">
              {report.conclusion}
            </p>
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-400">
                {formatDate(report.createdAt)}
              </span>
              <div className="flex gap-2">
                <Link href={`/reports/${report.id}`}>
                  <Button variant="outline" size="sm">
                    <ExternalLink className="h-4 w-4 mr-1" />
                    查看
                  </Button>
                </Link>
                {onDelete && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onDelete(report.id)}
                    className="text-red-500 hover:text-red-700"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
