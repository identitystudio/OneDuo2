import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { AIWitnessCertificates } from '@/components/AIWitnessCertificates';
import { NoIndexMeta } from '@/components/NoIndexMeta';

export default function Evidence() {
  return (
    <div className="min-h-screen bg-[#030303] text-white overflow-x-hidden">
      <NoIndexMeta />
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-black/60 backdrop-blur-md border-b border-amber-800/20">
        <div className="max-w-[1400px] mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <Link 
              to="/"
              className="flex items-center gap-2 text-white/60 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="text-sm">Back to Home</span>
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="pt-24 pb-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          
          {/* Hero */}
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 rounded-full px-4 py-2 mb-8">
              <span className="text-amber-400">💬</span>
              <span className="text-amber-400 text-sm font-medium">AI Technical Commentary</span>
            </div>
            
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-white mb-6">
              AI Observations
            </h1>
            <p className="text-white/60 text-lg max-w-3xl mx-auto">
              Technical observations from AI systems during OneDuo™ product development sessions. 
              These are illustrative commentary, not endorsements or certifications.
            </p>
          </div>

          {/* Certificates */}
          <AIWitnessCertificates showTitle={false} />

          {/* Product Summary Block */}
          <div className="mt-16 max-w-3xl mx-auto">
            <div className="bg-gradient-to-b from-amber-950/20 to-black border-2 border-amber-500/30 rounded-xl p-6 sm:p-8">
              <div className="text-center mb-6">
                <div className="inline-flex items-center gap-2 mb-4">
                  <span className="text-amber-400 text-2xl">📋</span>
                </div>
                <p className="text-xl sm:text-2xl font-bold text-amber-400">PRODUCT SUMMARY</p>
              </div>
              
              <div className="space-y-4 text-sm">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <p className="text-amber-400/70 text-xs uppercase tracking-wider mb-1">Product</p>
                    <p className="text-white">OneDuo™ Portable Memory Infrastructure</p>
                  </div>
                  <div>
                    <p className="text-amber-400/70 text-xs uppercase tracking-wider mb-1">Development Date</p>
                    <p className="text-white">December 2025</p>
                  </div>
                  <div>
                    <p className="text-amber-400/70 text-xs uppercase tracking-wider mb-1">AI Systems Reviewed</p>
                    <p className="text-white">ChatGPT, Claude, Grok</p>
                  </div>
                  <div>
                    <p className="text-amber-400/70 text-xs uppercase tracking-wider mb-1">Founder</p>
                    <p className="text-white">Christina Cabral</p>
                  </div>
                </div>
                
                <div className="border-t border-amber-500/20 pt-4 mt-4">
                  <p className="text-amber-400/70 text-xs uppercase tracking-wider mb-2">Product Description</p>
                  <p className="text-white/80">
                    OneDuo™ creates portable, structured artifacts from video content designed to help 
                    AI systems and teams execute workflows with greater precision. The artifacts use 
                    standard formats (PDF, JSON) for cross-platform compatibility.
                  </p>
                </div>
                
                <div className="border-t border-amber-500/20 pt-4 mt-4">
                  <p className="text-amber-400/50 text-xs leading-relaxed">
                    <strong>Note:</strong> The AI observations on this page are illustrative commentary from development sessions. 
                    They are not endorsements, certifications, or official statements from any AI company.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* CTA */}
          <div className="mt-16 text-center">
            <Link
              to="/case-study"
              className="inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-amber-500 to-amber-600 text-black font-bold rounded-lg hover:opacity-90 transition-opacity"
            >
              Read Full Case Study
              <ArrowLeft className="w-4 h-4 rotate-180" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
