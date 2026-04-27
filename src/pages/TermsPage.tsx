import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export default function TermsPage() {
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
        <h1 className="text-3xl font-bold mb-2">Terms of Service</h1>
        <p className="text-muted-foreground mb-8">Last updated: January 25, 2026</p>

        <div className="prose prose-neutral dark:prose-invert max-w-none space-y-6">
          <section>
            <h2 className="text-xl font-semibold mb-3">1. Acceptance of Terms</h2>
            <p className="text-muted-foreground leading-relaxed">
              By accessing and using Dealzflow ("the Service"), you agree to be bound by these Terms of Service ("Terms"). 
              If you do not agree to these Terms, please do not use the Service. These Terms constitute a legally binding agreement 
              between you and Dealzflow.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">2. Description of Service</h2>
            <p className="text-muted-foreground leading-relaxed">
              Dealzflow is a financial tracking and forecasting tool designed for real estate professionals. 
              The Service allows users to track deals, commissions, expenses, and generate financial projections. The Service 
              includes both free ("Starter") and paid ("Pro") subscription tiers with different feature sets.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">3. User Accounts</h2>
            <p className="text-muted-foreground leading-relaxed">
              To access the Service, you must create an account with accurate and complete information. You are responsible for:
            </p>
            <ul className="list-disc list-inside text-muted-foreground mt-2 space-y-1">
              <li>Maintaining the confidentiality of your account credentials</li>
              <li>All activities that occur under your account</li>
              <li>Notifying us immediately of any unauthorized use</li>
              <li>Ensuring your contact information remains current</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">4. Subscription and Billing</h2>
            <p className="text-muted-foreground leading-relaxed">
              The Pro subscription is billed monthly at $29 CAD. By subscribing, you authorize us to charge your payment method 
              on a recurring basis. You may cancel at any time, and your subscription will remain active until the end of the 
              current billing period. We offer a 14-day free trial for new Pro subscribers.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">5. User Data and Ownership</h2>
            <p className="text-muted-foreground leading-relaxed">
              You retain full ownership of all data you enter into the Service, including deal information, financial records, 
              and personal data. We will not share, sell, or distribute your personal or financial data to third parties except 
              as required by law or as described in our Privacy Policy. You may export your data at any time.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">6. Acceptable Use</h2>
            <p className="text-muted-foreground leading-relaxed">
              You agree to use the Service only for lawful purposes and in accordance with these Terms. You agree not to:
            </p>
            <ul className="list-disc list-inside text-muted-foreground mt-2 space-y-1">
              <li>Use the Service for any illegal or unauthorized purpose</li>
              <li>Attempt to gain unauthorized access to the Service or its systems</li>
              <li>Interfere with or disrupt the Service or servers</li>
              <li>Upload malicious code, viruses, or harmful content</li>
              <li>Share your account credentials with third parties</li>
              <li>Use automated systems to access the Service without permission</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">7. Financial Disclaimer</h2>
            <p className="text-muted-foreground leading-relaxed">
              <strong>Important:</strong> The Service provides financial tracking and projection tools for informational purposes only. 
              We do not provide tax, legal, or financial advice. Tax calculations are estimates based on publicly available tax brackets 
              and may not reflect your specific situation. You should consult with qualified tax professionals, accountants, or financial 
              advisors for personalized advice. We are not responsible for any financial decisions made based on information provided by the Service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">8. Disclaimer of Warranties</h2>
            <p className="text-muted-foreground leading-relaxed">
              The Service is provided "as is" and "as available" without warranties of any kind, either express or implied, 
              including but not limited to warranties of merchantability, fitness for a particular purpose, and non-infringement. 
              We do not guarantee the accuracy, completeness, or timeliness of any information provided through the Service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">9. Limitation of Liability</h2>
            <p className="text-muted-foreground leading-relaxed">
              To the maximum extent permitted by applicable law, Dealzflow and its officers, directors, employees, and agents 
              shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including without limitation, 
              loss of profits, data, use, goodwill, or other intangible losses, resulting from your use of the Service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">10. Modifications to Terms</h2>
            <p className="text-muted-foreground leading-relaxed">
              We reserve the right to modify these Terms at any time. We will notify users of material changes via email or through 
              the Service at least 30 days before the changes take effect. Your continued use of the Service after such modifications 
              constitutes your acceptance of the updated Terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">11. Termination</h2>
            <p className="text-muted-foreground leading-relaxed">
              We may terminate or suspend your account immediately, without prior notice or liability, for any reason, including 
              without limitation if you breach these Terms. Upon termination, your right to use the Service will immediately cease. 
              You may delete your account at any time through the Settings page.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">12. Governing Law</h2>
            <p className="text-muted-foreground leading-relaxed">
              These Terms shall be governed by and construed in accordance with the laws of the Province of British Columbia, Canada, 
              without regard to its conflict of law provisions. Any disputes arising from these Terms shall be resolved in the courts 
              of British Columbia.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">13. Contact Information</h2>
            <p className="text-muted-foreground leading-relaxed">
              If you have any questions about these Terms, please contact us at:<br />
              <strong>Email:</strong> legal@dealzflow.ca<br />
              <strong>Support:</strong> support@dealzflow.ca
            </p>
          </section>
        </div>

        <div className="mt-12 pt-8 border-t border-border">
          <div className="flex flex-col sm:flex-row gap-4 justify-between items-center">
            <Link to="/privacy" className="text-primary hover:underline text-sm">
              Read our Privacy Policy →
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