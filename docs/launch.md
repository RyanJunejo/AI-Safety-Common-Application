# Launching the public beta

Everything below happens in outside accounts (DNS, Supabase, Resend, Vercel), so it's done by hand. Work through it on a staging deployment first, run the smoke test at the end, then point safetyapps.org at production.

When this was written, safetyapps.org didn't resolve yet.

## 1. Supabase

1. Create a project. Pick a region near most users (for example, `us-east-1` or `eu-west-2`).
2. Apply the schema: `npx supabase link --project-ref <ref>`, then `npx supabase db push`. This creates the catalog, account tables, row level security policies, and the private `internal` schema.
3. **Settings → API Keys:** note the publishable key (for the browser) and create a secret key (for account deletion). Legacy `anon` and `service_role` keys also work but are being retired.
4. **Connect → Transaction pooler:** copy the connection string (port 6543). This is `DATABASE_URL`.
5. **Authentication → URL Configuration:**
   - Site URL: `https://safetyapps.org`
   - Redirect URLs: `https://safetyapps.org/auth/confirm`, your staging URL's `/auth/confirm`, and `http://localhost:5173/auth/confirm`
6. **Authentication → Emails → SMTP Settings:** turn on custom SMTP with Resend (step 2 below): host `smtp.resend.com`, port `465`, username `resend`, password a Resend API key, sender `SafetyApps <signin@safetyapps.org>`. Without custom SMTP, Supabase sends only a few emails an hour, to team members only.
7. **Authentication → Emails → Templates:** paste `supabase/templates/magic_link.html` into both **Magic Link** and **Confirm signup**, with the subject "Your SafetyApps sign-in link". The link goes to `/auth/confirm` with a token hash, so it works in any browser. Free projects can only change templates once custom SMTP is on. Until then, the default email's link still signs people in, but only in the browser where they asked for it.
8. **Authentication → Rate Limits:** after custom SMTP is on, raise the email limit from 30 an hour to suit the invite list (for example, 200).
9. **Authentication → Sign In / Providers → Email:** keep email sign-in on. Password sign-in isn't used.

## 2. Resend and email DNS

1. Add the domain `safetyapps.org` in Resend. Add the DNS records it lists (SPF and DKIM, usually on a `send.` subdomain) at the domain registrar, and wait for **Verified**.
2. Add a DMARC record, for example `_dmarc.safetyapps.org TXT "v=DMARC1; p=none; rua=mailto:dmarc@safetyapps.org"`.
3. Create two API keys with sending access only: one for Supabase SMTP and one for the alerts job (`RESEND_API_KEY`).
4. Create the mailboxes the site names: `hello@safetyapps.org` (contact and reply-to) and whatever `OPS_EMAIL` will be. Alerts come from `alerts@safetyapps.org`.
5. Bulk-sender rules at Gmail and Yahoo require one-click unsubscribe, which every alert already has (`List-Unsubscribe` and `List-Unsubscribe-Post` headers, handled by `/api/unsubscribe`). If counsel advises it, add a postal address to the email footer in `src/alerts/email.ts`.

## 3. Vercel

1. Import the repository. Vercel detects Vite; `vercel.json` adds the cron jobs (sync at 08:00, alerts at 09:00, delivery retries at 11:00 and 15:00 UTC), the SPA rewrite, and security headers.
2. Set environment variables for Production (and Preview, pointing at the staging Supabase project). See `.env.example`:

   | Variable | Value |
   | --- | --- |
   | `VITE_SUPABASE_URL` | `https://<ref>.supabase.co` |
   | `VITE_SUPABASE_PUBLISHABLE_KEY` | publishable key |
   | `DATABASE_URL` | transaction pooler connection string |
   | `SUPABASE_SECRET_KEY` | secret key |
   | `CRON_SECRET` | `openssl rand -hex 32` |
   | `UNSUBSCRIBE_SECRET` | `openssl rand -hex 32`; changing it breaks unsubscribe links in sent emails |
   | `RESEND_API_KEY` | Resend key for alerts |
   | `ALERTS_FROM` | `SafetyApps <alerts@safetyapps.org>` |
   | `ALERTS_REPLY_TO` | `hello@safetyapps.org` |
   | `OPS_EMAIL` | where failures are reported |
   | `SITE_URL` | `https://safetyapps.org` |

3. Cron timing: on the Hobby plan, Vercel may run each daily job any time within its hour, so the 09:00 alerts job can start before the 08:00 sync finishes. The alerts job handles this by running the sync itself when today's hasn't run, but a Pro plan keeps the schedule exact.
4. If Supabase is ever served from a custom domain, add it to `connect-src` in the Content-Security-Policy in `vercel.json`.

## 4. Domain

1. In Vercel, add `safetyapps.org` and `www.safetyapps.org` to the project and set `www` to redirect to the apex.
2. At the registrar, add the records Vercel shows (an `A` record for the apex and a `CNAME` for `www`). Keep the Resend records from step 2.
3. Wait for the certificate, then confirm `https://safetyapps.org` loads and `https://safetyapps.org/api/status` answers.

## 5. Privacy and content

- Read `/privacy` (`src/views/PrivacyView.tsx`) and adjust it if anything about storage, providers, or contact changes.
- Ask AISafety.com whether they're happy with how listings are credited (every page footer and every listing). Corrections go to them, since they're the source.

## 6. Monitoring

- Point an uptime monitor (Better Stack, UptimeRobot, or similar) at `https://safetyapps.org/api/status`, checking for HTTP 200 every 30 to 60 minutes. A 503 lists its reasons in `problems`: the catalog or the alerts job hasn't completed in 26 hours, an alerts run stopped without finishing, an email has been stuck in the outbox, or an email failed in the last day. Right after launch it's 200 until the first alerts run is due.
- An email marked failed with "Not retried: an earlier attempt may have been delivered" was probably sent. Check Resend's logs for its delivery key before resending by hand.
- Failed syncs and failed deliveries also email `OPS_EMAIL`.
- Check `npm run catalog:review` weekly for cohorts waiting on a family decision, and `familiesWithoutRules` in `/api/status` for new recurring programs that need a rule.

## 7. Staging smoke test

Before connecting the domain, on the staging deployment:

1. Trigger the sync: `curl -H "Authorization: Bearer $CRON_SECRET" https://<staging>/api/cron/sync`. Expect `"baseline": true`. Browse the site and check counts against AISafety.com.
2. With two real test inboxes (say, a Gmail and an Outlook address):
   - Save two listings signed out, then sign in from the email link. The saves should appear in the account.
   - Confirm alerts are off until you tick the consent box and turn them on.
   - Follow a recurring program, and save a listing whose deadline is 7 days away.
   - Sign in as the second address in another browser and confirm you can't see the first account's list.
3. Trigger the alerts job: `curl -H "Authorization: Bearer $CRON_SECRET" https://<staging>/api/cron/alerts`. Expect the 7-day reminder. Run it again, then call `/api/cron/deliver` the same way; neither should send anything new.
4. Rehearse a failed source fetch: set `AISAFETY_API_URL` to `https://aisafety.com/api/v1/does-not-exist` on staging, redeploy, and trigger the sync. Expect a 500, an email to `OPS_EMAIL`, an unchanged catalog, and `/api/status` turning 503 once the catalog is a day old. Then remove the variable and redeploy.
5. Unsubscribe from the reminder email's footer link, then from the mail app's own unsubscribe button on another email. Both should turn alerts off.
6. Delete the test accounts from `/account` and confirm their rows are gone in Supabase.

`npm run smoke:functions` runs a local version of steps 1, 3, 4, and 5 against a throwaway Postgres; run it before each deploy that touches `server/` or the migration.

## 8. Inviting survey respondents

Use the draft in [beta-invite.md](beta-invite.md). Send it as a one-off message from your own email (not through the alerts system), and don't add anyone to alerts: people turn alerts on themselves after signing in.
