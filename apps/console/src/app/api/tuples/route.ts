import { NextResponse } from 'next/server';
import { proxyGet } from '@/lib/bff';

export async function GET(request: Request): Promise<NextResponse> {
  const { search } = new URL(request.url);
  return proxyGet(`/authz/tuples${search}`);
}
