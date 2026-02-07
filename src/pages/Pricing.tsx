import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { CheckCircle2, Shield, CreditCard, Zap } from 'lucide-react';
import { motion } from 'framer-motion';
import { Logo } from '@/components/Logo';

export default function Pricing() {
  const navigate = useNavigate();

  const handleGetStarted = (plan: string) => {
    console.log(`Selected plan: ${plan}`);
    navigate('/upload');
  };

  const plans = [
    {
      name: "Pay Per Course",
      price: "$10",
      period: "per course",
      description: "Perfect for testing",
      features: [
        "One-time payment",
        "No subscription required",
        "Full AI training on your course",
        "Share with your VA"
      ],
      cta: "Get Started",
      featured: false
    },
    {
      name: "Starter",
      price: "$47",
      period: "per month",
      description: "For individual users",
      features: [
        "3 course uploads/month",
        "Unlimited VA access",
        "Cancel anytime",
        "Email support"
      ],
      cta: "Get Started",
      featured: false
    },
    {
      name: "Unlimited",
      price: "$97",
      period: "per month",
      description: "For growing teams",
      features: [
        "Unlimited course uploads",
        "Unlimited VA access",
        "Cancel anytime",
        "Priority support"
      ],
      cta: "Get Started",
      featured: true
    }
  ];

  return (
    <div className="min-h-screen bg-[#030303] text-white">
      {/* Background effects */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-[-20%] left-1/2 -translate-x-1/2 w-[1000px] h-[1000px] rounded-full bg-gradient-to-b from-cyan-500/15 via-cyan-500/5 to-transparent blur-3xl" />
      </div>

      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50">
        <div className="mx-4 mt-4 md:mx-8 md:mt-6">
          <div className="max-w-[1400px] mx-auto px-6 py-4 rounded-2xl bg-white/[0.03] backdrop-blur-2xl border border-white/[0.06]">
            <div className="flex items-center justify-between">
              <Logo size="md" animated />
              <Link to="/watch" className="text-sm font-medium text-white/60 hover:text-white transition-colors">
                Watch Demo
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="pt-32 pb-24 relative z-10">
        <div className="container mx-auto px-6">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-[-0.03em] mb-4">
              <span className="text-white">Choose Your </span>
              <span className="text-white/70">see</span>
              <span className="text-cyan-400 font-bold">VA</span>
              <span className="text-white/50">done</span>
              <span className="text-white"> Plan</span>
            </h1>
            <p className="text-xl text-white/50 max-w-xl mx-auto">
              Your VA stops waiting. You stop being the bottleneck. Starting today.
            </p>
          </motion.div>

          {/* Pricing Cards */}
          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {plans.map((plan, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.1, duration: 0.5 }}
                className={plan.featured ? 'md:-mt-4 md:mb-4' : ''}
              >
                <div className={`h-full relative overflow-hidden rounded-2xl transition-all duration-300 ${
                  plan.featured 
                    ? 'border-2 border-cyan-500 bg-cyan-500/5' 
                    : 'border border-white/[0.08] bg-white/[0.02]'
                }`}>
                  {plan.featured && (
                    <div className="absolute top-0 left-0 right-0 bg-gradient-to-r from-cyan-500 to-cyan-400 text-black text-center py-2 text-xs font-semibold uppercase tracking-wider">
                      Most Popular
                    </div>
                  )}
                  
                  <div className={`p-8 ${plan.featured ? 'pt-14' : ''}`}>
                    <div className="mb-6">
                      <h3 className="text-xl font-semibold text-white mb-1">{plan.name}</h3>
                      <p className="text-sm text-white/50">{plan.description}</p>
                    </div>
                    
                    <div className="mb-8">
                      <span className="text-5xl font-bold tracking-tight text-white">{plan.price}</span>
                      <span className="text-white/50 ml-1">/{plan.period}</span>
                    </div>
                    
                    <ul className="space-y-4 mb-8">
                      {plan.features.map((feature, i) => (
                        <li key={i} className="flex items-start gap-3 text-sm">
                          <CheckCircle2 className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
                          <span className="text-white/80">{feature}</span>
                        </li>
                      ))}
                    </ul>
                    
                    <Button 
                      className={`w-full h-12 rounded-xl text-base font-medium transition-all duration-200 ${
                        plan.featured 
                          ? 'bg-gradient-to-r from-cyan-500 to-cyan-400 text-black hover:opacity-90' 
                          : 'bg-white/[0.06] text-white hover:bg-white/[0.1]'
                      }`}
                      onClick={() => handleGetStarted(plan.name)}
                    >
                      {plan.cta}
                    </Button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Trust Elements */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.5 }}
            className="flex flex-wrap justify-center items-center gap-6 mt-12 text-sm text-white/40"
          >
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4" />
              <span>Cancel anytime</span>
            </div>
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4" />
              <span>Secure checkout via Stripe</span>
            </div>
            <div className="flex items-center gap-2">
              <CreditCard className="w-4 h-4" />
              <span>Your VA starts moving today</span>
            </div>
          </motion.div>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-8 border-t border-white/[0.06] relative z-10">
        <div className="container mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <Logo size="sm" />
          <p className="text-sm text-white/30">
            © {new Date().getFullYear()} seeVAdone. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
