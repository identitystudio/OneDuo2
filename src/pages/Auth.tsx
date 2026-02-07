import { useState, useEffect } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Mail, ArrowRight, CheckCircle, Loader2, ArrowLeft } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Logo } from '@/components/Logo';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { z } from 'zod';

const emailSchema = z.string().email('Please enter a valid email address');

export default function Auth() {
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [error, setError] = useState('');
  const [tosAcknowledged, setTosAcknowledged] = useState(false);

  // Determine if this is signup or login based on route
  const isSignup = location.pathname === '/signup';
  const pageTitle = isSignup ? 'Create your OneDuo account' : 'Sign in to OneDuo';
  const pageDescription = isSignup
    ? "Get started with OneDuo. We'll send a secure link to your email."
    : "No password needed. We'll send a secure link to your email.";

  // Check if already authenticated
  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        navigate('/dashboard');
      }
    };
    checkSession();

    // Listen for auth changes (for magic link callback)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        toast.success('Welcome back!', {
          description: `Signed in as ${session.user.email}`,
        });
        navigate('/dashboard');
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validate email
    const result = emailSchema.safeParse(email);
    if (!result.success) {
      setError(result.error.errors[0].message);
      return;
    }

    setIsLoading(true);

    try {
      const redirectUrl = window.location.origin;

      const { error: authError } = await supabase.auth.signInWithOtp({
        email: email.trim().toLowerCase(),
        options: {
          emailRedirectTo: redirectUrl,
        },
      });

      if (authError) {
        throw authError;
      }

      setEmailSent(true);
      toast.success('Magic link sent!', {
        description: 'Check your email and click the link to sign in.',
        duration: 8000,
      });
    } catch (err) {
      console.error('Auth error:', err);
      const message = err instanceof Error ? err.message : 'Failed to send magic link';
      setError(message);
      toast.error('Authentication failed', { description: message });
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendLink = () => {
    setEmailSent(false);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <Logo className="h-8 w-auto" />
          </Link>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/" className="text-muted-foreground">
              <ArrowLeft className="w-4 h-4 mr-1" />
              Back
            </Link>
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md"
        >
          {!emailSent ? (
            <div className="space-y-6">
              {/* Header - Simplified */}
              <div className="text-center space-y-2">
                <h1 className="text-2xl font-bold text-foreground">{pageTitle}</h1>
                <p className="text-sm text-muted-foreground">
                  {pageDescription}
                </p>
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <Input
                      type="email"
                      placeholder="you@company.com"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        setError('');
                      }}
                      className="pl-10 h-12 text-base"
                      disabled={isLoading}
                      autoFocus
                    />
                  </div>
                  {error && (
                    <p className="mt-2 text-sm text-destructive">{error}</p>
                  )}
                </div>

                {/* TOS Agreement */}
                <div className="flex items-start gap-3">
                  <Checkbox
                    id="tos-acknowledgment"
                    checked={tosAcknowledged}
                    onCheckedChange={(checked) => setTosAcknowledged(checked === true)}
                    className="mt-0.5"
                  />
                  <label
                    htmlFor="tos-acknowledgment"
                    className="text-sm text-muted-foreground leading-relaxed cursor-pointer"
                  >
                    I agree to the{' '}
                    <Link to="/terms" className="underline hover:text-foreground">Terms of Service</Link>
                    {' '}and{' '}
                    <Link to="/privacy" className="underline hover:text-foreground">Privacy Policy</Link>
                  </label>
                </div>

                <Button
                  type="submit"
                  size="lg"
                  className="w-full h-12 bg-primary hover:bg-primary/90"
                  disabled={isLoading || !email || !tosAcknowledged}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Sending link...
                    </>
                  ) : (
                    <>
                      Send Magic Link
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </>
                  )}
                </Button>
              </form>

            </div>
          ) : (
            /* Email Sent State */
            <div className="text-center space-y-6">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 200, damping: 15 }}
              >
                <div className="w-20 h-20 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto">
                  <CheckCircle className="w-10 h-10 text-emerald-400" />
                </div>
              </motion.div>

              <div className="space-y-2">
                <h2 className="text-2xl font-bold text-foreground">Check your email</h2>
                <p className="text-muted-foreground">
                  We sent a magic link to
                </p>
                <p className="font-medium text-foreground">{email}</p>
              </div>

              <div className="p-4 rounded-xl bg-muted/50 border border-border text-sm text-muted-foreground">
                <p>Click the link in the email to sign in securely.</p>
                <p className="mt-2 text-xs">
                  The link expires in 1 hour. Check your spam folder if you don't see it.
                </p>
              </div>

              <div className="flex flex-col gap-2">
                <Button
                  variant="ghost"
                  onClick={handleResendLink}
                  className="text-muted-foreground"
                >
                  Didn't receive it? Try again
                </Button>
                <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
                  ← Back to home
                </Link>
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
