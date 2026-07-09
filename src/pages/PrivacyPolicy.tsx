// Privacy Policy & Terms of Use — POPIA-aware notice for a portal that
// processes personal information (including minors' medical details) in
// South Africa. DRAFT prepared for legal review; the operator should have
// this checked by a practitioner before public launch is announced.
const EFFECTIVE_DATE = '6 July 2026'
const CONTACT_EMAIL = 'precisioncode.sa@gmail.com'

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-8 mb-2 text-lg font-semibold text-gray-900">{children}</h2>
}

export default function PrivacyPolicy() {
  return (
    <div className="mx-auto max-w-3xl text-sm leading-relaxed text-gray-700" data-testid="privacy-policy">
      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-400">Effective {EFFECTIVE_DATE} · Draft pending legal review</p>
      <p>
        This portal is operated by <strong>PrecisionCode PTY LTD</strong> ("we", "us") on behalf of the
        Eastern Province High Schools Rugby Union (EPHSRU) to manage the registration and administration of
        school rugby players, coaches, referees and officials in the Eastern Cape, South Africa. This notice
        explains how we handle personal information under the Protection of Personal Information Act, 2013
        (POPIA).
      </p>

      <H2>1. Responsible party</H2>
      <p>
        PrecisionCode PTY LTD is the operator of this platform and processes information on behalf of EPHSRU
        (the responsible party for union registration data). Questions, requests and complaints:{' '}
        <a className="text-brand underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>

      <H2>2. What we collect and why</H2>
      <ul className="list-disc space-y-1 pl-5">
        <li><strong>Identity & contact details</strong> (name, ID/passport number, date of birth, phone, email, address) — to register participants and verify age-group eligibility as required by union and SARU rules.</li>
        <li><strong>Rugby information</strong> (school/club, team, age group, position) — to administer competitions.</li>
        <li><strong>Medical information</strong> (medical aid, allergies, chronic conditions, emergency notes) — collected with consent, used solely for player safety at training and matches.</li>
        <li><strong>Parent/guardian details and consent</strong> — players under 18 are registered by or with the consent of a competent person (parent/guardian), recorded on the registration form.</li>
        <li><strong>Photographs and documents</strong> voluntarily uploaded (profile photos, certificates, clearances) — for identification cards and administration.</li>
        <li><strong>Usage records</strong> (sign-ins, administrative actions) — kept in an audit trail for security and accountability.</li>
      </ul>

      <H2>3. Children's information</H2>
      <p>
        Most players are minors. Their information is captured by authorised school staff with
        parent/guardian consent (the POPIA consent captured at registration). Medical details are visible
        only to the player's own coaches and school administrators, union officials in the reporting line,
        and the player themselves.
      </p>

      <H2>4. Who can see what</H2>
      <p>
        Access follows the union's reporting hierarchy: coaches and school administrators see only their own
        school's people; zone coordinators only their zone; union administrators the whole union. We do not
        sell personal information or share it with third parties for marketing. Information is disclosed
        only to the union structures above, service providers that host the platform (database, file storage
        and email delivery providers), or where the law requires it.
      </p>

      <H2>5. Storage and security</H2>
      <p>
        Data is stored in access-controlled cloud infrastructure. Passwords are stored only as one-way
        hashes; connections are encrypted (HTTPS); role-based access is enforced on every request; and an
        audit log records administrative actions. Hosting providers may store data outside South Africa
        under their own safeguards.
      </p>

      <H2>6. Retention</H2>
      <p>
        Registration records are kept for the seasons a participant is active plus a reasonable
        administrative period, after which they are deleted or de-identified. A parent/guardian or
        participant may request earlier deletion (section 7).
      </p>

      <H2>7. Your rights</H2>
      <p>
        You (or a parent/guardian acting for a minor) may ask us to confirm what personal information we
        hold, correct it, or delete it, by emailing{' '}
        <a className="text-brand underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> — players
        can also edit much of their own profile after signing in. You may lodge a complaint with the
        Information Regulator (South Africa): inforeg.org.za.
      </p>

      <H2>8. Terms of use</H2>
      <ul className="list-disc space-y-1 pl-5">
        <li>Accounts are personal; keep your password confidential and do not share sign-in details.</li>
        <li>Administrative users may capture information about others only with the authority of their school/union role and, for minors, with parent/guardian consent.</li>
        <li>Do not upload unlawful content or use the platform to harass or defraud; accounts that abuse the platform may be suspended by the union.</li>
        <li>The platform is provided as-is in support of union administration; match-day QR verification confirms registration status only.</li>
        <li>We may update this notice; material changes will be signposted on this page with a new effective date.</li>
      </ul>

      <p className="mt-8 text-xs text-gray-400">
        © {new Date().getFullYear()} PrecisionCode PTY LTD · Operated for the Eastern Province High Schools Rugby Union.
      </p>
    </div>
  )
}
