import React, { useState, useEffect } from 'react';
import { login, register } from './api';
import { Card, CardContent } from './components/ui/card';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { useT } from './i18n';

export default function AuthPage({ isBeta }) {
  const t = useT();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);

  useEffect(() => {
    const API = process.env.REACT_APP_API_URL || '/api';
    fetch(API + '/setup/status', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => { if (d && d.requiresSetup) setNeedsSetup(true); })
      .catch(() => {});
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (isLogin) {
        await login(email, password);
      } else {
        await register(email, password, name);
      }
      window.location.reload();
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardContent className="p-8">
          <h1 className="mb-1 text-center text-2xl font-bold text-primary">Verifica</h1>
          <p className="mb-6 text-center text-sm text-muted-foreground">A bilingual web app that verifies the authenticity of individuals offering...</p>

          {isBeta && (
            <div className="mb-4 rounded-md bg-accent p-2 text-center text-xs text-accent-foreground">
              {t('auth.privateBeta')}
            </div>
          )}

          {needsSetup && (
            <div className="mb-4 rounded-md border border-green-500/30 bg-green-500/10 p-3 text-sm text-green-300">
              {t('auth.setupNotice')}{' '}
              <a
                href="#setup"
                onClick={(e) => { e.preventDefault(); window.location.hash = '#setup'; window.location.reload(); }}
                className="font-semibold underline"
              >
                {t('auth.runSetupWizard')}
              </a>
            </div>
          )}

          {error && (
            <div role="alert" aria-live="assertive" className="mb-4 rounded-md border border-red-500/40 bg-red-500/10 p-2 text-sm text-red-300">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} aria-label={isLogin ? t('auth.signInForm') : t('auth.createAccountForm')} className="space-y-4">
            {!isLogin && !isBeta && (
              <Input type="text" placeholder={t('auth.fullName')} aria-label={t('auth.fullName')} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
            )}
            <Input type="email" placeholder={t('auth.email')} aria-label={t('auth.email')} autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <Input type="password" placeholder={t('auth.password')} aria-label={t('auth.password')} autoComplete={isLogin ? 'current-password' : 'new-password'} value={password} onChange={(e) => setPassword(e.target.value)} required />
            <Button type="submit" disabled={loading} aria-busy={loading} className="w-full">
              {loading ? t('auth.pleaseWait') : (isLogin ? t('auth.signIn') : t('auth.register'))}
            </Button>
          </form>

          {!isBeta && (
            <p className="mt-4 cursor-pointer text-center text-sm text-muted-foreground hover:text-foreground" onClick={() => setIsLogin(!isLogin)}>
              {isLogin ? t('auth.noAccount') : t('auth.haveAccount')}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

