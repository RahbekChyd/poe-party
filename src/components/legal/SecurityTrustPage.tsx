import { CONTACT_EMAIL, CONTACT_MAILTO, GITHUB_URL } from '../../lib/seo'
import { LegalLayout } from './LegalLayout'
export function SecurityTrustPage() {
  return (
    <LegalLayout title="Security & Trust" lastUpdated="July 7, 2026">
      <p>
        This page explains how PoE Party handles Path of Exile authentication, what data the product
        accesses, what it stores, and the current limits of its security posture.
      </p>

      <h2>1. Current Security Posture</h2>
      <p>PoE Party has not completed an independent third-party security audit at this time.</p>
      <p>
        The service is built with standard security controls, internal review, and least-privilege
        access in mind, but it should still be treated as an early-stage product that is improving
        over time.
      </p>

      <h2>2. Transparency &amp; Source Availability</h2>
      <p>
        PoE Party is open source under Apache-2.0. The{' '}
        <a
          href={GITHUB_URL}
          className="text-primary hover:underline"
          target="_blank"
          rel="noreferrer"
        >
          public GitHub repository
        </a>{' '}
        includes the frontend application, Supabase schema/functions, optimizer worker,
        analyser/scoring logic, local tooling, and validation workflows for review and contribution.
      </p>
      <p>
        Production secrets, operator scripts, comp grants, incident response, abuse-sensitive
        runbooks, and hosted-service automation are private operations material. The open-source
        repo should stay useful without exposing those production controls.
      </p>
      <p>
        Source availability improves transparency, but it is not the same as an independent security
        audit. The current audit status remains described above.
      </p>

      <h2>3. What We Never Ask For</h2>
      <ul>
        <li>Your Path of Exile password</li>
        <li>Your email password</li>
        <li>Any unrelated game or platform credentials</li>
      </ul>
      <p>
        If you are using the production OAuth flow, authenticate directly with Path of Exile and
        only approve the requested read scopes.
      </p>

      <h2>4. What Access We Request</h2>
      <p>
        PoE Party currently requests read access needed to power group coordination, economy
        tracking, character sync, stash snapshots, public strategy previews, and upgrade planning.
      </p>
      <ul>
        <li>Characters</li>
        <li>Stashes</li>
        <li>League and league-account data</li>
        <li>Item-filter related data used by the current integration</li>
      </ul>
      <p>
        These scopes are used to let players sync characters, take stash snapshots, and view
        group-level economy, services, strategy, and planning data.
      </p>

      <h2>5. What Data We Store</h2>
      <ul>
        <li>Basic account profile data such as your PoE account name and display name</li>
        <li>Group membership, roles, invite-based group associations, and app preferences</li>
        <li>Character metadata and active-character selections</li>
        <li>Stash snapshot data that you choose to sync</li>
        <li>Derived pricing, wealth history, and strategy-linked summary data</li>
        <li>
          Planning data such as strategies, service listings, strategy notes, gear suggestions, and
          upgrade analysis summaries
        </li>
      </ul>

      <h2>6. Tokens and Secrets</h2>
      <p>
        OAuth client secrets are kept server-side. Production authentication is designed so users
        authenticate with Path of Exile directly rather than entering sensitive credentials into PoE
        Party.
      </p>
      <p>
        Access and refresh tokens required for the PoE integration are currently stored in the
        backend database in a table restricted to the service role so the app can refresh access and
        complete sync-related actions. Those tokens are not intended to be exposed in the browser
        UI.
      </p>
      <p>
        Stripe secret keys, webhook signing secrets, and billing price identifiers are kept in
        Supabase Edge Function secrets. The browser can request checkout or portal sessions, but it
        cannot grant Supporter access directly.
      </p>

      <h2>7. Group Visibility</h2>
      <p>
        PoE Party is a coordination product. Data you sync into a group can be visible to the other
        members of that group, including stash-derived values, characters, planning notes, and
        related summary views.
      </p>
      <p>
        If a strategy, service, group, or character summary is published to a public preview or
        discovery view, that public summary can be visible outside the signed-in workspace.
      </p>
      <p>
        You should only join groups you trust and only sync data you are comfortable sharing with
        that group.
      </p>

      <h2>8. Revoking Access</h2>
      <p>If you no longer want PoE Party to access your data, you should:</p>
      <ol>
        <li>Stop using the service and contact support if you want stored app data removed</li>
        <li>Revoke the relevant application access from your Path of Exile account settings</li>
        <li>Ask for manual review of any stored app data tied to your account if needed</li>
      </ol>
      <p>
        For help with account, privacy, or deletion requests, contact{' '}
        <a href={CONTACT_MAILTO} className="text-primary hover:underline">
          {CONTACT_EMAIL}
        </a>
        .
      </p>

      <h2>9. Responsible Disclosure</h2>
      <p>
        If you believe you found a vulnerability, report it privately to{' '}
        <a href={CONTACT_MAILTO} className="text-primary hover:underline">
          {CONTACT_EMAIL}
        </a>
        . Include reproduction steps, impact, and any logs or screenshots that help validate the
        issue.
      </p>
      <p>
        Please do not publicly disclose security issues before they have been reviewed and
        addressed.
      </p>

      <h2>10. Why Limits Exist</h2>
      <p>
        Snapshot retention and authenticated upgrade-analysis queues have limits because they use
        shared database storage, worker time, and hosted compute capacity. Community access keeps
        core workspace and public/community features available, while Supporter capacity helps fund
        the higher-retention and scheduled-workload paths.
      </p>
      <p>
        Public Analysis is separate: it remains limited to one public quick run per PoE account per
        UTC day with an IP abuse guard, because that path is unauthenticated and must be stricter
        against automated use.
      </p>

      <h2>11. Known Limits</h2>
      <ul>
        <li>PoE Party is still an early-stage product</li>
        <li>Some features and retention behavior may change during early access</li>
        <li>No online service can guarantee perfect security</li>
      </ul>
      <p>
        The goal is to stay explicit about what the app does today, tighten weak areas as the
        product matures, and avoid making claims that overstate the current level of assurance.
      </p>
    </LegalLayout>
  )
}
