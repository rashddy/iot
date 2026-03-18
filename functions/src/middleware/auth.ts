/**
 * Authentication and authorization middleware.
 */

import { NextFunction, Request, Response } from 'express';
import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions';

export interface AuthContext {
  uid: string;
  email?: string;
  iat: number;
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
      timestamp?: string;
      requestId?: string;
    }
  }
}

/**
 * Verify Firebase Authentication token from Authorization header.
 * Populates request.auth if valid.
 */
export async function verifyAuthToken(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    next({ status: 401, code: 'MISSING_TOKEN', message: 'Missing or invalid authorization header' });
    return;
  }

  const token = authHeader.slice(7);
  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    req.auth = {
      uid: decodedToken.uid,
      email: decodedToken.email,
      iat: decodedToken.iat,
    };
    next();
  } catch (error) {
    logger.warn('Token verification failed', { error: (error as Error).message });
    next({ status: 401, code: 'INVALID_TOKEN', message: 'Invalid or expired token' });
  }
}

/**
 * Device authentication via secret token (for ESP32).
 * Device authenticates via a device-specific secret in Authorization header.
 * Format: Authorization: DeviceSecret <deviceId>:<secret>
 */
export async function verifyDeviceToken(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('DeviceSecret ')) {
    next({ status: 401, code: 'MISSING_DEVICE_TOKEN', message: 'Missing device authentication' });
    return;
  }

  const credentials = authHeader.slice(12); // Remove "DeviceSecret "
  const [deviceId, secret] = credentials.split(':');

  if (!deviceId || !secret) {
    next({ status: 401, code: 'MALFORMED_DEVICE_TOKEN', message: 'Invalid device credentials format' });
    return;
  }

  try {
    const db = admin.database();
    const secretRef = await db.ref(`_deviceSecrets/${deviceId}`).once('value');
    const storedSecretHash = secretRef.val();

    if (!storedSecretHash) {
      next({ status: 401, code: 'DEVICE_NOT_FOUND', message: 'Device not registered' });
      return;
    }

    // In production: use bcrypt.compare() instead of direct comparison
    // This is a placeholder; implement constant-time comparison
    const matches = await compareSecrets(secret, storedSecretHash);
    if (!matches) {
      logger.warn('Device authentication failed', { deviceId });
      next({ status: 401, code: 'INVALID_DEVICE_SECRET', message: 'Invalid credentials' });
      return;
    }

    // Attach device context to request
    req.auth = {
      uid: `device:${deviceId}`,
      iat: Math.floor(Date.now() / 1000),
    };
    next();
  } catch (error) {
    logger.error('Device token verification error', { error: (error as Error).message });
    next({ status: 500, code: 'AUTH_ERROR', message: 'Authentication service error' });
  }
}

/**
 * Verify user owns the device (or has access).
 */
export async function requireDeviceOwnership(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  if (!req.auth?.uid) {
    next({ status: 401, code: 'UNAUTHORIZED', message: 'Authentication required' });
    return;
  }

  const deviceId = req.params.deviceId || req.body?.deviceId;
  if (!deviceId) {
    next({ status: 400, code: 'MISSING_DEVICE_ID', message: 'Device ID required' });
    return;
  }

  try {
    const db = admin.database();
    const devicesRef = await db.ref(`/users/${req.auth.uid}/devices/${deviceId}`).once('value');

    if (!devicesRef.exists()) {
      next({ status: 403, code: 'DEVICE_ACCESS_DENIED', message: 'Access denied to this device' });
      return;
    }

    next();
  } catch (error) {
    logger.error('Device ownership check failed', { error: (error as Error).message });
    next({ status: 500, code: 'AUTH_ERROR', message: 'Authorization check failed' });
  }
}

/**
 * Rate limiting middleware.
 * Tracks request count per userId per hour.
 */
export async function rateLimitMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  if (!req.auth?.uid) {
    next(); // Skip rate limiting for unauthenticated
    return;
  }

  const operation = req.method + ':' + req.path;
  const userId = req.auth.uid;
  const hour = Math.floor(Date.now() / 3600000); // Current hour bucket
  const bucketKey = `_rateLimits/${userId}/${operation}/${hour}`;

  try {
    const db = admin.database();
    const result = await db.ref(bucketKey).transaction((current) => {
      const count = (current || 0) + 1;
      const limit = getOperationLimit(operation);
      
      if (count > limit) {
        return; // Abort transaction
      }

      return count;
    });

    if (!result.committed) {
      next({
        status: 429,
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests. Try again later.',
      });
      return;
    }

    next();
  } catch (error) {
    // On error, allow request to proceed (fail open)
    logger.warn('Rate limit check error', { error: (error as Error).message });
    next();
  }
}

/**
 * Helper: Get operation-specific rate limit.
 */
function getOperationLimit(operation: string): number {
  const limits: Record<string, number> = {
    'POST:/triggerManualFeed': parseInt(process.env.RATE_LIMIT_MANUAL_FEED_PER_HOUR || '48'),
    'POST:/schedules': parseInt(process.env.RATE_LIMIT_SCHEDULE_OPS_PER_HOUR || '100'),
    'PUT:/schedules/:id': parseInt(process.env.RATE_LIMIT_SCHEDULE_OPS_PER_HOUR || '100'),
    'DELETE:/schedules/:id': parseInt(process.env.RATE_LIMIT_SCHEDULE_OPS_PER_HOUR || '100'),
    'default': parseInt(process.env.RATE_LIMIT_PER_USER_PER_HOUR || '1000'),
  };
  return limits[operation] || limits.default;
}

/**
 * Helper: Compare secrets with constant-time comparison.
 * In production, use bcrypt.compare() instead.
 */
async function compareSecrets(plaintext: string, hash: string): Promise<boolean> {
  // TODO: Implement bcrypt comparison
  // For now, direct comparison (NOT SECURE - for reference only)
  return plaintext === hash;
}

/**
 * Error handler middleware.
 */
export function errorHandler(
  error: any,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const status = error.status || 500;
  const code = error.code || 'INTERNAL_SERVER_ERROR';
  const message = error.message || 'An unexpected error occurred';

  res.status(status).json({
    success: false,
    error: {
      code,
      message,
      details: error.details,
    },
    timestamp: new Date().toISOString(),
  });
}
