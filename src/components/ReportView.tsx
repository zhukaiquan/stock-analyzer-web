'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import ReactMarkdown from 'react-markdown';

interface ReportViewProps {
  markdown: string;
  sections?: Array<{
    title: string;
    content: string;
  }>;
}

export default function ReportView({ markdown, sections }: ReportViewProps) {
  // If sections are provided, use them for structured display
  if (sections && sections.length > 0) {
    return (
      <div className="space-y-6">
        {sections.map((section, index) => (
          <Card key={index}>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Badge variant="outline">{index + 1}</Badge>
                <CardTitle>{section.title}</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="prose prose-sm max-w-none">
                <ReactMarkdown>{section.content}</ReactMarkdown>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  // Otherwise, render the full markdown
  return (
    <Card>
      <CardContent className="p-6">
        <div className="prose prose-sm max-w-none">
          <ReactMarkdown>{markdown}</ReactMarkdown>
        </div>
      </CardContent>
    </Card>
  );
}
