import { NextRequest, NextResponse } from 'next/server';
import { searchStocks } from '@/lib/stock-search';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q') || '';

    const results = await searchStocks(query);
    return NextResponse.json(results);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
