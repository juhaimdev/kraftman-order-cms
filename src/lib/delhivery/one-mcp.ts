import "server-only";
import { cacheGet, cachePut } from "../cache";
import type { WalletSummary } from "../db/types";

interface DelhiveryMcpConfig {
  clientId: string;
  clientSecret: string;
  authUrl: string;
  realm: string;
  clientCms: string;
  mcpUrl: string;
}

export async function getMcpConfig(): Promise<DelhiveryMcpConfig | null> {
  const clientId = process.env.D1_CLIENT_ID?.trim() || "";
  const clientSecret = process.env.D1_CLIENT_SECRET?.trim() || "";
  const authUrl = process.env.D1_AUTH_URL?.trim() || "";
  const realm = process.env.D1_REALM?.trim() || "";
  const clientCms = process.env.D1_CLIENT_CMS?.trim() || "";
  const mcpUrl = process.env.D1_MCP_URL?.trim() || "";

  if (!clientId || !clientSecret || !authUrl || !realm || !clientCms || !mcpUrl) {
    return null;
  }

  return { clientId, clientSecret, authUrl, realm, clientCms, mcpUrl };
}

async function mintAccessToken(cfg: DelhiveryMcpConfig): Promise<string> {
  const cacheKey = `d1mcp:token:${cfg.realm}`;
  const cached = await cacheGet<{ access_token: string }>(cacheKey);
  if (cached?.access_token) {
    return cached.access_token;
  }

  const tokenUrl = `${cfg.authUrl.replace(/\/$/, "")}/realms/${cfg.realm}/protocol/openid-connect/token`;
  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
    }).toString(),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    throw new Error(`Delhivery One OAuth failed (${res.status} ${res.statusText})`);
  }

  const data = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
  };
  if (!data.access_token) {
    throw new Error("Delhivery One OAuth response missing access_token");
  }

  const ttl = Math.max(30, (data.expires_in ?? 300) - 30);
  await cachePut(cacheKey, { access_token: data.access_token }, ttl);
  return data.access_token;
}

export async function callDelhiveryOneMcpTool<T = Record<string, unknown>>(
  name: string,
  args: Record<string, unknown> = {}
): Promise<T> {
  const cfg = await getMcpConfig();
  if (!cfg) {
    throw new Error(
      "Delhivery One MCP credentials (D1_CLIENT_ID / D1_CLIENT_SECRET / D1_MCP_URL) are not configured."
    );
  }

  const token = await mintAccessToken(cfg);
  const res = await fetch(cfg.mcpUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "x-hq-client-id": cfg.clientCms,
      "X-UCP-User-Email": "--",
      "X-UCP-Realm": cfg.realm,
      "X-Request-ID": crypto.randomUUID(),
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name, arguments: args },
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(
      `Delhivery One MCP error (${res.status}): ${errText.slice(0, 180)}`
    );
  }

  const rawText = await res.text();
  const dataLine = rawText
    .split("\n")
    .find((line) => line.startsWith("data: "));
  const rpc = JSON.parse(dataLine ? dataLine.slice(6) : rawText) as {
    result?: { content?: Array<{ text?: string }> };
    error?: { message?: string };
  };

  if (rpc.error) {
    throw new Error(rpc.error.message || `MCP tool ${name} failed`);
  }

  const innerText = rpc.result?.content?.[0]?.text;
  if (!innerText) {
    return (rpc.result ?? {}) as T;
  }

  try {
    return JSON.parse(innerText) as T;
  } catch {
    throw new Error(innerText.slice(0, 200));
  }
}

/**
 * Fetches live Delhivery One prepaid wallet balance with a 90s warm cache
 * so dashboard page loads remain fast while staying near real-time.
 */
export async function getWalletDetailsCached(
  forceRefresh = false
): Promise<WalletSummary | null> {
  const cfg = await getMcpConfig();
  if (!cfg) return null;

  const cacheKey = `d1mcp:wallet:${cfg.realm}`;
  if (!forceRefresh) {
    const hit = await cacheGet<WalletSummary>(cacheKey);
    if (hit) return { ...hit, cached: true };
  }

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await callDelhiveryOneMcpTool<{
        current_balance?: number;
        minimum_threshold?: number;
        maximum_threshold?: number;
        is_active?: boolean;
        payment_gateway?: string;
      }>("get-wallet-details", {});

      if (typeof res?.current_balance !== "number") continue;

      const summary: WalletSummary = {
        current_balance: res.current_balance,
        minimum_threshold: Number(res.minimum_threshold ?? 0),
        maximum_threshold: Number(res.maximum_threshold ?? 0),
        is_active: Boolean(res.is_active ?? true),
        payment_gateway: res.payment_gateway,
        cached: false,
      };
      await cachePut(cacheKey, summary, 90);
      return summary;
    } catch {
      // Retry once on transient MCP/auth timeout
    }
  }
  return null;
}

export async function getDefaultSellerAddressCached(): Promise<{
  sellerName: string;
  sellerAddress: string;
}> {
  const fallback = {
    sellerName: process.env.DELHIVERY_PICKUP_LOCATION?.trim() || "Kraftman",
    sellerAddress:
      "valiyapramba po nellikkaparamba mukkom , Thazhecode, Kerala, India, 673602",
  };

  const cfg = await getMcpConfig();
  if (!cfg) return fallback;

  const cacheKey = `d1mcp:seller-addr:${cfg.realm}`;
  const cached = await cacheGet<{ sellerName: string; sellerAddress: string }>(
    cacheKey
  );
  if (cached) return cached;

  try {
    const res = await callDelhiveryOneMcpTool<{
      results?: Array<{
        facility_name?: string;
        address?: {
          address_line1?: string;
          address_line2?: string | null;
          city?: string;
          state?: string;
          pin_code?: string;
        };
      }>;
    }>("list-pickup-locations", {
      search_on: ["facility_name"],
      search_term: "",
      page_size: 5,
      page: 1,
      field: "updated_at",
      direction: "DESC",
      op: "GTE",
      value: "",
      range_updated_at_op: "GTE",
      range_updated_at_value: "",
    });

    const first = res?.results?.[0];
    if (first?.address) {
      const a = first.address;
      const line = [a.address_line1, a.address_line2, a.city, a.state, "India", a.pin_code]
        .filter(Boolean)
        .join(", ");
      const info = {
        sellerName: first.facility_name || fallback.sellerName,
        sellerAddress: line || fallback.sellerAddress,
      };
      await cachePut(cacheKey, info, 300);
      return info;
    }
  } catch {
    // Non-fatal fallback
  }

  return fallback;
}

