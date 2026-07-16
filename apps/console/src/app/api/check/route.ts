import { NextResponse } from 'next/server';
import { proxyAuthorized } from '@/lib/bff';

export async function POST(request: Request): Promise<NextResponse> {
  return proxyAuthorized(request, '/authz/check');
}
