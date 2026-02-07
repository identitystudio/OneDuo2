import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, MessageCircle, Mail, BookOpen, Upload, LayoutDashboard, HelpCircle } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { FAQSection, allFAQs } from '@/components/FAQSection';
import { Button } from '@/components/ui/button';

export default function HelpCenter() {
  return (
    <div className="min-h-screen bg-[#030303] text-white">
      {/* Ambient Background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-[-20%] left-1/4 w-[600px] h-[600px] rounded-full bg-gradient-to-br from-cyan-500/10 via-cyan-500/5 to-transparent blur-3xl" />
        <div className="absolute top-[40%] right-1/4 w-[500px] h-[500px] rounded-full bg-gradient-to-bl from-emerald-500/10 to-transparent blur-3xl" />
      </div>

      {/* Header */}
      <header className="sticky top-0 z-50 bg-black/60 backdrop-blur-md border-b border-white/[0.06]">
        <div className="max-w-[1200px] mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link to="/">
              <Logo size="sm" />
            </Link>
            <span className="text-white/30">|</span>
            <span className="text-white/70 font-medium">Help Center</span>
          </div>
          <div className="flex items-center gap-4">
            <Link to="/dashboard">
              <Button variant="ghost" size="sm" className="text-white/60 hover:text-white">
                Dashboard
              </Button>
            </Link>
            <Link to="/upload">
              <Button size="sm" className="bg-emerald-500 hover:bg-emerald-400 text-black">
                Upload
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="relative z-10">
        {/* Hero */}
        <section className="py-16 sm:py-24 px-4 sm:px-6 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-cyan-500/10 border border-cyan-500/20 mb-6">
              <HelpCircle className="w-4 h-4 text-cyan-400" />
              <span className="text-sm font-medium text-cyan-400">Help Center</span>
            </div>
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-4">
              How can we help?
            </h1>
            <p className="text-white/60 max-w-xl mx-auto text-lg">
              Find answers to common questions or get in touch with our team.
            </p>
          </motion.div>
        </section>

        {/* Quick Links */}
        <section className="px-4 sm:px-6 pb-16">
          <div className="max-w-[900px] mx-auto">
            <div className="grid sm:grid-cols-3 gap-4 mb-16">
              {[
                {
                  icon: Upload,
                  title: "Upload Guide",
                  description: "Learn how to upload your first video",
                  link: "/upload",
                  color: "from-emerald-500/20 to-emerald-500/5 border-emerald-500/20 hover:border-emerald-500/40"
                },
                {
                  icon: LayoutDashboard,
                  title: "Dashboard",
                  description: "Track your processing and downloads",
                  link: "/dashboard",
                  color: "from-cyan-500/20 to-cyan-500/5 border-cyan-500/20 hover:border-cyan-500/40"
                },
                {
                  icon: MessageCircle,
                  title: "Chat with Nedu",
                  description: "Get instant help from our AI assistant",
                  link: "/dashboard",
                  color: "from-purple-500/20 to-purple-500/5 border-purple-500/20 hover:border-purple-500/40"
                },
              ].map((item, i) => (
                <Link
                  key={i}
                  to={item.link}
                  className={`p-6 rounded-2xl bg-gradient-to-br ${item.color} border transition-all hover:scale-[1.02] group`}
                >
                  <item.icon className="w-8 h-8 text-white/80 mb-4 group-hover:text-white transition-colors" />
                  <h3 className="font-semibold text-white mb-1">{item.title}</h3>
                  <p className="text-sm text-white/60">{item.description}</p>
                </Link>
              ))}
            </div>

            {/* FAQ Section with Search and Categories */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
            >
              <h2 className="text-2xl font-bold text-white mb-8 text-center">
                Frequently Asked Questions
              </h2>
              <FAQSection 
                faqs={allFAQs}
                variant="full"
                showSearch
                showCategories
              />
            </motion.div>
          </div>
        </section>

        {/* Contact Section */}
        <section className="py-16 px-4 sm:px-6 bg-white/[0.02] border-t border-white/[0.06]">
          <div className="max-w-[600px] mx-auto text-center">
            <h2 className="text-2xl font-bold text-white mb-4">
              Still need help?
            </h2>
            <p className="text-white/60 mb-8">
              Our team is here to help you get the most out of OneDuo.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <a
                href="mailto:support@oneduo.ai"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-white/5 border border-white/10 text-white hover:bg-white/10 transition-colors"
              >
                <Mail className="w-5 h-5" />
                support@oneduo.ai
              </a>
              <Link
                to="/dashboard"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-cyan-500 text-black font-medium hover:bg-cyan-400 transition-colors"
              >
                <MessageCircle className="w-5 h-5" />
                Chat with Nedu
              </Link>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="py-8 px-4 sm:px-6 border-t border-white/[0.06]">
          <div className="max-w-[1200px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Logo size="sm" />
              <span className="text-white/40 text-sm">© 2025 OneDuo.ai</span>
            </div>
            <div className="flex items-center gap-6 text-sm">
              <Link to="/" className="text-white/40 hover:text-white transition-colors">
                Home
              </Link>
              <Link to="/pricing" className="text-white/40 hover:text-white transition-colors">
                Pricing
              </Link>
              <Link to="/terms" className="text-white/40 hover:text-white transition-colors">
                Terms
              </Link>
              <Link to="/privacy" className="text-white/40 hover:text-white transition-colors">
                Privacy
              </Link>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}
