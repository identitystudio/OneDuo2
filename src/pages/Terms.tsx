import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Logo } from '@/components/Logo';

export default function Terms() {
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
              Terms of Service
            </h1>
            <p className="text-sm text-muted-foreground">
              Effective December 27, 2025 · Wyoming, USA
            </p>
          </div>

          {/* Section 1 */}
          <section className="mb-10">
            <h2 className="text-lg font-medium text-foreground mb-3">1. Intellectual Property</h2>
            <p className="text-muted-foreground mb-4 text-sm leading-relaxed">
              OneDuo owns all rights to its proprietary systems, including the AI Thinking Layer architecture, 
              High-Density Extraction, and AI-Context Bridging frameworks.
            </p>
          </section>

          {/* Section 2 */}
          <section className="mb-10">
            <h2 className="text-lg font-medium text-foreground mb-3">2. Prohibited Uses</h2>
            <p className="text-muted-foreground mb-3 text-sm leading-relaxed">
              You may not reverse engineer, decompile, or attempt to derive OneDuo systems or logic. 
              You may not use OneDuo outputs to design or improve competing products.
            </p>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Accounts attempting to scrape or automate reverse-engineering may be suspended.
            </p>
          </section>

          {/* Section 3 */}
          <section className="mb-10">
            <h2 className="text-lg font-medium text-foreground mb-3">3. Competitor Access</h2>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Direct competitors are not permitted to access OneDuo for research or benchmarking purposes.
            </p>
          </section>

          {/* Section 4 */}
          <section className="mb-10">
            <h2 className="text-lg font-medium text-foreground mb-3">4. Your Content</h2>
            <p className="text-muted-foreground mb-3 text-sm leading-relaxed">
              OneDuo treats your inputs as structured instruction, not disposable content. 
              Your materials are not used to train public AI models. Ownership remains yours.
            </p>
          </section>

          {/* Section 5 */}
          <section className="mb-10">
            <h2 className="text-lg font-medium text-foreground mb-3">5. Respect for Creators</h2>
            <ul className="list-disc list-inside text-muted-foreground space-y-1 text-sm leading-relaxed">
              <li>OneDuo does not host, stream, download, or distribute third-party content</li>
              <li>Processing occurs only on content you already have lawful access to</li>
              <li>OneDuo Artifacts are transformative derivatives for execution guidance</li>
            </ul>
          </section>

          {/* Section 6 */}
          <section className="mb-10">
            <h2 className="text-lg font-medium text-foreground mb-3">6. DRM & Protected Content</h2>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Users are prohibited from bypassing DRM or protected streaming systems. 
              OneDuo does not provide tools to download content from any platform. 
              Use of third-party ripping tools is solely your responsibility.
            </p>
          </section>

          {/* Section 7 - Zero Knowledge */}
          <section className="mb-10">
            <h2 className="text-lg font-medium text-foreground mb-3">7. Privacy & Zero-Knowledge Processing</h2>
            <p className="text-muted-foreground mb-4 text-sm leading-relaxed">
              OneDuo operates as a transformation engine, not a content host. Original videos are 
              permanently destroyed immediately after your OneDuo is created. We cannot view, reproduce, 
              or share source material because we do not possess it.
            </p>
            <p className="text-muted-foreground mb-2 text-sm font-medium">What we retain:</p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1 mb-4 text-sm">
              <li>Extracted frames (derivative work)</li>
              <li>OCR text (transformation)</li>
              <li>PDF artifacts (new work)</li>
            </ul>
            <p className="text-muted-foreground mb-2 text-sm font-medium">What we do not retain:</p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1 text-sm">
              <li>Original video files</li>
              <li>Source URLs</li>
              <li>Raw video content in any form</li>
            </ul>
          </section>

          {/* Section 8 */}
          <section className="mb-10">
            <h2 className="text-lg font-medium text-foreground mb-3">8. User Attestation</h2>
            <p className="text-muted-foreground mb-3 text-sm leading-relaxed">
              By uploading content, you certify that you:
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1 mb-4 text-sm">
              <li>Own the content, or</li>
              <li>Are a lawful student with personal access, or</li>
              <li>Have authorization from the creator, or</li>
              <li>Are authorized by the organization that owns it</li>
            </ul>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Artifacts may not be resold or shared in piracy forums. You agree to indemnify OneDuo 
              against claims arising from improper uploads.
            </p>
          </section>

          {/* Section 9 */}
          <section className="mb-10">
            <h2 className="text-lg font-medium text-foreground mb-3">9. DMCA Compliance</h2>
            <p className="text-muted-foreground text-sm leading-relaxed">
              OneDuo complies with the Digital Millennium Copyright Act. Copyright owners may 
              contact <span className="text-foreground">legal@oneduo.ai</span> for review requests.
            </p>
          </section>

          {/* Section 10 */}
          <section className="mb-10">
            <h2 className="text-lg font-medium text-foreground mb-3">10. Human Sovereignty</h2>
            <p className="text-muted-foreground text-sm leading-relaxed">
              OneDuo is built on a core principle: humans remain the architects, AI remains the tool. 
              No AI subsystem may independently modify OneDuo's architecture without explicit human approval.
            </p>
          </section>

          {/* Section 11 */}
          <section className="mb-10">
            <h2 className="text-lg font-medium text-foreground mb-3">11. Termination & Updates</h2>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Violation of these terms may result in account termination. Terms may be updated 
              periodically; continued use constitutes acceptance.
            </p>
          </section>

          {/* Footer */}
          <footer className="text-center text-muted-foreground text-xs pt-8 mt-12 border-t border-border">
            <p>© 2025 OneDuo. All rights reserved.</p>
            <div className="flex gap-6 justify-center mt-4">
              <Link to="/privacy" className="hover:text-foreground transition-colors">Privacy Policy</Link>
              <Link to="/" className="hover:text-foreground transition-colors">Home</Link>
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}