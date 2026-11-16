import { CONTACT_EMAIL, CONTACT_MAILTO } from '../../lib/seo'
import { LegalLayout } from './LegalLayout'
export function PrivacyPolicyPage() {
  return (
    <LegalLayout title="Privacy Policy" lastUpdated="July 20, 2026">
      <p>
        Your privacy is important to us. This Privacy Policy explains what information PoE Party
        collects for its Path of Exile group tools, how we use it, and your rights regarding your
        data.
      </p>

      <h2>1. Information We Collect</h2>
      <p>When you use PoE Party, we collect the following information:</p>
      <ul>
        <li>
          <strong>Account information:</strong> Your Path of Exile account name and immutable OAuth
          account subject. PoE Party creates an internal synthetic email address for Supabase
          authentication; Path of Exile OAuth does not provide your personal email address to the
          app.
        </li>
        <li>
          <strong>Character data:</strong> Your PoE character names, levels, classes, and equipment
          data, retrieved through supported Path of Exile API integrations
        </li>
        <li>
          <strong>Group data:</strong> Group membership, roles, strategies, and configurations you
          create within the service
        </li>
        <li>
          <strong>Stash data:</strong> Item and currency information from your stash tabs, when you
          choose to sync them
        </li>
        <li>
          <strong>Public listing data:</strong> Strategy summaries, service listings, group names,
          character summaries, and other information you choose to make visible in public preview or
          discovery views
        </li>
        <li>
          <strong>Usage data:</strong> High-level app usage and performance data collected through
          Vercel Analytics
        </li>
        <li>
          <strong>Billing data:</strong> Stripe customer and subscription identifiers, subscription
          status, price identifiers, billing periods, and related webhook processing metadata
        </li>
      </ul>
      <p>
        We <strong>never</strong> store your Path of Exile password. Authentication is handled
        entirely through OAuth tokens managed by Supabase.
      </p>

      <h2>2. How We Use Your Information</h2>
      <p>We use the collected information to:</p>
      <ul>
        <li>Provide and maintain the PoE Party service</li>
        <li>Display group member information to your group</li>
        <li>Track economy data and generate insights for your group</li>
        <li>
          Provide gear suggestions, upgrade analysis, service listings, and strategy coordination
          features
        </li>
        <li>Show public strategy, service, character, and group discovery pages</li>
        <li>Understand product usage and improve reliability during early access</li>
      </ul>
      <p>
        We do not sell your personal information. We do not use your data for advertising purposes.
      </p>

      <h2>3. Data Storage</h2>
      <p>
        Your data is stored securely using Supabase (built on PostgreSQL). PoE OAuth tokens used for
        syncing are stored server-side and are not intended to be exposed in the browser UI. We
        implement reasonable security measures to protect your data, but no system is completely
        secure.
      </p>

      <h2>4. Third-Party Services</h2>
      <p>PoE Party integrates with the following third-party services:</p>
      <ul>
        <li>
          <strong>Supabase:</strong> Authentication, database, and backend infrastructure
        </li>
        <li>
          <strong>Path of Exile API:</strong> Retrieving character, stash, and league data from
          GGG&apos;s official API
        </li>
        <li>
          <strong>poe.ninja:</strong> Fetching current economy and pricing data
        </li>
        <li>
          <strong>Vercel Analytics:</strong> Aggregated app usage, performance, and coarse product
          activation milestones. Custom events do not include account, workspace, character, item,
          or run identifiers.
        </li>
        <li>
          <strong>Stripe:</strong> Payment checkout, subscriptions, invoices, and customer billing
          portal
        </li>
      </ul>
      <p>Each third-party service has its own privacy policy. We encourage you to review them.</p>

      <h2>5. Data Sharing</h2>
      <p>
        Your character and stash data may be visible to other members of your group, depending on
        your group&apos;s settings and your role within it. Public strategy previews, service
        listings, and discovery entries may be visible to anyone if you or your group publish them.
        We do not sell your personal information or share it with advertisers.
      </p>

      <h2>6. Data Retention</h2>
      <p>
        We retain your data for as long as your account is active. Snapshot history data, economy
        tracking summaries, stash snapshots, strategy data, and service listing data may be retained
        to provide historical insights and group workflows. If you want data removed, contact us and
        we will review the request and handle deletion manually where supported.
      </p>

      <h2>7. Your Rights</h2>
      <p>You have the right to:</p>
      <ul>
        <li>Access the personal data we hold about you</li>
        <li>Request correction of inaccurate data</li>
        <li>Request deletion of your data</li>
        <li>Withdraw consent and stop using the service at any time</li>
      </ul>

      <h2>8. Changes to This Policy</h2>
      <p>
        We may update this Privacy Policy from time to time. Changes will be posted on this page
        with an updated &ldquo;Last updated&rdquo; date. Continued use of the service constitutes
        acceptance of the revised policy.
      </p>

      <h2>9. Contact</h2>
      <p>
        For privacy-related questions or data requests, contact us at{' '}
        <a href={CONTACT_MAILTO} className="text-primary underline underline-offset-2 hover:no-underline">
          {CONTACT_EMAIL}
        </a>
        .
      </p>
    </LegalLayout>
  )
}
