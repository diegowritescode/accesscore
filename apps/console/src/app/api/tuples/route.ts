import { NextResponse } from 'next/server';
import { proxyAuthorized, proxyGet } from '@/lib/bff';

export async function GET(request: Request): Promise<NextResponse> {
  const { search } = new URL(request.url);
  return proxyGet(`/authz/tuples${search}`);
}

export async function POST(request: Request): Promise<NextResponse> {
  return proxyAuthorized(request, '/authz/tuples', 'POST');
}

export async function DELETE(request: Request): Promise<NextResponse> {
  return proxyAuthorized(request, '/authz/tuples', 'DELETE');
}
