'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown, Minus, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';

interface ScoreDashboardProps {
  score: number;
  symbol: string;
  name: string;
  market: string;
  conclusion: string;
}

export default function ScoreDashboard({
  score,
  symbol,
  name,
  market,
  conclusion
}: ScoreDashboardProps) {
  const getScoreConfig = (score: number) => {
    if (score >= 80) return {
      color: 'text-green-600',
      bg: 'bg-green-50',
      border: 'border-green-200',
      label: '优秀',
      icon: <CheckCircle className="h-5 w-5 text-green-500" />,
      emoji: '🟢'
    };
    if (score >= 70) return {
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
      border: 'border-emerald-200',
      label: '良好',
      icon: <TrendingUp className="h-5 w-5 text-emerald-500" />,
      emoji: '🟢'
    };
    if (score >= 60) return {
      color: 'text-yellow-600',
      bg: 'bg-yellow-50',
      border: 'border-yellow-200',
      label: '可关注',
      icon: <Minus className="h-5 w-5 text-yellow-500" />,
      emoji: '🟡'
    };
    if (score >= 40) return {
      color: 'text-orange-600',
      bg: 'bg-orange-50',
      border: 'border-orange-200',
      label: '谨慎',
      icon: <AlertTriangle className="h-5 w-5 text-orange-500" />,
      emoji: '🟠'
    };
    return {
      color: 'text-red-600',
      bg: 'bg-red-50',
      border: 'border-red-200',
      label: '不推荐',
      icon: <XCircle className="h-5 w-5 text-red-500" />,
      emoji: '🔴'
    };
  };

  const getMarketLabel = (market: string) => {
    const labels: Record<string, string> = { 'A': 'A股', 'HK': '港股', 'US': '美股' };
    return labels[market] || market;
  };

  const config = getScoreConfig(score);

  // Extract the core conclusion part (after the emoji and label)
  const conclusionDetail = conclusion
    .replace(/^[🟢🟡🔴🟠]\s*(推荐|可关注|谨慎|不推荐)\s*[：:]?\s*/, '')
    .trim();

  return (
    <Card className={`${config.bg} ${config.border} border-2`}>
      <CardContent className="p-6">
        <div className="flex flex-col md:flex-row md:items-start gap-6">
          {/* Score Circle */}
          <div className="flex flex-col items-center">
            <div className={`relative w-32 h-32 rounded-full flex items-center justify-center ${config.bg} border-4 ${config.border}`}>
              <div className="text-center">
                <div className={`text-4xl font-bold ${config.color}`}>{score}</div>
                <div className="text-xs text-gray-500">/ 100</div>
              </div>
            </div>
            <Badge className={`mt-2 ${config.color} ${config.bg} ${config.border} border`}>
              {config.icon}
              <span className="ml-1">{config.label}</span>
            </Badge>
          </div>

          {/* Info */}
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-3">
              <h2 className="text-2xl font-bold">{name}</h2>
              <span className="text-gray-500">{symbol}</span>
              <Badge variant="outline">{getMarketLabel(market)}</Badge>
            </div>

            {/* Conclusion */}
            <div className="bg-white rounded-lg p-4 border">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">{config.emoji}</span>
                <span className="font-semibold text-lg">投资结论</span>
              </div>
              <p className="text-gray-700 leading-relaxed">
                {conclusionDetail || conclusion}
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
