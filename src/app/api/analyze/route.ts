import { NextRequest, NextResponse } from 'next/server';
import { analyzeStock } from '@/lib/analyzer';
import { detectMarket } from '@/lib/stock-search';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { symbol, market: inputMarket } = body;

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
        const sendEvent = (event: string, data: unknown) => {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
          );
        };

        try {
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
          controller.close();
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
