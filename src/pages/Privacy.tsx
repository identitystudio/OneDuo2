import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Logo } from '@/components/Logo';

export default function Privacy() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="container mx-auto px-4 py-8 max-w-3xl">
        {/* Header */}
        <div className="flex items-center gap-4 mb-12">
          <Link to="/" className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Back
          </Link>
          <Logo size="md" />
        </div>

        <div className="prose prose-invert max-w-none">
          {/* Title Block */}
          <div className="mb-12">
            <h1 className="text-2xl sm:text-3xl font-semibold text-foreground mb-2">
              Privacy Policy
            </h1>
            <p className="text-sm text-muted-foreground">
              Last updated December 23, 2024
            </p>
          </div>

          {/* Section 1 */}
          <section className="mb-10">
            <h2 className="text-lg font-medium text-foreground mb-3">1. Information We Collect</h2>
            
            <p className="text-muted-foreground mb-3 text-sm font-medium">Information you provide:</p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1 mb-4 text-sm">
              <li>Email address for account access</li>
              <li>Video files you upload for processing</li>
              <li>Payment information (processed by third-party providers)</li>
            </ul>

            <p className="text-muted-foreground mb-3 text-sm font-medium">Automatically collected:</p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1 text-sm">
              <li>Usage data and interaction patterns</li>
              <li>Browser type, operating system, device identifiers</li>
              <li>IP address, access times, pages viewed</li>
            </ul>
          </section>

          {/* Section 2 */}
          <section className="mb-10">
            <h2 className="text-lg font-medium text-foreground mb-3">2. How We Use Your Information</h2>
            <ul className="list-disc list-inside text-muted-foreground space-y-1 text-sm">
              <li>Provide, maintain, and improve the Service</li>
              <li>Process your uploaded content</li>
              <li>Send service-related communications</li>
              <li>Monitor and analyze usage patterns</li>
              <li>Detect and address technical issues</li>
            </ul>
          </section>

          {/* Section 3 */}
          <section className="mb-10">
            <h2 className="text-lg font-medium text-foreground mb-3">3. Your Content</h2>
            <p className="text-muted-foreground mb-3 text-sm leading-relaxed">
              You retain ownership of your content. We process it solely to provide the Service. 
              We do not sell, share, or use your content for AI training.
            </p>
            <p className="text-muted-foreground text-sm leading-relaxed">
              You may delete your content at any time. Upon account deletion, we remove your data 
              within 30 days, except as required by law.
            </p>
          </section>

          {/* Section 4 - Zero Knowledge */}
          <section className="mb-10">
            <h2 className="text-lg font-medium text-foreground mb-3">4. Zero-Knowledge Processing</h2>
            <p className="text-muted-foreground mb-4 text-sm leading-relaxed">
              OneDuo operates as a transformation engine. Original source videos are permanently 
              destroyed immediately after your OneDuo is created. We cannot view, reproduce, or 
              share source material because we do not possess it.
            </p>
            
            <p className="text-muted-foreground mb-2 text-sm font-medium">What we retain:</p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1 mb-4 text-sm">
              <li>Extracted frames (derivative work)</li>
              <li>OCR text (transformation)</li>
              <li>PDF artifacts (new work)</li>
              <li>Audit logs confirming source purge</li>
            </ul>

            <p className="text-muted-foreground mb-2 text-sm font-medium">What we do not retain:</p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1 text-sm">
              <li>Original video files</li>
              <li>Source URLs</li>
              <li>Raw video content in any form</li>
            </ul>
          </section>

          {/* Section 5 */}
          <section className="mb-10">
            <h2 className="text-lg font-medium text-foreground mb-3">5. Data Sharing</h2>
            <p className="text-muted-foreground mb-3 text-sm leading-relaxed">
              We do not sell your personal information. We may share data with:
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1 text-sm">
              <li>Service providers (cloud hosting, payment processing, analytics)</li>
              <li>Legal authorities when required by law</li>
              <li>In connection with business transfers</li>
            </ul>
          </section>

          {/* Section 6 */}
          <section className="mb-10">
            <h2 className="text-lg font-medium text-foreground mb-3">6. Security</h2>
            <ul className="list-disc list-inside text-muted-foreground space-y-1 text-sm">
              <li>Data encrypted in transit (TLS) and at rest (AES-256)</li>
              <li>Infrastructure hosted on SOC 2 compliant providers</li>
              <li>Role-based access with audit logging</li>
              <li>24/7 security monitoring</li>
            </ul>
          </section>

          {/* Section 7 */}
          <section className="mb-10">
            <h2 className="text-lg font-medium text-foreground mb-3">7. Your Rights</h2>
            <p className="text-muted-foreground mb-3 text-sm leading-relaxed">
              Depending on your location, you may have rights to access, correct, delete, or port your data.
            </p>
            <p className="text-muted-foreground text-sm">
              Contact us at <span className="text-foreground">privacy@oneduo.ai</span>
            </p>
          </section>

          {/* Section 8 */}
          <section className="mb-10">
            <h2 className="text-lg font-medium text-foreground mb-3">8. Cookies</h2>
            <p className="text-muted-foreground text-sm leading-relaxed">
              We use essential cookies for functionality and analytics cookies to understand usage. 
              You can control cookies through your browser settings.
            </p>
          </section>

          {/* Section 9 */}
          <section className="mb-10">
            <h2 className="text-lg font-medium text-foreground mb-3">9. International Transfers</h2>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Your data may be transferred to and processed in the United States. 
              We implement appropriate safeguards for international transfers.
            </p>
          </section>

          {/* Section 10 */}
          <section className="mb-10">
            <h2 className="text-lg font-medium text-foreground mb-3">10. Children's Privacy</h2>
            <p className="text-muted-foreground text-sm leading-relaxed">
              The Service is not intended for children under 18. We do not knowingly collect 
              personal information from children.
            </p>
          </section>

          {/* Section 11 */}
          <section className="mb-10">
            <h2 className="text-lg font-medium text-foreground mb-3">11. Changes</h2>
            <p className="text-muted-foreground text-sm leading-relaxed">
              We may update this policy from time to time. We will notify you of material changes 
              by posting the new policy and updating the date.
            </p>
          </section>

          {/* Contact */}
          <section className="mb-10">
            <h2 className="text-lg font-medium text-foreground mb-3">Contact</h2>
            <p className="text-muted-foreground text-sm">
              For privacy inquiries: <span className="text-foreground">privacy@oneduo.ai</span>
            </p>
            <p className="text-muted-foreground text-sm mt-2">
              OneDuo AI, Inc. · Delaware, United States
            </p>
          </section>

          {/* Footer */}
          <footer className="text-center text-muted-foreground text-xs pt-8 mt-12 border-t border-border">
            <p>© 2025 OneDuo. All rights reserved.</p>
            <div className="flex gap-6 justify-center mt-4">
              <Link to="/terms" className="hover:text-foreground transition-colors">Terms of Service</Link>
              <Link to="/" className="hover:text-foreground transition-colors">Home</Link>
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}