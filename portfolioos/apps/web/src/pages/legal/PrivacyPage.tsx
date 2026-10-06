import { Link } from 'react-router-dom';

export function PrivacyPage() {
  return (
    <div
      // `prose` needs @tailwindcss/typography, which isn't installed, so the
      // page rendered as one undivided block. Style the elements directly.
      className="mx-auto max-w-3xl px-4 py-10 text-sm leading-relaxed text-foreground sm:px-6 [&_code]:break-all [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:text-[0.85em] [&_h1]:mb-4 [&_h1]:font-display [&_h1]:text-2xl [&_h1]:leading-tight [&_h2]:mb-2 [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-semibold [&_li]:my-1 [&_p]:my-3 [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-5"
    >
      <Link to="/" className="-my-2 -ml-2 mb-4 inline-block px-2 py-2 text-xs text-muted-foreground no-underline hover:text-foreground">
        ← EveryPaisa
      </Link>
      <h1>EveryPaisa Browser Extension — Privacy Policy</h1>
      <p><strong>Effective:</strong> 2026-05-07</p>
      <h2>What we collect</h2>
      <p>The EveryPaisa extension reads page content <strong>only</strong> on the following financial portal hostnames:</p>
      <ul>
        <li><code>passbook.epfindia.gov.in</code></li>
        <li><code>unifiedportal-mem.epfindia.gov.in</code></li>
        <li><code>retail.onlinesbi.sbi</code></li>
        <li><code>onlinesbi.sbi</code></li>
        <li>(additional Indian bank netbanking domains as supported in future releases)</li>
      </ul>
      <p>On these pages the extension extracts:</p>
      <ul>
        <li>Transaction date, amount, and description from passbook / statement tables</li>
        <li>Account identifier (last 4 digits only)</li>
      </ul>
      <h2>What we do NOT collect</h2>
      <ul>
        <li>Browsing history outside the listed hostnames</li>
        <li>Login credentials (the extension never reads password fields)</li>
        <li>One-time passwords (OTPs)</li>
        <li>Any content on any non-financial-portal page</li>
      </ul>
      <h2>Where data goes</h2>
      <p>Extracted financial data is sent over HTTPS to your paired EveryPaisa account on the Railway-hosted EveryPaisa API. It is stored encrypted at rest. Only your account can read it. We do not share data with third parties. We do not sell data.</p>
      <h2>Authentication</h2>
      <p>The extension authenticates using a bearer token issued during the one-time pairing flow with your EveryPaisa web account. Bearers are stored in <code>chrome.storage.local</code>, encrypted by the browser profile. You can revoke a paired extension at any time from the extension popup or your EveryPaisa web account settings.</p>
      <h2>Permissions explained</h2>
      <ul>
        <li><code>storage</code> — to remember your pairing token across browser restarts.</li>
        <li><code>host_permissions</code> — limited to the financial portal domains listed above. The extension cannot access any other site.</li>
      </ul>
      <h2>Data retention</h2>
      <p>You can delete your EveryPaisa account at any time from the web app. Account deletion permanently removes all extension-sourced data within 30 days.</p>
      <h2>Contact</h2>
      <p>
        Questions? Email <a href="mailto:admin.everypaisa@gmail.com" className="underline underline-offset-2">admin.everypaisa@gmail.com</a>.
      </p>
      <h2>Changes</h2>
      <p>We will update this policy as needed. The "Effective" date at the top reflects the current version.</p>
    </div>
  );
}
