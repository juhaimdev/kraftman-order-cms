declare global {
  namespace NodeJS {
    interface ProcessEnv {
      NEXT_PUBLIC_SUPABASE_URL?: string;
      NEXT_PUBLIC_SUPABASE_ANON_KEY?: string;
      SUPABASE_URL?: string;
      SUPABASE_SERVICE_ROLE_KEY?: string;
      SUPABASE_SECRET_KEY?: string;
      SUPABASE_LABELS_BUCKET?: string;
      DELHIVERY_API_TOKEN?: string;
      DELHIVERY_PICKUP_LOCATION?: string;
      DELHIVERY_ENV?: "staging" | "production";
      DELHIVERY_WEBHOOK_SECRET?: string;
      D1_CLIENT_ID?: string;
      D1_CLIENT_SECRET?: string;
      D1_AUTH_URL?: string;
      D1_REALM?: string;
      D1_CLIENT_CMS?: string;
      D1_MCP_URL?: string;
    }
  }
}

export {};
