import { NextResponse } from 'next/server';
import { listReports } from '@/lib/storage';

export async function GET() {
  try {
    const reports = await listReports();
    return NextResponse.json(reports);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
