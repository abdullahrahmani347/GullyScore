/**
 * Server-side Device ID Authentication & Authorization for GullyScore
 *
 * Extracts the device ID from incoming requests and provides helpers
 * for filtering queries and enforcing ownership.
 *
 * Device ID is passed via the `X-Device-Id` custom HTTP header.
 * All data-scoped endpoints should use these helpers to ensure
 * devices can only access their own data.
 */

import { NextRequest, NextResponse } from 'next/server';

/**
 * Extracts the device ID from the request headers.
 * Returns null if no device ID is present.
 */
export function getDeviceIdFromRequest(request: NextRequest | Request): string | null {
  const deviceId = request.headers.get('X-Device-Id');
  if (!deviceId || deviceId.trim() === '') {
    return null;
  }
  return deviceId.trim();
}

/**
 * Requires a device ID to be present in the request.
 * Returns the device ID if present, or a 401 response if missing.
 */
export function requireDeviceId(request: NextRequest | Request): string | NextResponse {
  const deviceId = getDeviceIdFromRequest(request);
  if (!deviceId) {
    return NextResponse.json(
      { error: 'Device identification required. Please refresh the page.' },
      { status: 401 }
    );
  }
  return deviceId;
}

/**
 * Type guard to check if the result of requireDeviceId is a string (device ID)
 * rather than a NextResponse (error response).
 */
export function isDeviceId(result: string | NextResponse): result is string {
  return typeof result === 'string';
}

/**
 * Verifies that a resource belongs to the requesting device.
 * Returns the device ID if ownership matches, or a 403 response if not.
 *
 * @param request - The incoming request
 * @param resourceDeviceId - The deviceId stored on the resource
 * @returns The device ID string on success, or a 403 NextResponse on mismatch
 */
export function verifyOwnership(
  request: NextRequest | Request,
  resourceDeviceId: string | null | undefined
): string | NextResponse {
  const deviceId = getDeviceIdFromRequest(request);

  // If the resource has no deviceId (legacy data), allow access
  if (!resourceDeviceId) {
    return deviceId || 'legacy';
  }

  // If no device ID in request, deny access
  if (!deviceId) {
    return NextResponse.json(
      { error: 'Device identification required. Please refresh the page.' },
      { status: 401 }
    );
  }

  // If device IDs don't match, deny access
  if (deviceId !== resourceDeviceId) {
    return NextResponse.json(
      { error: 'You do not have access to this resource.' },
      { status: 403 }
    );
  }

  return deviceId;
}

/**
 * Type guard to check if verifyOwnership result is a string (authorized)
 * rather than a NextResponse (error response).
 */
export function isAuthorized(result: string | NextResponse): result is string {
  return typeof result === 'string';
}
