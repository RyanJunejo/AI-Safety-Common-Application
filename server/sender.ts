/** Sends email through Resend's HTTP API (https://resend.com/docs/api-reference/emails/send-email). */

export interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Sent as the provider's Idempotency-Key, so a retried send can't deliver twice. */
  idempotencyKey: string;
  /** One-click unsubscribe target for the List-Unsubscribe headers. */
  unsubscribeUrl?: string | null;
}

export interface EmailSender {
  send(email: OutgoingEmail): Promise<{ id: string }>;
}

export class SendError extends Error {
  constructor(
    message: string,
    /** Whether trying again later could work. */
    readonly retryable: boolean,
    /**
     * `rejected`: the provider refused the email, so it wasn't sent.
     * `unknown`: no definite answer (a timeout, network error, or 5xx); it may have been sent.
     */
    readonly outcome: 'rejected' | 'unknown' = retryable ? 'unknown' : 'rejected',
  ) {
    super(message);
    this.name = 'SendError';
  }
}

/** Longest a single send may take, including the provider's response. */
export const SEND_TIMEOUT_MS = 20_000;

export interface ResendOptions {
  apiKey: string;
  /** e.g. "SafetyApps <alerts@safetyapps.org>" on a domain verified in Resend. */
  from: string;
  replyTo?: string;
  fetch?: typeof fetch;
}

export function resendSender(o: ResendOptions): EmailSender {
  const doFetch = o.fetch ?? fetch;
  return {
    async send(email) {
      const headers: Record<string, string> = {};
      if (email.unsubscribeUrl) {
        headers['List-Unsubscribe'] = `<${email.unsubscribeUrl}>`;
        headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
      }
      let res: Response;
      try {
        res = await doFetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            authorization: `Bearer ${o.apiKey}`,
            'content-type': 'application/json',
            // Resend keeps keys for 24 hours and allows up to 256 characters.
            'idempotency-key': email.idempotencyKey.slice(0, 256),
          },
          body: JSON.stringify({
            from: o.from,
            to: [email.to],
            subject: email.subject,
            html: email.html,
            text: email.text,
            ...(o.replyTo ? { reply_to: o.replyTo } : {}),
            ...(Object.keys(headers).length ? { headers } : {}),
          }),
          signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
        });
      } catch (err) {
        // The request may have reached Resend before the connection failed.
        throw new SendError(`Network error: ${err instanceof Error ? err.message : String(err)}`, true, 'unknown');
      }
      const body = (await res.json().catch(() => ({}))) as { id?: string; name?: string; message?: string };
      if (res.ok && body.id) return { id: body.id };
      const message = `Resend ${res.status}${body.name ? ` ${body.name}` : ''}: ${body.message ?? 'no message'}`;
      // Rate limited: refused, so safe to retry at any time.
      if (res.status === 429) throw new SendError(message, true, 'rejected');
      // A server error, an accepted request without an ID, or the same key still in flight
      // (409 concurrent_idempotent_requests): the email may have gone out.
      if (res.ok || res.status >= 500 || (res.status === 409 && body.name === 'concurrent_idempotent_requests')) {
        throw new SendError(message, true, 'unknown');
      }
      throw new SendError(message, false, 'rejected');
    },
  };
}
