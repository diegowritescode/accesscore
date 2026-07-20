import { NextResponse } from 'next/server';
import { proxyAuthorized } from '@/lib/bff';

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  return proxyAuthorized(request, `/authz/policies/${encodeURIComponent(id)}`, 'PUT');
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  return proxyAuthorized(request, `/authz/policies/${encodeURIComponent(id)}`, 'DELETE');
}
