'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  Loader2, CheckCircle, AlertCircle, ChevronDown, ChevronRight,
  Database, Brain, FileSearch, Save, Sparkles
} from 'lucide-react';

export type StepStatus = 'pending' | 'running' | 'done' | 'error';

export interface TimelineStep {
  key: string;                          // 唯一 id，用于 upsert
  title: string;                        // 步骤标题（如 "Step 0.0 · API 优先取数"）
  detail?: string;                      // 一句话说明
  status: StepStatus;
  meta?: Record<string, unknown>;       // 详细数据，展开时显示
  /** AI 当前正在写的章节（仅 analyze 步骤使用） */
  currentSection?: string;
  /** AI 已写过的章节列表（仅 analyze 步骤使用） */
  writtenSections?: string[];
}

interface AnalysisTimelineProps {
  status: 'idle' | 'fetching' | 'analyzing' | 'complete' | 'error';
  progress: number;
  steps: TimelineStep[];
  partialMarkdown: string;
  error?: string;
}

function stepIcon(key: string) {
  switch (key) {
    case 'fetch':   return <Database className="h-4 w-4" />;
    case 'analyze': return <Brain className="h-4 w-4" />;
    case 'parse':   return <FileSearch className="h-4 w-4" />;
    case 'save':    return <Save className="h-4 w-4" />;
    default:        return <Sparkles className="h-4 w-4" />;
  }
}

function statusIcon(status: StepStatus) {
  switch (status) {
    case 'done':
      return <CheckCircle className="h-4 w-4 text-green-500" />;
    case 'error':
      return <AlertCircle className="h-4 w-4 text-red-500" />;
    case 'running':
      return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
    case 'pending':
    default:
      return <div className="h-4 w-4 rounded-full border-2 border-gray-300" />;
  }
}

/** 把 meta 渲染为人类可读的 key/value 列表 */
function renderMeta(meta: Record<string, unknown>) {
  return Object.entries(meta).map(([k, v]) => {
    if (v === null || v === undefined) return null;
    let valueNode: React.ReactNode;
    if (Array.isArray(v)) {
      if (v.length === 0) return null;
      valueNode = (
        <ul className="list-disc list-inside space-y-0.5">
          {v.map((item, i) => (
            <li key={i} className="text-gray-700">{String(item)}</li>
          ))}
        </ul>
      );
    } else if (typeof v === 'object') {
      valueNode = (
        <pre className="text-[11px] bg-white p-2 rounded border overflow-x-auto">
          {JSON.stringify(v, null, 2)}
        </pre>
      );
    } else {
      valueNode = <span className="text-gray-700 font-mono">{String(v)}</span>;
    }
    return (
      <div key={k} className="text-xs">
        <span className="text-gray-500 mr-2">{k}：</span>
        {valueNode}
      </div>
    );
  });
}

function StepRow({ step, defaultOpen }: { step: TimelineStep; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const hasDetails =
    (step.meta && Object.keys(step.meta).length > 0) ||
    (step.writtenSections && step.writtenSections.length > 0);

  return (
    <div className="border-l-2 border-gray-200 pl-4 pb-4 relative">
      {/* 节点圆点 */}
      <div className="absolute -left-[7px] top-0.5 bg-white">
        {statusIcon(step.status)}
      </div>

      <button
        type="button"
        onClick={() => hasDetails && setOpen(!open)}
        className={`flex items-start gap-2 text-left w-full ${hasDetails ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}`}
      >
        <div className="text-gray-400 mt-0.5">{stepIcon(step.key)}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-medium text-sm">{step.title}</span>
            {hasDetails && (
              open
                ? <ChevronDown className="h-3 w-3 text-gray-400" />
                : <ChevronRight className="h-3 w-3 text-gray-400" />
            )}
          </div>
          {step.detail && (
            <div className="text-xs text-gray-500 mt-0.5">{step.detail}</div>
          )}
          {/* analyze 步骤的"AI 正在写哪个章节" */}
          {step.currentSection && step.status === 'running' && (
            <div className="text-xs text-blue-600 mt-1 flex items-center gap-1">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
              正在写：{step.currentSection}
            </div>
          )}
        </div>
      </button>

      {open && hasDetails && (
        <div className="mt-2 ml-6 p-3 bg-gray-50 rounded-md space-y-1.5">
          {step.writtenSections && step.writtenSections.length > 0 && (
            <div className="text-xs">
              <div className="text-gray-500 mb-1">已完成章节（{step.writtenSections.length}）：</div>
              <ul className="list-disc list-inside space-y-0.5">
                {step.writtenSections.map((s, i) => (
                  <li key={i} className="text-gray-700">{s}</li>
                ))}
              </ul>
            </div>
          )}
          {step.meta && renderMeta(step.meta)}
        </div>
      )}
    </div>
  );
}

export default function AnalysisTimeline({
  status,
  progress,
  steps,
  partialMarkdown,
  error,
}: AnalysisTimelineProps) {
  const statusText = {
    idle: '等待开始...',
    fetching: '正在采集数据...',
    analyzing: 'AI 正在按 SKILL 方法论分析...',
    complete: '分析完成！',
    error: '分析失败',
  }[status];

  // 从 partialMarkdown 末尾抽几行作为流式预览
  const previewLines = partialMarkdown
    ? partialMarkdown.split('\n').filter(l => l.trim()).slice(-6)
    : [];

  // 找到当前 running 的步骤，默认展开它
  const runningKey = steps.find(s => s.status === 'running')?.key;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {status === 'complete'
            ? <CheckCircle className="h-5 w-5 text-green-500" />
            : status === 'error'
              ? <AlertCircle className="h-5 w-5 text-red-500" />
              : <Loader2 className="h-5 w-5 animate-spin text-blue-500" />}
          {statusText}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 进度条 */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-gray-500">
            <span>整体进度</span>
            <span className="font-medium">{Math.round(progress)}%</span>
          </div>
          <Progress value={progress} max={100} className="h-2" />
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-md">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {/* 时间线 */}
        {steps.length > 0 && (
          <div className="pt-2">
            {steps.map(step => (
              <StepRow
                key={step.key}
                step={step}
                defaultOpen={step.key === runningKey}
              />
            ))}
          </div>
        )}

        {/* 流式输出预览 */}
        {previewLines.length > 0 && status === 'analyzing' && (
          <div>
            <div className="text-xs text-gray-500 mb-1.5">报告流式输出（最近 6 行）：</div>
            <div className="border rounded-md p-3 max-h-40 overflow-auto bg-gray-50">
              <pre className="text-xs text-gray-700 whitespace-pre-wrap font-mono leading-relaxed">
                {previewLines.join('\n')}
                <span className="inline-block w-1.5 h-3 bg-blue-500 animate-pulse ml-0.5 align-middle" />
              </pre>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
