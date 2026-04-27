import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export default function PrivacyPage() {
  return (
    <div className="min-h-dvh bg-background">
      {/* Header */}
      <header className="border-b border-border sticky top-0 bg-background/95 backdrop-blur-sm z-50">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3">
            <img 
              src="/favicon.png" 
              alt="Dealzflow" 
              className="w-10 h-10 rounded-xl shadow-lg shadow-primary/25"
            />
            <span className="font-semibold">Dealzflow</span>
          </Link>
          <Link 
            to="/" 
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Home
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold mb-2">Privacy Policy</h1>
        <p className="text-muted-foreground mb-8">Last updated: January 25, 2026</p>

        <div className="prose prose-neutral dark:prose-invert max-w-none space-y-6">
          <section>
            <p className="text-muted-foreground leading-relaxed">
              Dealzflow ("we", "our", or "us") is committed to protecting your privacy. This Privacy Policy explains 
              how we collect, use, disclose, and safeguard your information when you use our service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">1. Information We Collect</h2>
            <p className="text-muted-foreground leading-relaxed">
              We collect information you provide directly to us, including:
            </p>
            <ul className="list-disc list-inside text-muted-foreground mt-2 space-y-1">
              <li><strong>Account information:</strong> Email address, name, and authentication credentials</li>
              <li><strong>Financial data:</strong> Deal information, commission amounts, expense records, and income projections</li>
              <li><strong>Settings and preferences:</strong> Tax settings, province selection, and notification preferences</li>
              <li><strong>Usage data:</strong> How you interact with the Service, features used, and session information</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">2. How We Use Your Information</h2>
            <p className="text-muted-foreground leading-relaxed">
              We use the information we collect to:
            </p>
            <ul className="list-disc list-inside text-muted-foreground mt-2 space-y-1">
              <li>Provide, maintain, and improve the Service</li>
              <li>Generate financial projections, analytics, and tax estimates</li>
              <li>Process payments and manage your subscription</li>
              <li>Send you important updates, security alerts, and support messages</li>
              <li>Respond to your requests and provide customer support</li>
              <li>Analyze usage patterns to improve our features</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">3. Data Storage and Security</h2>
            <p className="text-muted-foreground leading-relaxed">
              Your data is stored securely using industry-standard encryption and security practices. Our infrastructure 
              provides enterprise-grade security including:
            </p>
            <ul className="list-disc list-inside text-muted-foreground mt-2 space-y-1">
              <li>AES-256 encryption at rest and TLS 1.3 encryption in transit</li>
              <li>Row-level security policies ensuring data isolation between users</li>
              <li>Regular security audits and penetration testing</li>
              <li>Automatic daily backups with point-in-time recovery</li>
              <li>SOC 2 Type II compliant infrastructure</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">4. Administrator Access & Audit Logging</h2>
            <p className="text-muted-foreground leading-relaxed">
              Platform administrators may access your account data for purposes of providing customer support, 
              investigating security incidents, resolving billing disputes, or enforcing our Terms of Service. 
              All such access is subject to strict internal controls:
            </p>
            <ul className="list-disc list-inside text-muted-foreground mt-2 space-y-1">
              <li><strong>Every administrative action is automatically recorded</strong> in an immutable audit trail, including which admin accessed the data, what action was taken, the timestamp, and the originating IP address.</li>
              <li>Administrator access is limited to personnel with a business need to know.</li>
              <li>Audit logs are retained for a minimum of 12 months and cannot be modified or deleted by administrators.</li>
              <li>You may request a summary of administrative access to your account by contacting privacy@dealzflow.ca.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">5. Data Sharing and Disclosure</h2>
            <p className="text-muted-foreground leading-relaxed">
              We do not sell, trade, or rent your personal information to third parties. We may share information only in the following circumstances:
            </p>
            <ul className="list-disc list-inside text-muted-foreground mt-2 space-y-1">
              <li><strong>With your consent:</strong> When you explicitly authorize us to share data</li>
              <li><strong>Service providers:</strong> With trusted partners who assist in operating the Service (payment processors, hosting providers) under strict confidentiality agreements</li>
              <li><strong>Legal requirements:</strong> When required by law, court order, or government request</li>
              <li><strong>Protection of rights:</strong> To protect our rights, privacy, safety, or property</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">6. Your Rights and Choices</h2>
            <p className="text-muted-foreground leading-relaxed">
              You have the following rights regarding your personal data:
            </p>
            <ul className="list-disc list-inside text-muted-foreground mt-2 space-y-1">
              <li><strong>Access:</strong> Request a copy of your personal data</li>
              <li><strong>Export:</strong> Download your data in a portable format at any time via Settings</li>
              <li><strong>Correction:</strong> Update or correct inaccurate information</li>
              <li><strong>Deletion:</strong> Delete your account and all associated data</li>
              <li><strong>Opt-out:</strong> Unsubscribe from non-essential communications</li>
              <li><strong>Portability:</strong> Receive your data in a structured, machine-readable format</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">6. Data Retention</h2>
            <p className="text-muted-foreground leading-relaxed">
              We retain your data for as long as your account is active or as needed to provide the Service. If you delete 
              your account, we will delete all your personal data within 30 days, except where retention is required by law 
              (such as for tax or legal compliance purposes) or to resolve disputes.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">7. Cookies and Analytics</h2>
            <p className="text-muted-foreground leading-relaxed">
              We use essential cookies to maintain your session and authentication state. We may use anonymous, aggregated 
              analytics to understand how the Service is used and to improve our features. No personally identifiable 
              information is shared with third-party analytics providers. You can control cookie settings through your browser.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">8. Third-Party Services</h2>
            <p className="text-muted-foreground leading-relaxed">
              We integrate with the following third-party services:
            </p>
            <ul className="list-disc list-inside text-muted-foreground mt-2 space-y-1">
              <li><strong>Stripe:</strong> For payment processing (subject to Stripe's Privacy Policy)</li>
              <li><strong>Google:</strong> For optional Google Sign-In authentication</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mt-2">
              These services have their own privacy policies, and we encourage you to review them.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">9. Children's Privacy</h2>
            <p className="text-muted-foreground leading-relaxed">
              The Service is not intended for users under 18 years of age. We do not knowingly collect personal information 
              from children under 18. If we learn we have collected information from a child under 18, we will delete that 
              information promptly.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">10. International Data Transfers</h2>
            <p className="text-muted-foreground leading-relaxed">
              Your data is primarily stored and processed in Canada. If we transfer data internationally, we ensure 
              appropriate safeguards are in place to protect your information in accordance with applicable privacy laws.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">11. Changes to This Policy</h2>
            <p className="text-muted-foreground leading-relaxed">
              We may update this Privacy Policy from time to time. We will notify you of any material changes by posting 
              the new policy on this page, updating the "Last updated" date, and sending an email notification for significant changes. 
              We encourage you to review this policy periodically.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">12. Contact Us</h2>
            <p className="text-muted-foreground leading-relaxed">
              If you have any questions about this Privacy Policy or our data practices, please contact us at:<br />
              <strong>Email:</strong> privacy@dealzflow.ca<br />
              <strong>Support:</strong> support@dealzflow.ca<br /><br />
              For data protection inquiries, we aim to respond within 48 hours.
            </p>
          </section>
        </div>

        <div className="mt-12 pt-8 border-t border-border">
          <div className="flex flex-col sm:flex-row gap-4 justify-between items-center">
            <Link to="/terms" className="text-primary hover:underline text-sm">
              Read our Terms of Service →
            </Link>
            <Link to="/auth" className="text-primary hover:underline text-sm">
              Create an account →
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}