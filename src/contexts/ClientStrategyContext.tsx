import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { ClientStrategy } from '../types/sourcing';
import { useAuth } from './AuthContext';

const OPERATOR_EMAIL = 'ty@pulsepointstrategic.com';

export type ClientFeatures = {
  signals: boolean;
  outreach: boolean;
  replies: boolean;
  performance: boolean;
  intelligence: boolean;
  /** When true, Intelligence Profile editor is view-only for PAS clients (operator updates elsewhere). */
  intelligence_read_only?: boolean;
  sourcing_signal_first: boolean;
  sourcing_basic: boolean;
  sourcing_homepage: boolean;
  // false = demo/sandbox mode: dispatch buttons show "paused" toast instead of sending
  sending_enabled: boolean;
  /** When true, PAS clients see Connected Inbox (Gmail OAuth + SMTP app password) in Settings. */
  connected_inbox?: boolean;
  /** When true, the backend auto-appends drafted emails as Gmail drafts. Requires draft_synced_at column. */
  auto_draft_to_inbox?: boolean;
};

const DEFAULT_FEATURES: ClientFeatures = {
  signals: true,
  outreach: true,
  replies: true,
  performance: true,
  intelligence: true,
  sourcing_signal_first: true,
  sourcing_basic: true,
  sourcing_homepage: true,
  sending_enabled: true, // operators default to enabled; set false in DB for demo accounts
  auto_draft_to_inbox: false,
};

type ClientStrategyContextType = {
  strategy: ClientStrategy | null;
  leadsTable: string;
  loading: boolean;
  // Cache for AccountsPage
  companies: any[];
  setCompanies: React.Dispatch<React.SetStateAction<any[]>>;
  refreshCompanies: () => Promise<void>;
  lastFetched: number;
  activeContext: string;
  setActiveContext: (context: string) => void;
  availableContexts: string[];
  features: ClientFeatures;
  isOperator: boolean;
  refreshStrategy: () => Promise<void>;
  updateStrategy: (updates: Partial<ClientStrategy>) => Promise<void>;
  createStrategy: (slug: string, name: string, intelligenceProfile: Record<string, any>) => Promise<void>;
  error: string | null;
};

const ClientStrategyContext = createContext<ClientStrategyContextType | undefined>(undefined);

export function ClientStrategyProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();

  // localStorage persistence: restore last-known context so refreshes are instant.
  // Key: 'qf_active_context'. Cleared on sign-out so accounts don't bleed into each other.
  const getInitialContext = (): string => {
    try {
      const saved = localStorage.getItem('qf_active_context');
      if (saved) return saved;
    } catch { /* localStorage unavailable */ }
    return 'pulsepoint_strategic';
  };

  const [activeContext, setActiveContextState] = useState<string>(getInitialContext);
  const [strategy, setStrategy] = useState<ClientStrategy | null>(null);
  const [leadsTable, setLeadsTable] = useState<string>('PULSEPOINT_STRATEGIC_TRIGGERED_LEADS');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [operatorContexts, setOperatorContexts] = useState<string[]>([]);

  // Persist context to localStorage on every change.
  const setActiveContext = (ctx: string) => {
    try { localStorage.setItem('qf_active_context', ctx); } catch { /* ignore */ }
    setActiveContextState(ctx);
  };

  // Helper to parse potential Postgres array string
  const getContextArray = (ctx: string[] | string | undefined | null): string[] => {
    if (!ctx) return [];
    if (Array.isArray(ctx)) return ctx;
    const s = ctx as string;
    if (typeof s === 'string' && s.startsWith('{') && s.endsWith('}')) {
      return s.slice(1, -1).split(',').map(item => item.trim().replace(/^"|"$/g, ''));
    }
    return [s];
  };

  // UNIFIED effect: resolve the correct context for this user, THEN load the strategy.
  // Previously two separate effects caused a race where the strategy for the WRONG
  // context (pulsepoint_strategic) could finish loading and briefly set loading=false
  // before the context correction fired. This unified approach keeps loading=true
  // throughout the entire sequence, guaranteeing the sidebar only renders once with
  // the correct features.
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setLoading(false);
      return;
    }

    // Operator: fetch all slugs from client_strategies (client_context is null for operator account)
    const userIsOperator = user?.email === OPERATOR_EMAIL;
    if (userIsOperator && operatorContexts.length === 0) {
      supabase
        .from('client_strategies')
        .select('slug')
        .order('name')
        .then(({ data }) => {
          if (data) setOperatorContexts(data.map((r: any) => r.slug));
        });
    }

    // Resolve the correct context for this user before loading any strategy.
    const userContexts = user?.client_context;
    const contextArray = userIsOperator
      ? (operatorContexts.length > 0 ? operatorContexts : getContextArray(userContexts))
      : getContextArray(userContexts);

    let resolvedContext = activeContext;
    if (contextArray.length > 0 && !contextArray.includes(activeContext)) {
      // The cached/default context is not valid for this user—correct it now,
      // before any strategy load, so we never fetch the wrong strategy.
      resolvedContext = contextArray[0];
      setActiveContext(resolvedContext);
      // setActiveContextState triggers a re-render which will re-run this effect
      // with the corrected context, so we return early here.
      return;
    } else if (contextArray.length > 0) {
      // Context is valid — confirm/persist it
      try { localStorage.setItem('qf_active_context', resolvedContext); } catch { /* ignore */ }
    }

    // Now load the strategy for the confirmed correct context.
    loadStrategy(resolvedContext);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading, activeContext, operatorContexts]);

  // --- Accounts Cache ---
  const [companies, setCompanies] = useState<any[]>([]);
  const [lastFetched, setLastFetched] = useState(0);

  async function refreshCompanies() {
    if (!user) return;

    try {
      // Use activeContext instead of user.client_context
      const clientContext = activeContext;
      let companiesQuery = supabase
        .from('triggered_companies')
        .select('id, company, ticker, event_type, event_title, event_context, event_source_url, website, monitoring_status, monitoring_frequency, last_monitored_at, signal_detected_at, window_closes_at, client_context, created_at, is_paused')
        .order('created_at', { ascending: false });

      if (clientContext) {
        companiesQuery = companiesQuery.eq('client_context', clientContext);
      }

      const { data: companiesData, error: companiesError } = await companiesQuery;

      if (companiesError) throw companiesError;

      if (companiesData) {
        const { data: contactsData } = await supabase
          .from(leadsTable)
          .select('id, triggered_company_id, name, title, email, contact_status, linkedin_url, linkedin_profile_picture_url');

        const companiesWithContacts = companiesData.map((comp: any) => ({
          ...comp,
          contacts: contactsData?.filter((c: any) => c.triggered_company_id === comp.id) || []
        }));

        setCompanies(companiesWithContacts);
        setLastFetched(Date.now());
      }
    } catch (err) {
      console.error('Error refreshing companies:', err);
    }
  }

  async function loadStrategy(contextOverride?: string) {
    try {
      setLoading(true);
      // Use explicitly passed context (preferred) or fall back to activeContext state.
      // The explicit param avoids stale closure issues in the unified useEffect.
      const clientContext = contextOverride || activeContext || 'pulsepoint_strategic';

      const { data, error } = await supabase
        .from('client_strategies')
        .select('*, client_profiles(*)')
        .eq('slug', clientContext)
        .maybeSingle();

      if (error) {
        console.error('[CLIENT_STRATEGY] Error loading strategy:', error);
        setError(error.message);
        const fallbackTable = `${clientContext.toUpperCase()}_TRIGGERED_LEADS`;
        setLeadsTable(fallbackTable);
        setStrategy(null);
      } else if (data) {
        // ... (existing logic)
        setError(null);
        const profiles = data.client_profiles;
        const profile = Array.isArray(profiles) ? profiles[0] : profiles;

        const strategyWithProfile = {
          ...data,
          client_profiles: profile
        };

        setStrategy(strategyWithProfile);
        const configLeadsTable = data.config?.leads_table;
        const resolvedTable = configLeadsTable || `${clientContext.toUpperCase()}_TRIGGERED_LEADS`;
        setLeadsTable(resolvedTable);
      } else {
        const fallbackTable = `${clientContext.toUpperCase()}_TRIGGERED_LEADS`;
        setLeadsTable(fallbackTable);
        setStrategy(null);
        setError(`No strategy found for slug: ${clientContext}`);
      }
    } catch (err) {
      console.error('[CLIENT_STRATEGY] Unexpected error:', err);
      const clientContext = activeContext || 'pulsepoint_strategic';
      const fallbackTable = `${clientContext.toUpperCase()}_TRIGGERED_LEADS`;
      setLeadsTable(fallbackTable);
      setStrategy(null);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  async function updateStrategy(updates: Partial<ClientStrategy>) {
    // We specifically want to update client_profiles inside the strategy context
    if (!strategy || !activeContext) return;

    // In our schema, client_profiles might be a separate table or a JSONB column.
    // Looking at loadStrategy, it queries from 'client_strategies' and joins 'client_profiles'.
    // If we're updating intelligence_profile, it's inside client_profiles.

    if (updates.client_profiles) {
      // Assuming client_profiles is a separate table, but looking at previous data it's a relation.
      const profileId = (strategy.client_profiles as any)?.id;
      if (profileId) {
        const updatePayload: any = {};
        if (updates.client_profiles) {
          const incomingProfile: any = updates.client_profiles;
          if (incomingProfile.intelligence_profile !== undefined) {
            updatePayload.intelligence_profile = incomingProfile.intelligence_profile;
          }
          if (incomingProfile.commercial_config !== undefined) {
            updatePayload.commercial_config = incomingProfile.commercial_config;
          }
        }

        if (Object.keys(updatePayload).length > 0) {
          const { error } = await supabase
            .from('client_profiles')
            .update(updatePayload)
            .eq('id', profileId);

          if (error) throw error;
        }
      } else {
        throw new Error("Cannot update: client_profiles ID not found");
      }
    }

    // Refresh strategy to get the updated data
    await loadStrategy();
  }

  async function createStrategy(slug: string, name: string, intelligenceProfile: Record<string, any>) {
    // Insert new client_strategies row
    const { data: newStrategy, error: stratError } = await supabase
      .from('client_strategies')
      .insert({ slug, name, config: {}, sourcing_criteria: {} })
      .select()
      .single();

    if (stratError) throw stratError;

    // Insert new client_profiles row
    const { error: profileError } = await supabase
      .from('client_profiles')
      .insert({ strategy_id: newStrategy.id, intelligence_profile: intelligenceProfile });

    if (profileError) throw profileError;

    // Switch to the new context
    setActiveContext(slug);
    // loadStrategy will fire via the useEffect on activeContext change
  }

  const isOperator = user?.email === OPERATOR_EMAIL;

  // Non-operators only see their own context — no switcher
  const allContexts = isOperator
    ? (operatorContexts.length > 0 ? operatorContexts : getContextArray(user?.client_context))
    : getContextArray(user?.client_context);
  const visibleContexts = isOperator ? allContexts : allContexts.slice(0, 1);

  // Parse features from strategy — new schema stores them in config.features,
  // legacy schema stored them at strategy.features. Check both paths.
  const features: ClientFeatures = {
    ...DEFAULT_FEATURES,
    ...(((strategy as any)?.config?.features) ?? ((strategy as any)?.features) ?? {}),
  };

  return (
    <ClientStrategyContext.Provider value={{
      strategy,
      leadsTable,
      loading,
      companies,
      setCompanies,
      refreshCompanies,
      lastFetched,
      activeContext,
      setActiveContext,
      availableContexts: visibleContexts,
      features,
      isOperator,
      refreshStrategy: loadStrategy,
      updateStrategy,
      createStrategy,
      error
    }}>
      {children}
    </ClientStrategyContext.Provider>
  );
}

export function useClientStrategy() {
  const context = useContext(ClientStrategyContext);
  if (context === undefined) {
    throw new Error('useClientStrategy must be used within a ClientStrategyProvider');
  }
  return context;
}
