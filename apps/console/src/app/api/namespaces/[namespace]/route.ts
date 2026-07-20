import { NextResponse } from 'next/server';
import { proxyAuthorized, proxyGet } from '@/lib/bff';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ namespace: string }> },
): Promise<NextResponse> {
  const { namespace } = await params;
  return proxyGet(`/authz/namespaces/${encodeURIComponent(namespace)}`);
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ namespace: string }> },
): Promise<NextResponse> {
  const { namespace } = await params;
  return proxyAuthorized(request, `/authz/namespaces/${encodeURIComponent(namespace)}`, 'PUT');
}
