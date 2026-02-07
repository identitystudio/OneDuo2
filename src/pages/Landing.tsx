import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowRight, Menu, Wand2, FileText } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import { Logo } from '@/components/Logo';
import { VSLDemoModal } from '@/components/VSLDemoModal';
import { useUTMTracking } from '@/hooks/useUTMTracking';
import { FAQSection, landingFAQs } from '@/components/FAQSection';

export default function Landing() {
  const navigate = useNavigate();
  const [showDemoModal, setShowDemoModal] = useState(false);
  const [showDashboardLogin, setShowDashboardLogin] = useState(false);
  
  useUTMTracking();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <VSLDemoModal open={showDemoModal} onOpenChange={setShowDemoModal} />

      {/* Dashboard Login Dialog */}
      <Dialog open={showDashboardLogin} onOpenChange={setShowDashboardLogin}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle>Access Your Artifacts</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Sign in to view your artifacts securely
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <p className="text-sm text-muted-foreground">
              Your artifacts are linked to your account. Sign in with the email you used to create them.
            </p>
            <Button 
              onClick={() => {
                setShowDashboardLogin(false);
                navigate('/auth');
              }} 
              className="w-full"
            >
              Sign In to View Artifacts
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="max-w-[1400px] mx-auto px-6 lg:px-10 py-4">
          <div className="flex items-center justify-between">
            <button 
              onClick={() => window.scrollTo({ top: 0, behavior: 'instant' })}
              className="flex items-center cursor-pointer"
            >
              <Logo size="md" />
            </button>
            
            <div className="flex items-center gap-4">
              <button 
                onClick={() => setShowDashboardLogin(true)}
                className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                My Artifacts
              </button>
              
              <Link 
                to="/auth"
                className="hidden sm:inline-flex items-center gap-2 px-5 py-2.5 bg-[hsl(151,100%,50%)] hover:bg-[hsl(151,100%,40%)] text-background font-bold rounded-lg transition-all hover:shadow-[0_10px_30px_rgba(0,255,136,0.3)] hover:-translate-y-0.5"
              >
                Get Started
                <ArrowRight className="w-4 h-4" />
              </Link>
              
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="p-2 rounded-lg hover:bg-muted transition-colors">
                    <Menu className="w-5 h-5 text-muted-foreground" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48 bg-card border-border z-[100]">
                  <DropdownMenuItem asChild>
                    <Link to="/transform" className="flex items-center gap-2 cursor-pointer">
                      <Wand2 className="w-4 h-4" />
                      Transform Engine
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/artifacts" className="flex items-center gap-2 cursor-pointer">
                      <FileText className="w-4 h-4" />
                      My Artifacts
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/founders-notes" className="flex items-center gap-2 cursor-pointer">
                      Founder's Notes
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/press" className="flex items-center gap-2 cursor-pointer">
                      Press
                    </Link>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </header>

      {/* HERO SECTION - Simplified per beta feedback */}
      <section className="min-h-[80vh] flex items-center relative overflow-hidden pt-20">
        {/* Subtle background glow */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-[hsl(151,100%,50%)]/8 rounded-full blur-[150px]" />
        </div>
        
        <div className="max-w-[1000px] mx-auto px-6 lg:px-10 relative z-10 text-center">
          {/* Headline - Simplified */}
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-[clamp(36px,6vw,64px)] font-serif font-normal leading-[1.15] mb-6"
          >
            Upload a video.
            <br />
            Get an <span className="text-[hsl(151,100%,50%)]">execution guide</span>.
          </motion.h1>

          {/* Subhead - One line */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-xl text-muted-foreground mb-10"
          >
            Turn courses, trainings, and meetings into actionable steps.
          </motion.p>

          {/* CTA - Bigger, clearer */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <Link 
              to="/auth"
              className="inline-block px-10 py-4 bg-[hsl(151,100%,50%)] text-background font-bold text-lg rounded-lg transition-all hover:bg-[hsl(151,100%,40%)] hover:-translate-y-0.5 hover:shadow-[0_10px_30px_rgba(0,255,136,0.3)]"
            >
              Get Started Free
            </Link>
          </motion.div>
        </div>
      </section>

      {/* HOW IT WORKS - Simplified to 3 steps */}
      <section className="py-20 bg-muted/30">
        <div className="max-w-[900px] mx-auto px-6 lg:px-10">
          <motion.h2 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-3xl font-serif text-center mb-12"
          >
            How it works
          </motion.h2>
          
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { num: "1", title: "Upload", desc: "Drop your video" },
              { num: "2", title: "Process", desc: "AI extracts the steps" },
              { num: "3", title: "Execute", desc: "Download your guide" },
            ].map((step, i) => (
              <motion.div
                key={step.num}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="text-center"
              >
                <div className="w-12 h-12 rounded-full bg-[hsl(151,100%,50%)]/10 text-[hsl(151,100%,50%)] font-bold text-xl flex items-center justify-center mx-auto mb-4">
                  {step.num}
                </div>
                <h3 className="text-lg font-semibold mb-2">{step.title}</h3>
                <p className="text-muted-foreground text-sm">{step.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* USE CASES - Simple chips */}
      <section className="py-16">
        <div className="max-w-[800px] mx-auto px-6 text-center">
          <motion.p 
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="text-muted-foreground mb-6"
          >
            Perfect for
          </motion.p>
          <div className="flex flex-wrap justify-center gap-3">
            {["Courses", "Training Videos", "Zoom Calls", "Webinars", "Tutorials"].map((item, i) => (
              <motion.span
                key={item}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.05 }}
                className="px-4 py-2 bg-muted/50 rounded-full text-sm text-foreground"
              >
                {item}
              </motion.span>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ - Minimal */}
      <section className="py-16 bg-muted/30">
        <div className="max-w-[700px] mx-auto px-6">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-2xl font-serif text-center mb-8"
          >
            Questions
          </motion.h2>
          <FAQSection faqs={landingFAQs} />
        </div>
      </section>

      {/* FINAL CTA - Simplified */}
      <section className="py-24 text-center">
        <div className="max-w-[600px] mx-auto px-6">
          <motion.h2 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-3xl font-serif mb-6"
          >
            Ready to get started?
          </motion.h2>
          
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
          >
            <Link 
              to="/auth"
              className="inline-block px-10 py-4 bg-[hsl(151,100%,50%)] text-background font-bold text-lg rounded-lg transition-all hover:bg-[hsl(151,100%,40%)] hover:-translate-y-0.5 hover:shadow-[0_10px_30px_rgba(0,255,136,0.3)]"
            >
              Get Started Free
            </Link>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t border-border">
        <div className="max-w-[1400px] mx-auto px-6 lg:px-10">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <Logo size="sm" />
            <div className="flex items-center gap-6 text-sm text-muted-foreground">
              <Link to="/terms" className="hover:text-foreground transition-colors">Terms</Link>
              <Link to="/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
              <Link to="/help" className="hover:text-foreground transition-colors">Help</Link>
            </div>
            <p className="text-sm text-muted-foreground">© 2025 OneDuo. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
