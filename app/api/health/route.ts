/**
 * CodoGraph — Production Health Check Endpoint.
 *
 * Used by Render, load balancers, and container orchestrators for zero-downtime health probing.
 */
import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json(
    {
      status: 'ok',
      service: 'codograph',
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
    },
    {
      status: 200,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    }
  );
}

export async function HEAD() {
  return new Response(null, {
    status: 200,
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  });
}

