'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Building2, Factory, BarChart3, Shield, DollarSign } from 'lucide-react';

interface DimensionBreakdownProps {
  dimensions: {
    industry: number;
    company: number;
    valuation: number;
    contrarian: number;
    pricingPower: number;
  };
}

interface DimensionItem {
  key: string;
  label: string;
  value: number;
  icon: React.ReactNode;
  description: string;
}

export default function DimensionBreakdown({ dimensions }: DimensionBreakdownProps) {
  const getScoreColor = (score: number) => {
    if (score >= 80) return { bar: 'bg-green-500', text: 'text-green-600', label: '优秀' };
    if (score >= 70) return { bar: 'bg-emerald-500', text: 'text-emerald-600', label: '良好' };
    if (score >= 60) return { bar: 'bg-yellow-500', text: 'text-yellow-600', label: '一般' };
    if (score >= 40) return { bar: 'bg-orange-500', text: 'text-orange-600', label: '偏弱' };
    return { bar: 'bg-red-500', text: 'text-red-600', label: '较差' };
  };

  const dimensionItems: DimensionItem[] = [
    {
      key: 'industry',
      label: '行业',
      value: dimensions.industry,
      icon: <Factory className="h-5 w-5" />,
      description: '行业格局、进入壁垒、需求稳定性'
    },
    {
      key: 'company',
      label: '公司',
      value: dimensions.company,
      icon: <Building2 className="h-5 w-5" />,
      description: '护城河、盈利能力、管理团队'
    },
    {
      key: 'valuation',
      label: '估值',
      value: dimensions.valuation,
      icon: <BarChart3 className="h-5 w-5" />,
      description: 'PE、PB、安全边际'
    },
    {
      key: 'contrarian',
      label: '逆向',
      value: dimensions.contrarian,
      icon: <Shield className="h-5 w-5" />,
      description: '市场情绪、逆向机会'
    },
    {
      key: 'pricingPower',
      label: '定价权',
      value: dimensions.pricingPower,
      icon: <DollarSign className="h-5 w-5" />,
      description: '产品定价能力、品牌溢价'
    },
  ];

  const average = dimensionItems.reduce((sum, d) => sum + d.value, 0) / dimensionItems.length;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">五维分析</CardTitle>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">综合：</span>
            <Badge variant="outline" className="text-lg font-bold">
              {average.toFixed(1)}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {dimensionItems.map((item) => {
            const config = getScoreColor(item.value);
            return (
              <div key={item.key} className="space-y-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500">{item.icon}</span>
                    <span className="font-medium">{item.label}</span>
                    <span className="text-xs text-gray-400 hidden sm:inline">({item.description})</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`font-bold ${config.text}`}>{item.value}</span>
                    <Badge variant="outline" className={`text-xs ${config.text}`}>
                      {config.label}
                    </Badge>
                  </div>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-3">
                  <div
                    className={`${config.bar} h-3 rounded-full transition-all duration-500`}
                    style={{ width: `${item.value}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
