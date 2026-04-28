import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Eye, EyeOff, ArrowLeft, Mail, CheckCircle, ShieldCheck, RefreshCw, TrendingUp, DollarSign, BarChart3, Zap, Wifi, Clock, Users } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { lovable } from '@/integrations/lovable/index';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import logoMark from '@/assets/logo-mark.png';

type AuthMode = 'login' | 'signup' | 'forgot' | 'reset';

// Rate limiting: max 5 attempts per 60 seconds
const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION = 60_000;

function useRateLimit() {
  const attemptsRef = useRef<number[]>([]);

  const checkLimit = useCallback(() => {
    const now = Date.now();
    attemptsRef.current = attemptsRef.current.filter(t => now - t < LOCKOUT_DURATION);
    if (attemptsRef.current.length >= MAX_ATTEMPTS) {
      const oldest = attemptsRef.current[0];
      const waitSec = Math.ceil((LOCKOUT_DURATION - (now - oldest)) / 1000);
      return { allowed: false, waitSec };
    }
    attemptsRef.current.push(now);
    return { allowed: true, waitSec: 0 };
  }, []);

  return checkLimit;
}

function getPasswordStrength(pw: string): { score: number; label: string; color: string; feedback: string[] } {
  const feedback: string[] = [];
  let score = 0;
  if (pw.length >= 8) score++; else feedback.push('At least 8 characters');
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw)) score++; else feedback.push('One uppercase letter');
  if (/[a-z]/.test(pw)) score++; else feedback.push('One lowercase letter');
  if (/[0-9]/.test(pw)) score++; else feedback.push('One number');
  if (/[^A-Za-z0-9]/.test(pw)) score++; else feedback.push('One special character');

  if (score <= 2) return { score, label: 'Weak', color: 'bg-destructive', feedback };
  if (score <= 4) return { score, label: 'Fair', color: 'bg-yellow-500', feedback };
  return { score, label: 'Strong', color: 'bg-emerald-500', feedback };
}

export default function AuthPage() {
  const [searchParams] = useSearchParams();
  const initialMode = searchParams.get('mode') === 'reset' ? 'reset' : 'login';
  const checkRateLimit = useRateLimit();
  
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [socialLoading, setSocialLoading] = useState<'google' | 'apple' | null>(null);
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendLoading, setResendLoading] = useState(false);

  const { signIn, signUp, resetPassword, updatePassword, resendConfirmation } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    // Supabase recovery links arrive as #access_token=...&type=recovery
    const hash = window.location.hash || '';
    const isRecovery = hash.includes('type=recovery') || searchParams.get('mode') === 'reset';
    if (isRecovery) {
      setMode('reset');
      setShowEmailForm(true);
    }
  }, [searchParams]);

  // Countdown timer for resend cooldown
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  const handleResendConfirmation = async () => {
    if (!email || resendCooldown > 0 || resendLoading) return;
    setResendLoading(true);
    setError('');
    try {
      const { error } = await resendConfirmation(email.trim().toLowerCase());
      if (error) throw error;
      setSuccess('Confirmation email resent! Check your inbox.');
      setResendCooldown(45);
    } catch (err: any) {
      const msg = err.message || '';
      if (msg.includes('rate limit') || msg.includes('after')) {
        setResendCooldown(45);
        setError('Please wait a moment before requesting another email.');
      } else {
        setError(msg || 'Failed to resend email. Try again shortly.');
      }
    } finally {
      setResendLoading(false);
    }
  };

  const handleSocialLogin = async (provider: 'google' | 'apple') => {
    setSocialLoading(provider);
    setError('');
    try {
      const result = await lovable.auth.signInWithOAuth(provider, {
        redirect_uri: window.location.origin,
      });
      if (result.error) {
        setError(result.error.message || `Failed to sign in with ${provider}`);
        setSocialLoading(null);
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
      setSocialLoading(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    // Rate limiting check
    const { allowed, waitSec } = checkRateLimit();
    if (!allowed) {
      setError(`Too many attempts. Please wait ${waitSec} seconds before trying again.`);
      return;
    }

    // Sanitize inputs
    const sanitizedEmail = email.trim().toLowerCase().slice(0, 255);
    const sanitizedName = fullName.trim().slice(0, 100);

    // Password strength check on signup
    if (mode === 'signup' || mode === 'reset') {
      const strength = getPasswordStrength(password);
      if (strength.score <= 2) {
        setError('Password is too weak. Please use a stronger password with uppercase, lowercase, numbers, and special characters.');
        return;
      }
    }

    setLoading(true);

    try {
      if (mode === 'login') {
        const { error } = await signIn(sanitizedEmail, password);
        if (error) throw error;
        navigate('/dashboard');
      } else if (mode === 'signup') {
        if (!sanitizedName) {
          throw new Error('Full name is required');
        }
        const { error } = await signUp(sanitizedEmail, password, sanitizedName);
        if (error) throw error;
        setAwaitingConfirmation(true);
        setResendCooldown(45);
      } else if (mode === 'forgot') {
        const { error } = await resetPassword(sanitizedEmail);
        if (error) throw error;
        setSuccess('Check your email for a password reset link');
      } else if (mode === 'reset') {
        if (password !== confirmPassword) {
          throw new Error('Passwords do not match');
        }
        if (password.length < 8) {
          throw new Error('Password must be at least 8 characters');
        }
        const { error } = await updatePassword(password);
        if (error) throw error;
        setSuccess('Password updated successfully! Redirecting...');
        setTimeout(() => navigate('/dashboard'), 2000);
      }
    } catch (err: any) {
      // Obfuscate specific auth errors to prevent user enumeration
      const msg = err.message || 'An error occurred';
      if (mode === 'login' && (msg.includes('Invalid login') || msg.includes('invalid_credentials'))) {
        setError('Invalid email or password. Please check your credentials and try again.');
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const getTitle = () => {
    if (!showEmailForm && (mode === 'login' || mode === 'signup')) return 'Welcome to Dealzflow';
    switch (mode) {
      case 'login': return 'Sign in with email';
      case 'signup': return 'Create your account';
      case 'forgot': return 'Reset your password';
      case 'reset': return 'Set new password';
    }
  };

  const getSubtitle = () => {
    if (!showEmailForm && (mode === 'login' || mode === 'signup')) return 'Choose how you want to continue';
    switch (mode) {
      case 'login': return 'Enter your credentials to access your dashboard';
      case 'signup': return 'Get started with Dealzflow today';
      case 'forgot': return "Enter your email and we'll send you a reset link";
      case 'reset': return 'Choose a strong password for your account';
    }
  };

  return (
    <div className="min-h-dvh flex">
      {/* Left side - premium branding panel */}
      <div className="hidden lg:flex lg:w-[48%] bg-card border-r border-border px-12 py-10 flex-col relative overflow-hidden">
        {/* Subtle background texture */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/3 pointer-events-none" />
        <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full bg-primary/5 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-32 -left-16 w-80 h-80 rounded-full bg-primary/4 blur-3xl pointer-events-none" />

        {/* Logo + wordmark */}
        <div className="relative flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
            <img src={logoMark} alt="Dealzflow" className="w-6 h-6 object-contain" />
          </div>
          <div className="flex items-baseline gap-0.5">
            <span className="text-xl font-bold tracking-tight text-foreground">Dealz</span>
            <span className="text-xl font-bold tracking-tight text-primary">flow</span>
          </div>
        </div>

        {/* Central hero copy */}
        <div className="relative space-y-6 mt-10">
          {/* Audience badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            <span className="text-[11px] font-semibold text-primary uppercase tracking-wider">Built for Real Brokerage Agents</span>
          </div>

          <div>
            <h2 className="text-3xl font-bold text-foreground mb-3 tracking-tight leading-snug">
              Financial clarity for<br />every Real deal
            </h2>
            <p className="text-muted-foreground text-[15px] leading-relaxed">
              Connect your ReZen account once. Your deals, commissions, and rev share sync automatically — no manual entry.
            </p>
          </div>

          {/* Feature pills */}
          <div className="flex flex-col gap-2.5">
            {[
              { icon: Zap, label: 'Auto-sync from ReZen', desc: 'Deals, payouts & rev share — always up to date', accent: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/15' },
              { icon: DollarSign, label: 'Safe-to-Spend', desc: 'Know exactly what you can spend after taxes', accent: 'text-primary bg-primary/10 border-primary/15' },
              { icon: BarChart3, label: '12-month forecasting', desc: 'See slow months coming before they hurt', accent: 'text-blue-500 bg-blue-500/10 border-blue-500/15' },
              { icon: Users, label: 'Rev share tracking', desc: 'Your full network and tiers synced from ReZen', accent: 'text-amber-500 bg-amber-500/10 border-amber-500/15' },
            ].map(({ icon: Icon, label, desc, accent }) => (
              <div key={label} className="flex items-center gap-4 p-3.5 rounded-xl bg-background/60 border border-border/60 backdrop-blur-sm">
                <div className={`w-9 h-9 rounded-lg border flex items-center justify-center shrink-0 ${accent}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">{label}</p>
                  <p className="text-xs text-muted-foreground">{desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Integration badges */}
          <div className="pt-1">
            <p className="text-[10.5px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Integrations</p>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                <Wifi className="w-3 h-3 text-emerald-500" />
                <span className="text-[10.5px] font-semibold text-emerald-600 dark:text-emerald-400">ReZen — LIVE</span>
              </div>
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <Clock className="w-3 h-3 text-amber-500" />
                <span className="text-[10.5px] font-semibold text-amber-600 dark:text-amber-400">SkySlope — Soon</span>
              </div>
            </div>
          </div>
        </div>

        <div className="relative flex justify-center gap-6 text-sm text-muted-foreground mt-auto pt-8">
          <Link to="/terms" className="hover:text-foreground transition-colors">Terms</Link>
          <Link to="/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
        </div>
      </div>

      {/* Right side - auth */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-8 bg-background relative overflow-hidden">
        {/* Subtle radial glow */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_40%,hsl(var(--primary)/0.06),transparent)]" />
        <div className="w-full max-w-sm relative">
          {/* Mobile logo */}
          <div className="lg:hidden flex flex-col items-center gap-3 mb-10">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
              <img src={logoMark} alt="Dealzflow" className="w-9 h-9 object-contain" />
            </div>
            <div className="flex items-baseline gap-0.5">
              <span className="text-2xl font-bold tracking-tight text-foreground">Dealz</span>
              <span className="text-2xl font-bold tracking-tight text-primary">flow</span>
            </div>
          </div>

          {/* Back button */}
          {(mode === 'forgot' || mode === 'reset' || showEmailForm) && (
            <button
              onClick={() => {
                if (mode === 'forgot' || mode === 'reset') {
                  setMode('login');
                  setShowEmailForm(false);
                } else {
                  setShowEmailForm(false);
                }
                setError('');
                setSuccess('');
              }}
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              {showEmailForm && mode !== 'forgot' && mode !== 'reset' ? 'All sign in options' : 'Back to sign in'}
            </button>
          )}

          {/* Premium glass card */}
          <div className="rounded-2xl border border-border/60 bg-card p-6 sm:p-7
            shadow-[0_1px_0_0_hsl(0_0%_100%/0.7),0_1px_2px_0_hsl(222_20%_6%/0.04),0_4px_14px_-4px_hsl(222_20%_6%/0.08),0_20px_48px_-12px_hsl(222_20%_6%/0.07)]
            dark:shadow-[0_1px_0_0_hsl(0_0%_100%/0.05),0_2px_8px_0_hsl(0_0%_0%/0.3),0_16px_40px_-8px_hsl(0_0%_0%/0.4)]">
            <h1 className="text-[22px] font-bold mb-1.5 text-center">{getTitle()}</h1>
            <p className="text-muted-foreground mb-6 text-center text-[14px] leading-relaxed">{getSubtitle()}</p>


          {error && (
            <div className="mb-4 p-4 bg-destructive/10 border border-destructive/20 rounded-xl text-sm text-destructive">
              {error}
            </div>
          )}

          {success && (
            <div className="mb-4 p-4 bg-success/10 border border-success/20 rounded-xl text-sm text-success flex items-center gap-2">
              <CheckCircle className="w-4 h-4" />
              {success}
            </div>
          )}

          {/* Email confirmation pending screen */}
          {awaitingConfirmation && (
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-primary/10 flex items-center justify-center">
                <Mail className="w-8 h-8 text-primary" />
              </div>
              <h1 className="text-2xl font-bold mb-2">Check your email</h1>
              <p className="text-muted-foreground text-[15px] mb-1">
                We sent a confirmation link to
              </p>
              <p className="font-semibold text-foreground mb-6 break-all">{email}</p>

              <p className="text-sm text-muted-foreground mb-6">
                Click the link in the email to activate your account. It may take a minute to arrive — check your spam folder if you don't see it.
              </p>

              {error && (
                <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-xl text-sm text-destructive text-left">
                  {error}
                </div>
              )}
              {success && (
                <div className="mb-4 p-3 bg-success/10 border border-success/20 rounded-xl text-sm text-success flex items-center gap-2 text-left">
                  <CheckCircle className="w-4 h-4 shrink-0" />
                  {success}
                </div>
              )}

              <Button
                type="button"
                variant="outline"
                className="w-full h-12 text-[15px]"
                onClick={handleResendConfirmation}
                disabled={resendCooldown > 0 || resendLoading}
              >
                {resendLoading ? (
                  <span className="flex items-center gap-2">
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Sending...
                  </span>
                ) : resendCooldown > 0 ? (
                  <span className="flex items-center gap-2">
                    <RefreshCw className="w-4 h-4" />
                    Resend in {resendCooldown}s
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <RefreshCw className="w-4 h-4" />
                    Resend confirmation email
                  </span>
                )}
              </Button>

              <button
                type="button"
                className="mt-4 text-sm text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => {
                  setAwaitingConfirmation(false);
                  setMode('login');
                  setShowEmailForm(true);
                  setError('');
                  setSuccess('');
                }}
              >
                Back to sign in
              </button>
            </div>
          )}

          {/* Social-first view */}
          {!awaitingConfirmation && !showEmailForm && (mode === 'login' || mode === 'signup') && (
            <div className="space-y-2.5">
              {/* Google */}
              <Button
                type="button"
                variant="outline"
                className="w-full h-11 text-[14px] font-semibold gap-3 border-border/70 hover:bg-muted/50 hover:border-border shadow-[0_1px_2px_0_hsl(222_20%_6%/0.04)]"
                onClick={() => handleSocialLogin('google')}
                disabled={socialLoading !== null}
              >
                {socialLoading === 'google' ? (
                  <>
                    <span className="w-4 h-4 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
                    Connecting...
                  </>
                ) : (
                  <>
                    <svg className="w-[18px] h-[18px] shrink-0" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                    </svg>
                    Continue with Google
                  </>
                )}
              </Button>

              {/* Apple */}
              <Button
                type="button"
                variant="outline"
                className="w-full h-11 text-[14px] font-semibold gap-3 border-border/70 hover:bg-muted/50 hover:border-border shadow-[0_1px_2px_0_hsl(222_20%_6%/0.04)]"
                onClick={() => handleSocialLogin('apple')}
                disabled={socialLoading !== null}
              >
                {socialLoading === 'apple' ? (
                  <>
                    <span className="w-4 h-4 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
                    Connecting...
                  </>
                ) : (
                  <>
                    <svg className="w-[18px] h-[18px] shrink-0" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
                    </svg>
                    Continue with Apple
                  </>
                )}
              </Button>

              {/* Divider */}
              <div className="relative my-5">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border/60" />
                </div>
                <div className="relative flex justify-center text-[11px] uppercase tracking-wider">
                  <span className="bg-card px-3 text-muted-foreground/60 font-medium">Or continue with</span>
                </div>
              </div>

              {/* Email option */}
              <Button
                type="button"
                variant="outline"
                className="w-full h-11 text-[14px] font-semibold gap-3 border-border/70 hover:bg-muted/50 hover:border-border shadow-[0_1px_2px_0_hsl(222_20%_6%/0.04)]"
                onClick={() => setShowEmailForm(true)}
              >
                <Mail className="w-[18px] h-[18px] shrink-0" />
                Continue with Email
              </Button>

              <p className="pt-2 text-center text-[13.5px] text-muted-foreground">
                {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
                <button
                  type="button"
                  onClick={() => {
                    setMode(mode === 'login' ? 'signup' : 'login');
                    setError('');
                  }}
                  className="text-primary font-semibold active:opacity-50 transition-opacity hover:underline underline-offset-2"
                >
                  {mode === 'login' ? 'Sign up free' : 'Sign in'}
                </button>
              </p>
            </div>
          )}

          {/* Email form (secondary) */}
          {!awaitingConfirmation && (showEmailForm || mode === 'forgot' || mode === 'reset') && (
            <>
              <form onSubmit={handleSubmit} className="space-y-4">
                {mode === 'signup' && (
                  <div className="space-y-1.5">
                    <Label htmlFor="fullName" className="text-[13px] font-semibold text-foreground/80">Full Name</Label>
                    <Input
                      id="fullName"
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="John Smith"
                      required={mode === 'signup'}
                      className="h-11"
                    />
                  </div>
                )}

                {mode !== 'reset' && (
                  <div className="space-y-1.5">
                    <Label htmlFor="email" className="text-[13px] font-semibold text-foreground/80">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      required
                      className="h-11"
                    />
                  </div>
                )}

                {(mode === 'login' || mode === 'signup' || mode === 'reset') && (
                  <div className="space-y-1.5">
                    <Label htmlFor="password" className="text-[13px] font-semibold text-foreground/80">
                      {mode === 'reset' ? 'New Password' : 'Password'}
                    </Label>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        required
                        minLength={8}
                        maxLength={128}
                        autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                        className="h-11 pr-12"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground transition-colors"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    {/* Password strength indicator for signup/reset */}
                    {(mode === 'signup' || mode === 'reset') && password.length > 0 && (() => {
                      const strength = getPasswordStrength(password);
                      return (
                        <div className="space-y-2 mt-2">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                              <div 
                                className={`h-full rounded-full transition-all duration-300 ${strength.color}`}
                                style={{ width: `${Math.min(100, (strength.score / 6) * 100)}%` }}
                              />
                            </div>
                            <span className="text-xs font-medium text-muted-foreground">{strength.label}</span>
                          </div>
                          {strength.feedback.length > 0 && (
                            <p className="text-xs text-muted-foreground">
                              Missing: {strength.feedback.join(', ')}
                            </p>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}

                {mode === 'reset' && (
                  <div className="space-y-1.5">
                    <Label htmlFor="confirmPassword" className="text-[13px] font-semibold text-foreground/80">Confirm Password</Label>
                    <Input
                      id="confirmPassword"
                      type={showPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                      minLength={8}
                      className="h-11"
                    />
                  </div>
                )}

                {mode === 'login' && (
                  <div className="flex justify-end -mt-1">
                    <button
                      type="button"
                      onClick={() => { setMode('forgot'); setError(''); }}
                      className="text-[13px] text-primary hover:underline underline-offset-2 font-medium"
                    >
                      Forgot password?
                    </button>
                  </div>
                )}

                <Button 
                  type="submit" 
                  className="w-full h-11 text-[14px] font-semibold mt-1" 
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <span className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                      Please wait...
                    </>
                  ) : mode === 'login' ? 'Sign In' 
                    : mode === 'signup' ? 'Create Account' 
                    : mode === 'forgot' ? (
                      <><Mail className="w-4 h-4" />Send Reset Link</>
                    ) : 'Update Password'}
                </Button>
              </form>

              {(mode === 'login' || mode === 'signup') && (
                <p className="mt-5 text-center text-[13.5px] text-muted-foreground">
                  {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
                  <button
                    type="button"
                    onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); }}
                    className="text-primary font-semibold active:opacity-50 transition-opacity hover:underline underline-offset-2"
                  >
                    {mode === 'login' ? 'Sign up free' : 'Sign in'}
                  </button>
                </p>
              )}
            </>
          )}
          </div>{/* end premium card */}

          {/* Legal links for mobile */}
          <div className="lg:hidden flex justify-center gap-4 mt-6 text-sm text-muted-foreground">
            <Link to="/terms" className="hover:text-foreground transition-colors">Terms</Link>
            <Link to="/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
