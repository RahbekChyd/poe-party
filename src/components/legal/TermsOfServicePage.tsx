import { PLAN_PRICE_LABELS } from '../../lib/billing'
import { CONTACT_EMAIL, CONTACT_MAILTO } from '../../lib/seo'
import { LegalLayout } from './LegalLayout'
export function TermsOfServicePage() {
  return (
    <LegalLayout title="Terms of Service" lastUpdated="June 19, 2026">
      <p>
        Welcome to PoE Party, an independent Path of Exile group tool for party economy tracking,
        stash snapshots, public strategy previews, service listings, gear planning, and upgrade
        analysis. By accessing or using the service, you agree to be bound by these Terms of
        Service. If you do not agree, please do not use the service.
      </p>

      <h2>1. Description of Service</h2>
      <p>
        PoE Party helps Path of Exile and Path of Exile 2 players coordinate group play. Features
        may include group member management, character sync, stash snapshot review, group wealth
        history, strategy tracking, service listings, gear suggestions, and build upgrade planning.
        The service is not affiliated with, endorsed by, or connected to Grinding Gear Games (GGG).
      </p>

      <h2>2. Account and Authentication</h2>
      <p>
        To use the signed-in PoE Party workspace, you must authenticate through your Path of Exile
        account where supported. We use Supabase as our authentication provider. We never store your
        Path of Exile password. Your account may be linked to your PoE profile through OAuth tokens
        or other supported session flows used for sync-related features.
      </p>
      <p>
        You are responsible for maintaining the security of your account and for all activities that
        occur under your account.
      </p>

      <h2>3. Acceptable Use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>Use the service in any way that violates applicable laws or regulations</li>
        <li>Attempt to gain unauthorized access to other users' accounts or data</li>
        <li>Interfere with or disrupt the service or its infrastructure</li>
        <li>Use automated tools to scrape or overload the service</li>
        <li>Impersonate other users or misrepresent your identity</li>
        <li>Use the service in a manner that violates the Path of Exile Terms of Use</li>
      </ul>

      <h2>4. Intellectual Property</h2>
      <p>
        Path of Exile and all associated content, names, and imagery are trademarks and copyrights
        of Grinding Gear Games. PoE Party is an independent, community-built tool and is not
        affiliated with or endorsed by GGG. All game data displayed is retrieved through official
        PoE APIs.
      </p>

      <h2>5. User Content and Data</h2>
      <p>
        Group configurations, strategies, service listings, notes, and other content you create
        within PoE Party remain yours. By using the service, you grant us a limited license to store
        and display this content as necessary to provide the service to you, your group members, and
        any public preview pages you choose to publish.
      </p>

      <h2>6. Supporter Billing and Capacity</h2>
      <p>
        PoE Party offers an optional Supporter subscription at {PLAN_PRICE_LABELS.pro}. Payments,
        subscriptions, invoices, and billing management are handled by Stripe. Supporter access is
        granted from trusted billing events or manual support grants, not from client-side plan
        changes.
      </p>
      <p>
        You can manage eligible Stripe subscriptions through the billing portal linked in the app.
        Manual grants, tester access, and comped access may be changed or revoked separately from
        Stripe billing.
      </p>
      <p>
        Supporter capacity currently affects retained raw snapshot history, interval snapshot
        scheduling, and authenticated upgrade-analysis queue limits. Community access remains
        available without a paid subscription.
      </p>

      <h2>7. Service Availability</h2>
      <p>
        PoE Party is provided on an &ldquo;as-is&rdquo; basis. We make no guarantees regarding
        uptime, availability, or accuracy of data. The service may be modified, suspended, or
        discontinued at any time without notice.
      </p>

      <h2>8. Limitation of Liability</h2>
      <p>
        To the fullest extent permitted by law, PoE Party and its maintainers shall not be liable
        for any indirect, incidental, special, or consequential damages arising from your use of the
        service. This includes but is not limited to loss of in-game items, currency, progress,
        trade opportunities, or strategy outcomes.
      </p>

      <h2>9. Termination</h2>
      <p>
        We reserve the right to suspend or terminate your access to the service at any time, for any
        reason, without notice. You may stop using the service at any time by signing out and
        discontinuing use.
      </p>

      <h2>10. Changes to These Terms</h2>
      <p>
        We may update these Terms of Service from time to time. Continued use of the service after
        changes are posted constitutes acceptance of the revised terms. We encourage you to review
        this page periodically.
      </p>

      <h2>11. Contact</h2>
      <p>
        If you have questions about these Terms of Service, please contact us at{' '}
        <a href={CONTACT_MAILTO} className="text-primary underline underline-offset-2 hover:no-underline">
          {CONTACT_EMAIL}
        </a>
        .
      </p>
    </LegalLayout>
  )
}
