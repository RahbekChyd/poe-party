import { CONTACT_EMAIL, CONTACT_MAILTO } from '../../lib/seo'
import { LegalLayout } from './LegalLayout'
export function CookiePolicyPage() {
  return (
    <LegalLayout title="Cookie Policy" lastUpdated="April 30, 2026">
      <p>
        This Cookie Policy explains how PoE Party uses cookies and similar technologies when you use
        the Path of Exile group management web app, public previews, and signed-in workspace.
      </p>

      <h2>1. What Are Cookies</h2>
      <p>
        Cookies are small text files stored on your device by your web browser. They are used to
        remember information about your visit, such as your login session and preferences.
      </p>

      <h2>2. Cookies We Use</h2>
      <p>PoE Party uses essential cookies and local storage needed for the service to function:</p>
      <ul>
        <li>
          <strong>Authentication session:</strong> Supabase stores a session token to keep you
          signed in. This is required for the service to work and cannot be disabled.
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
        about public pages and app routes. We do not use advertising cookies, and we do not track
        your browsing behavior across other websites.
      </p>
      <p>
        Analytics data is used to understand page usage, spot issues, and improve the product during
        early access.
      </p>

      <h2>4. Managing Cookies</h2>
      <p>
        You can manage cookies through your browser settings. Most browsers allow you to block or
        delete cookies. However, blocking essential cookies will prevent you from using PoE Party,
        as authentication requires session cookies.
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
        <a href={CONTACT_MAILTO} className="text-primary hover:underline">
          {CONTACT_EMAIL}
        </a>
        .
      </p>
    </LegalLayout>
  )
}
