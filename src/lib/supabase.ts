import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

// True only when both env vars are present at runtime.
// App.tsx uses this flag to route to ConfigurationError when false.
export const isSupabaseConfigured = !!(supabaseUrl && supabaseAnonKey);

// createClient requires non-empty strings even if we never make real calls.
// Use a safe placeholder so the module doesn't throw on import when unconfigured.
export const supabase = createClient(
  supabaseUrl ?? 'https://placeholder.supabase.co',
  supabaseAnonKey ?? 'placeholder-anon-key',
);

/**
 * Standard headers for browser → Edge Function calls that forward the signed-in user's JWT.
 * Supabase expects the anon `apikey` header in addition to `Authorization` for consistent gateway behavior.
 */
export function edgeInvokeHeaders(accessToken: string | null | undefined): Record<string, string> | null {
  const token = accessToken?.trim();
  if (!token || !supabaseAnonKey || supabaseAnonKey === 'placeholder-anon-key') {
    return null;
  }
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    apikey: supabaseAnonKey,
  };
}

/** Edge calls that authenticate with the anon key only (no user session). */
export function edgeAnonInvokeHeaders(): Record<string, string> | null {
  if (!supabaseAnonKey || supabaseAnonKey === 'placeholder-anon-key') {
    return null;
  }
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${supabaseAnonKey}`,
    apikey: supabaseAnonKey,
  };
}

export type User = {
  id: string;
  email: string;
  full_name: string | null;
  role: 'admin' | 'user';
  email_signoff: string | null;
  client_context: string[];
  created_at: string;
  updated_at: string;
};

export type Company = {
  id: string;
  name: string;
  industry: string | null;
  created_at: string;
};

export type Contact = {
  id: string;
  company_id: string;
  name: string;
  role_title: string;
  email: string;
  created_at: string;
};

export type OutboundEmail = {
  id: string;
  company_id: string;
  contact_id: string;
  subject: string;
  body_preview: string;
  sent_at: string;
  status: 'sent' | 'opened' | 'replied' | 'closed';
  created_at: string;
};

export type InboundReply = {
  id: string;
  outbound_email_id: string;
  from_email: string;
  body_preview: string;
  received_at: string;
  handled: boolean;
  created_at: string;
};

export type InsightContent = {
  company_overview: string;
  recent_signals: string[];
  market_context: string;
  hypothesis: string;
  open_questions: string[];
  why_this_matters: string;
};

export type Insight = {
  id: string;
  company_id: string;
  status: 'draft' | 'approved' | 'discarded';
  version: number;
  content: InsightContent;
  created_at: string;
  approved_at: string | null;
  approved_by: string | null;
  updated_at: string;
};

export type ActionLog = {
  id: string;
  user_id: string;
  company_id: string;
  insight_id: string | null;
  action_type: 'generate' | 'approve' | 'discard' | 'regenerate' | 'edit' | 'save_draft';
  metadata: Record<string, any> | null;
  timestamp: string;
};

export type Delivery = {
  id: string;
  insight_id: string;
  contact_id: string;
  sent_by: string;
  sent_at: string;
  status: 'sent' | 'failed' | 'bounced';
  email_body: string;
  subject: string;
  metadata: Record<string, any> | null;
  created_at: string;
};

export type EngagementEvent = {
  id: string;
  delivery_id: string;
  event_type: 'opened' | 'clicked' | 'replied';
  timestamp: string;
  metadata: Record<string, any> | null;
  created_at: string;
};
