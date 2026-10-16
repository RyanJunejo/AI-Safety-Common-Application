import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Signed unsubscribe tokens. Nothing is stored: the token is the account ID plus an
 * HMAC of it, so links in old emails keep working until the secret changes.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function sign(userId: string, secret: string): string {
  return createHmac('sha256', secret).update(`unsubscribe:${userId.toLowerCase()}`).digest('base64url').slice(0, 32);
}

export function unsubscribeToken(userId: string, secret: string): string {
  return `${userId.toLowerCase()}.${sign(userId, secret)}`;
}

/** The account ID a token was issued for, or null if it's malformed or forged. */
export function verifyUnsubscribeToken(token: string | null | undefined, secret: string): string | null {
  const [userId, mac] = (token ?? '').split('.');
  if (!userId || !mac || !UUID.test(userId)) return null;
  const expected = Buffer.from(sign(userId, secret));
  const given = Buffer.from(mac);
  return expected.length === given.length && timingSafeEqual(expected, given) ? userId.toLowerCase() : null;
}

export function unsubscribeUrl(siteUrl: string, userId: string, secret: string): string {
  return `${siteUrl.replace(/\/$/, '')}/api/unsubscribe?token=${encodeURIComponent(unsubscribeToken(userId, secret))}`;
}
