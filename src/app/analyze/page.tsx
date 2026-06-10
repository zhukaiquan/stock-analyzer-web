'use client';

import { Suspense } from 'react';
import AnalyzeContent from './AnalyzeContent';

export default function AnalyzePage() {
  return (
    <Suspense fallback={
      <div className="text-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto"></div>
        <p className="mt-4 text-gray-500">加载中...</p>
      </div>
    }>
      <AnalyzeContent />
    </Suspense>
  );
}
