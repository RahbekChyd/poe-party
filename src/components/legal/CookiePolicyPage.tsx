import { CONTACT_EMAIL, CONTACT_MAILTO } from '../../lib/seo'
import { LegalLayout } from './LegalLayout'
export function CookiePolicyPage() {
  return (
    <LegalLayout title="Cookie Policy" lastUpdated="July 20, 2026">
      <p>
        This Cookie Policy explains how PoE Party uses cookies and similar technologies when you use
        the Path of Exile group management web app, public previews, and signed-in workspace.
      </p>

      <h2>1. What Are Cookies</h2>
      <p>
        Cookies are small text files stored on your device by your web browser. They are used to
        remember information about your visit, such as your login session and preferences.
      </p>

      <h2>2. Browser Storage We Use</h2>
      <p>
        PoE Party uses session storage and local storage needed for the service to function. Hosting,
        analytics, or authentication providers may also set operational cookies:
      </p>
      <ul>
        <li>
          <strong>Authentication session:</strong> Supabase session credentials are stored in
          browser session storage and are cleared when that browser session ends or you sign out.
        </li>
        <li>
          <strong>Theme preference:</strong> Your light/dark mode preference is stored in local
          storage to persist across sessions.
        </li>
        <li>
          <strong>Currency preference:</strong> Your preferred display currency (Chaos Orbs or
          Divine Orbs) is stored in local storage.
        </li>
        <li>
          <strong>Active group:</strong> Your currently selected group is stored in local storage
          for convenience.
        </li>
        <li>
          <strong>Preview and early-access state:</strong> Some read-only preview or notice
          preferences may be stored locally so the app can remember what you have already seen.
        </li>
      </ul>

      <h2>3. Analytics</h2>
      <p>
        PoE Party uses Vercel Analytics to collect high-level usage and performance information
        about public pages, app routes, and coarse milestones such as completing a workspace,
        sync, snapshot, strategy, or analysis action. Those custom events do not include account,
        workspace, character, item, or run identifiers. We do not use advertising cookies, and we
        do not track your browsing behavior across other websites.
      </p>
      <p>
        Analytics data is used to understand page usage, spot issues, and improve the product during
        early access.
      </p>

      <h2>4. Managing Cookies</h2>
      <p>
        You can manage cookies and site storage through your browser settings. Most browsers allow
        you to block or delete both. Clearing PoE Party site data signs you out and resets local
        preferences; blocking required browser storage prevents signed-in features from working.
      </p>
      <p>Common browser cookie settings:</p>
      <ul>
        <li>
          <strong>Chrome:</strong> Settings &gt; Privacy and Security &gt; Cookies and other site
          data
        </li>
        <li>
          <strong>Firefox:</strong> Settings &gt; Privacy &amp; Security &gt; Cookies and Site Data
        </li>
        <li>
          <strong>Edge:</strong> Settings &gt; Cookies and site permissions &gt; Cookies and site
          data
        </li>
        <li>
          <strong>Safari:</strong> Preferences &gt; Privacy &gt; Manage Website Data
        </li>
      </ul>

      <h2>5. Changes to This Policy</h2>
      <p>
        If we introduce new types of cookies in the future, we will update this policy and notify
        you accordingly.
      </p>

      <h2>6. Contact</h2>
      <p>
        If you have questions about our use of cookies, contact us at{' '}
        <a href={CONTACT_MAILTO} className="text-primary underline underline-offset-2 hover:no-underline">
          {CONTACT_EMAIL}
        </a>
        .
      </p>
    </LegalLayout>
  )
}
