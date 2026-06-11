'use client';

import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Loader2, CheckCircle, AlertCircle } from 'lucide-react';

interface AnalysisProgressProps {
  status: 'idle' | 'fetching' | 'analyzing' | 'complete' | 'error';
  progress: number;
  currentStep: string;
  partialMarkdown: string;
  error?: string;
}

export default function AnalysisProgress({
  status,
  progress,
  currentStep,
  partialMarkdown,
  error
}: AnalysisProgressProps) {
  const getStatusIcon = () => {
    switch (status) {
      case 'complete':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'error':
        return <AlertCircle className="h-5 w-5 text-red-500" />;
      default:
        return <Loader2 className="h-5 w-5 animate-spin text-blue-500" />;
    }
  };

  const getStatusText = () => {
    switch (status) {
      case 'idle':
        return '等待开始...';
      case 'fetching':
        return '正在获取股票数据...';
      case 'analyzing':
        return 'AI 正在分析中...';
      case 'complete':
        return '分析完成！';
      case 'error':
        return '分析失败';
    }
  };

  const getStepText = () => {
    const steps: Record<string, string> = {
      'fetching_data': '准备获取数据...',
      'data_fetched': '数据获取完成',
      'analyzing': 'AI 分析中...',
      'analysis_complete': '分析完成',
      'parsed': '解析报告...',
      'saved': '保存报告...',
    };

    return steps[currentStep] || currentStep;
  };

  // Extract a preview of the last few lines for display
  const previewText = useMemo(() => {
    if (!partialMarkdown) return '';
    const lines = partialMarkdown.split('\n').filter(line => line.trim());
    // Show last 8 lines
    const lastLines = lines.slice(-8);
    return lastLines.join('\n');
  }, [partialMarkdown]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {getStatusIcon()}
          {getStatusText()}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">{getStepText()}</span>
            <span className="font-medium">{Math.round(progress)}%</span>
          </div>
          <Progress value={progress} max={100} className="h-2" />
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-md">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {previewText && status === 'analyzing' && (
          <div className="border rounded-md p-4 max-h-48 overflow-auto bg-gray-50">
            <pre className="text-sm text-gray-700 whitespace-pre-wrap font-mono leading-relaxed">
              {previewText}
              <span className="inline-block w-2 h-4 bg-blue-500 animate-pulse ml-0.5" />
            </pre>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
