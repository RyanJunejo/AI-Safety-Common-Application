import { useTitle } from '../components/useTitle';
import { Link } from '../router';
import { SITE } from '../site';

export function PrivacyView() {
  useTitle('Privacy');
  return (
    <article className="narrow prose" aria-labelledby="privacy-title">
      <h1 id="privacy-title">Privacy</h1>
      <p className="muted">Public beta. Last updated October 9, 2026.</p>

      <h2>Browsing</h2>
      <p>
        You can browse and save listings without an account. Saved listings stay in your browser’s storage on your device, and aren’t sent to
        us until you sign in.
      </p>

      <h2>What we store when you sign in</h2>
      <ul>
        <li>Your email address, to sign you in and, if you ask, to send alerts.</li>
        <li>Your alert choices: whether alerts are on, which types, focus, and places you want.</li>
        <li>The IDs of the listings you save and the programs you follow.</li>
      </ul>
      <p>
        That’s all. We don’t ask for your name, CV, or application answers, and we don’t upload anything else from your browser. To send
        alerts, we also keep a record of which listings we’ve already emailed you about, so nothing is sent twice, and a copy of each alert
        for up to 30 days in case it needs to be resent.
      </p>

      <h2>Email</h2>
      <p>
        Signing in sends you a one-time link. Alerts are separate: they stay off until you turn them on in your account. Every alert has a
        one-click unsubscribe link, and you can turn alerts off in your account at any time.
      </p>

      <h2>Who processes your data</h2>
      <ul>
        <li>Supabase stores accounts and sends sign-in emails.</li>
        <li>Resend delivers email.</li>
        <li>Vercel hosts the site and runs the daily jobs.</li>
      </ul>
      <p>We don’t sell your data or use it for advertising, and we don’t use tracking cookies.</p>

      <h2>Deleting your data</h2>
      <p>
        In your <Link href="/account">account</Link>, choose <strong>Delete my account</strong>. That removes your email address, choices,
        saved list, followed programs, and any queued alerts. To clear what’s in your browser, sign out or clear this site’s storage.
      </p>

      <h2>Listings</h2>
      <p>
        Listings come from <a href="https://aisafety.com">AISafety.com</a>’s public data, used under the{' '}
        <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a> license. Deadlines are shown as published; always check the
        official page.
      </p>

      <h2>Contact</h2>
      <p>
        Questions or requests: <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a>.
      </p>
    </article>
  );
}
