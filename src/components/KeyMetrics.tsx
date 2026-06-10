'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown, DollarSign, Percent, BarChart3, Building2, Wallet, PiggyBank } from 'lucide-react';

interface KeyMetricsProps {
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
}

interface MetricItem {
  label: string;
  shortLabel: string;
  value: number | null;
  unit: string;
  icon: React.ReactNode;
  benchmark?: { good: number; bad: number };
  format?: 'number' | 'percent' | 'billion' | 'multiple';
}

export default function KeyMetrics({ metrics }: KeyMetricsProps) {
  const formatValue = (value: number | null, unit: string, format?: string): string => {
    if (value === null) return 'N/A';

    switch (format) {
      case 'percent':
        return `${value.toFixed(2)}%`;
      case 'billion':
        return `${value.toFixed(0)}亿`;
      case 'multiple':
        return `${value.toFixed(2)}x`;
      default:
        return value.toFixed(2) + unit;
    }
  };

  const getMetricStatus = (value: number | null, benchmark?: { good: number; bad: number }) => {
    if (!benchmark || value === null) return null;
    if (value >= benchmark.good) return { label: '优秀', color: 'bg-green-100 text-green-700', icon: <TrendingUp className="h-3 w-3" /> };
    if (value <= benchmark.bad) return { label: '注意', color: 'bg-red-100 text-red-700', icon: <TrendingDown className="h-3 w-3" /> };
    return { label: '一般', color: 'bg-yellow-100 text-yellow-700', icon: null };
  };

  const metricsList: MetricItem[] = [
    {
      label: '市盈率 (PE)',
      shortLabel: 'PE',
      value: metrics.pe,
      unit: '',
      icon: <BarChart3 className="h-5 w-5 text-blue-500" />,
      format: 'multiple',
      benchmark: { good: 0, bad: 30 } // PE lower is generally better, but 0 means N/A
    },
    {
      label: '市净率 (PB)',
      shortLabel: 'PB',
      value: metrics.pb,
      unit: '',
      icon: <BarChart3 className="h-5 w-5 text-purple-500" />,
      format: 'multiple',
      benchmark: { good: 0, bad: 5 }
    },
    {
      label: '净资产收益率 (ROE)',
      shortLabel: 'ROE',
      value: metrics.roe,
      unit: '',
      icon: <Percent className="h-5 w-5 text-green-500" />,
      format: 'percent',
      benchmark: { good: 15, bad: 5 }
    },
    {
      label: '毛利率',
      shortLabel: '毛利率',
      value: metrics.grossMargin,
      unit: '',
      icon: <Percent className="h-5 w-5 text-emerald-500" />,
      format: 'percent',
      benchmark: { good: 40, bad: 20 }
    },
    {
      label: '股息率',
      shortLabel: '股息率',
      value: metrics.dividendYield,
      unit: '',
      icon: <DollarSign className="h-5 w-5 text-yellow-500" />,
      format: 'percent',
      benchmark: { good: 3, bad: 1 }
    },
    {
      label: '总市值',
      shortLabel: '市值',
      value: metrics.marketCap,
      unit: '',
      icon: <Building2 className="h-5 w-5 text-indigo-500" />,
      format: 'billion'
    },
    {
      label: '营业总收入',
      shortLabel: '营收',
      value: metrics.revenue,
      unit: '',
      icon: <Wallet className="h-5 w-5 text-cyan-500" />,
      format: 'billion'
    },
    {
      label: '净利润',
      shortLabel: '净利润',
      value: metrics.netIncome,
      unit: '',
      icon: <PiggyBank className="h-5 w-5 text-pink-500" />,
      format: 'billion'
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">关键指标</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {metricsList.map((item) => {
            const status = getMetricStatus(item.value, item.benchmark);
            const isNA = item.value === null;

            return (
              <div
                key={item.shortLabel}
                className={`rounded-lg border p-4 transition-all hover:shadow-md ${
                  isNA ? 'bg-gray-50 opacity-60' : 'bg-white'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-gray-500">{item.icon}</span>
                  {status && (
                    <Badge className={`text-xs ${status.color}`}>
                      {status.icon}
                      <span className="ml-0.5">{status.label}</span>
                    </Badge>
                  )}
                </div>
                <div className="text-2xl font-bold mb-1">
                  {formatValue(item.value, item.unit, item.format)}
                </div>
                <div className="text-xs text-gray-500">{item.shortLabel}</div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
