import React, { useState, useEffect } from 'react';
import { isLoggedIn, getUser, logout, checkBetaStatus, onAuthChange } from './api';
import { useT } from './i18n';
import AuthPage from './AuthPage';
import DashboardPage from './DashboardPage';

import AssistantPage from './AssistantPage';

import SettingsPage from './SettingsPage';
import TrustPage from './TrustPage';
import TenantsPage from './TenantsPage';
import AiEconomicsPage from './AiEconomicsPage';

import GrowthPage from './GrowthPage';


import DataProductsPage from './DataProductsPage';


import MarketplacePage from './MarketplacePage';

import OperationsPage from './OperationsPage';
import StatusPage from './StatusPage';
import TrustPortalPage from './TrustPortalPage';
import GovernancePage from './GovernancePage';

import PricingPage from './PricingPage';

import LandingPage from './LandingPage';
import { SecurityPage, PrivacyPage, TermsPage, AboutPage } from './LegalPages';
import OnboardingWizard from './OnboardingWizard';




import PackHomePage from './PackHomePage';

import Article6WizardPage from './Article6WizardPage';
import EvaluationsPage from './EvaluationsPage';
import SetupPage from './SetupPage';
import IntegrationsPage from './IntegrationsPage';
import EntitiesPage from './EntitiesPage';
import ToolsPage from './ToolsPage';
import HelpCenterPage from './HelpCenterPage';
import './Dashboard.css';

function initialPageFromHash() {
  if (typeof window === 'undefined') return 'home';
  const h = window.location.hash;
  if (h === '#pricing')      return 'pricing';
  if (h === '#article-6')    return 'article-6';
  if (h === '#setup')        return 'setup';
  if (h === '#integrations') return 'integrations';
  if (h === '#help' || h.indexOf('#help/') === 0) return 'help';
  if (h === '#login')        return 'login';
  if (h === '#app')      return 'dashboard';
  if (h === '#assistant') return 'assistant';
  if (h === '#security') return 'security';
  if (h === '#privacy')  return 'privacy';
  if (h === '#terms')    return 'terms';
  if (h === '#about')    return 'about';
  return 'home';
}

export default function App() {
  const t = useT();
  const [page, setPage] = useState(initialPageFromHash());
  const [isBeta, setIsBeta] = useState(false);
  const [authed, setAuthed] = useState(isLoggedIn());

  useEffect(() => {
    checkBetaStatus().then(setIsBeta);
    const off = onAuthChange(() => { setAuthed(false); setPage('home'); });
    function onHash() { setPage(initialPageFromHash()); }
    if (typeof window !== 'undefined') window.addEventListener('hashchange', onHash);
    return () => {
      off && off();
      if (typeof window !== 'undefined') window.removeEventListener('hashchange', onHash);
    };
  }, []);


  // Unauthenticated marketing surface ─────────────────────────────
  if (!authed) {
    const nav = {
      onHome:    () => setPage('home'),

      onPricing: () => setPage('pricing'),

      onLogin:   () => setPage('login'),
    };

    if (page === 'pricing')   return <PricingPage onNavigateToAuth={nav.onLogin} />;

    if (page === 'article-6') return <Article6WizardPage onHome={nav.onHome} />;
    if (page === 'setup')     return <SetupPage onHome={nav.onHome} onLogin={nav.onLogin} />;
    if (page === 'integrations') return <IntegrationsPage onHome={nav.onHome} />;
    if (page === 'help')      return <HelpCenterPage onHome={nav.onHome} onLogin={nav.onLogin} />;
    if (page === 'login')     return <AuthPage isBeta={isBeta} />;
    if (page === 'security') return <SecurityPage {...nav} />;
    if (page === 'privacy')  return <PrivacyPage  {...nav} />;
    if (page === 'terms')    return <TermsPage    {...nav} />;
    if (page === 'about')    return <AboutPage    {...nav} />;
    return <LandingPage onPricing={nav.onPricing} onLogin={nav.onLogin} />;
  }

  const user = getUser();
  // After login, marketing-only pages ('home', 'login') resolve to the landing
  // page for THIS platform. When the industry ships an operations page, that is
  // the first screen — a compliance buyer landing on a generic empty console is
  // the worst possible first impression of a working product. Falls back to the
  // entity workspace, then the generic dashboard.
  const DEFAULT_PAGE = 'pack';
  const authedPage = (page === 'home' || page === 'login') ? DEFAULT_PAGE : page;

  return (
    <div className="app">
      <nav className="sidebar">
        <div className="sidebar-header">
          <h2>Verifica</h2>
          <p className="welcome">{t('common.welcome', { name: user?.name || user?.email })}</p>
        </div>
        <ul className="nav-links">
          <li className={authedPage === 'dashboard' ? 'active' : ''}><button type="button" className="nav-link" aria-current={authedPage === 'dashboard' ? 'page' : undefined} onClick={() => setPage('dashboard')}>{t('nav.dashboard')}</button></li>

          <li className={authedPage === 'assistant' ? 'active' : ''}><button type="button" className="nav-link" aria-current={authedPage === 'assistant' ? 'page' : undefined} onClick={() => setPage('assistant')}>{t('nav.assistant')}</button></li>


          <li className={authedPage === 'data' ? 'active' : ''}><button type="button" className="nav-link" aria-current={authedPage === 'data' ? 'page' : undefined} onClick={() => setPage('data')}>{t('nav.data')}</button></li>

          <li className={authedPage === 'tools' ? 'active' : ''}><button type="button" className="nav-link" aria-current={authedPage === 'tools' ? 'page' : undefined} onClick={() => setPage('tools')}>{t('nav.tools')}</button></li>



          <li className={authedPage === 'pack' ? 'active' : ''}><button type="button" className="nav-link" aria-current={authedPage === 'pack' ? 'page' : undefined} onClick={() => setPage('pack')}>Triage</button></li>

          <li className={authedPage === 'trust' ? 'active' : ''}><button type="button" className="nav-link" aria-current={authedPage === 'trust' ? 'page' : undefined} onClick={() => setPage('trust')}>{t('nav.trust')}</button></li>
          {user?.role === 'admin' && (
            <li className={authedPage === 'tenants' ? 'active' : ''}><button type="button" className="nav-link" aria-current={authedPage === 'tenants' ? 'page' : undefined} onClick={() => setPage('tenants')}>{t('nav.tenants')}</button></li>
          )}
          {user?.role === 'admin' && (
            <li className={authedPage === 'ai-economics' ? 'active' : ''} onClick={() => setPage('ai-economics')}>{t('nav.aiEconomics')}</li>
          )}
          {user?.role === 'admin' && (
            <li className={authedPage === 'evaluations' ? 'active' : ''}><button type="button" className="nav-link" aria-current={authedPage === 'evaluations' ? 'page' : undefined} onClick={() => setPage('evaluations')}>{t('nav.aiEvaluations')}</button></li>
          )}

          {user?.role === 'admin' && (
            <li className={authedPage === 'growth' ? 'active' : ''}><button type="button" className="nav-link" aria-current={authedPage === 'growth' ? 'page' : undefined} onClick={() => setPage('growth')}>{t('nav.growth')}</button></li>
          )}


          {user?.role === 'admin' && (
            <li className={authedPage === 'data-products' ? 'active' : ''} onClick={() => setPage('data-products')}>{t('nav.dataProducts')}</li>
          )}


          <li className={authedPage === 'marketplace' ? 'active' : ''}><button type="button" className="nav-link" aria-current={authedPage === 'marketplace' ? 'page' : undefined} onClick={() => setPage('marketplace')}>{t('nav.marketplace')}</button></li>

          {user?.role === 'admin' && (
            <li className={authedPage === 'operations' ? 'active' : ''}><button type="button" className="nav-link" aria-current={authedPage === 'operations' ? 'page' : undefined} onClick={() => setPage('operations')}>{t('nav.operations')}</button></li>
          )}
          <li className={authedPage === 'status' ? 'active' : ''}><button type="button" className="nav-link" aria-current={authedPage === 'status' ? 'page' : undefined} onClick={() => setPage('status')}>{t('nav.status')}</button></li>
          {user?.role === 'admin' && (
            <li className={authedPage === 'trust-portal' ? 'active' : ''} onClick={() => setPage('trust-portal')}>{t('nav.trustPortal')}</li>
          )}
          {user?.role === 'admin' && (
            <li className={authedPage === 'governance' ? 'active' : ''}><button type="button" className="nav-link" aria-current={authedPage === 'governance' ? 'page' : undefined} onClick={() => setPage('governance')}>{t('nav.governance')}</button></li>
          )}
          <li className={authedPage === 'settings' ? 'active' : ''}><button type="button" className="nav-link" aria-current={authedPage === 'settings' ? 'page' : undefined} onClick={() => setPage('settings')}>{t('nav.settings')}</button></li>

          <li className={authedPage === 'pricing' ? 'active' : ''}><button type="button" className="nav-link" aria-current={authedPage === 'pricing' ? 'page' : undefined} onClick={() => setPage('pricing')}>{t('nav.pricing')}</button></li>

          <li className={authedPage === 'help' ? 'active' : ''} onClick={() => { window.location.hash = '#help'; setPage('help'); }}>{t('nav.helpCentre')}</li>
        </ul>
        <button className="logout-btn" onClick={logout}>{t('auth.signOut')}</button>
      </nav>
      <main id="main" tabIndex={-1} className="content">
        {(authedPage === 'dashboard' || authedPage === 'settings') && (
          <OnboardingWizard onNavigate={setPage} />
        )}
        {authedPage === 'dashboard' && <DashboardPage />}

        {authedPage === 'assistant' && <AssistantPage />}

        {authedPage === 'data' && <EntitiesPage />}
        {authedPage === 'tools' && <ToolsPage />}



        {authedPage === 'pack' && <PackHomePage />}

        {authedPage === 'trust' && <TrustPage />}
        {authedPage === 'tenants' && user?.role === 'admin' && <TenantsPage />}
        {authedPage === 'ai-economics' && user?.role === 'admin' && <AiEconomicsPage />}
        {authedPage === 'evaluations' && user?.role === 'admin' && <EvaluationsPage />}

        {authedPage === 'growth' && user?.role === 'admin' && <GrowthPage />}


        {authedPage === 'data-products' && user?.role === 'admin' && <DataProductsPage />}


        {authedPage === 'marketplace' && <MarketplacePage user={user} />}

        {authedPage === 'operations' && user?.role === 'admin' && <OperationsPage />}
        {authedPage === 'status' && <StatusPage />}
        {authedPage === 'trust-portal' && user?.role === 'admin' && <TrustPortalPage />}
        {authedPage === 'governance' && user?.role === 'admin' && <GovernancePage />}
        {authedPage === 'settings' && <SettingsPage />}

        {authedPage === 'pricing' && <PricingPage />}

        {authedPage === 'help' && <HelpCenterPage onHome={() => setPage('dashboard')} />}
      </main>
    </div>
  );
}

