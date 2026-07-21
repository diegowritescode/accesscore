import { NextResponse } from 'next/server';
import { proxyGet } from '@/lib/bff';

export async function GET(): Promise<NextResponse> {
  return proxyGet('/auth/mfa/status');
}
