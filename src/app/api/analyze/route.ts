import { NextRequest, NextResponse } from 'next/server';
import { analyzeStock } from '@/lib/analyzer';
import { detectMarket } from '@/lib/stock-search';
import { findRecentReport, getReport } from '@/lib/storage';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { symbol, market: inputMarket, force = false } = body as {
      symbol?: string;
      market?: string;
      force?: boolean;
    };

    if (!symbol) {
      return NextResponse.json(
        { error: '股票代码不能为空' },
        { status: 400 }
      );
    }

    const market = inputMarket || detectMarket(symbol);

    // Use SSE for streaming
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        let closed = false;
        const sendEvent = (event: string, data: unknown) => {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
          );
        };
        const closeOnce = () => {
          if (closed) return;
          closed = true;
          controller.close();
        };

        try {
          // 7 天报告缓存：命中即跳过 DeepSeek，省 token + 等待时间
          if (!force) {
            const recent = await findRecentReport(symbol, market);
            if (recent) {
              const full = await getReport(recent.id);
              if (full) {
                const ageDays = Math.floor(
                  (Date.now() - new Date(recent.createdAt).getTime()) / 86400000
                );
                sendEvent('cached', {
                  reportId: recent.id,
                  createdAt: recent.createdAt,
                  ageDays,
                });
                sendEvent('complete', {
                  id: full.id,
                  markdown: full.markdown,
                  parsed: full.parsed,
                });
                closeOnce();
                return;
              }
            }
          }

          const result = await analyzeStock(
            symbol,
            market as 'A' | 'HK' | 'US',
            (step, data) => {
              sendEvent(step, data);
            }
          );

          sendEvent('complete', result);
        } catch (err) {
          sendEvent('error', { message: (err as Error).message });
        } finally {
          closeOnce();
        }
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
