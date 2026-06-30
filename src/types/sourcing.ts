export type SourcingCriteria = {
  icp_industries: string[];
  icp_location: string;
  icp_keywords: string[];
  icp_negative_keywords: string[];
  icp_constraints: string[];
  target_count: number;
};

/** Optional per-client send window for process-queue (see EMAIL_INFRA_RUNBOOK.md). */
export type SendControlsConfig = {
  timezone?: string;
  send_days?: string[];
  send_window_start?: string;
  send_window_end?: string;
  // Backward-compatible UTC form.
  send_days_utc?: number[];
  window_start_hour_utc?: number;
  window_end_hour_utc?: number;
};

export type StrategyConfig = {
  leads_table?: string;
  keywords?: string[];
  hook_context?: string;
  draft_context?: string;
  trigger_types?: string[];
  trigger_prompt?: string;
  daily_scan_limit?: number;
  send_controls?: SendControlsConfig;
  signal_decay_config?: Record<string, number>;
  average_contract_value?: number | null;
  monthly_subscription_cost?: number | null;
  phone_channel_enabled?: boolean;
  /** @deprecated LinkedIn follow-up queue removed from dashboard; field ignored. */
  linkedin_followup_delay_days?: number;
  multi_contact?: {
    enabled?: boolean;
    max_contacts_per_company?: number;
    send_stagger_days?: number;
    title_filters?: string[];
    role_angle_map?: Record<string, string>;
  };
};

export type ClientProfile = {
  id: string;
  strategy_id: string;
  commercial_config: {
    average_deal_size: number;
    currency: string;
    sales_cycle_days: number;
  };
  scoring_config: {
    decision_maker_titles: string[];
    signal_weights: Record<string, number>;
    minimum_score_threshold: number;
    signal_decay_config?: Record<string, number>;
  };
  voice_config: {
    tone: string;
    cta_style: string;
    forbidden_phrases: string[];
    value_proposition: string;
  };
  created_at: string;
  updated_at: string;
};

export type ClientStrategy = {
  id: string;
  slug: string;
  name: string;
  config: StrategyConfig | null;
  sourcing_criteria: SourcingCriteria | null;
  created_at: string;
  updated_at: string;
  // Optional linkage if joined
  client_profiles?: ClientProfile;
};

export type SourcingEngineResponse = {
  success: boolean;
  leads_added: number;
  message: string;
};
