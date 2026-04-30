/**
 * Reddit Ads API adapter.
 *
 * Uses Reddit Marketing API v3 for campaign management and metrics.
 * Docs: https://ads-api.reddit.com/docs/
 *
 * Auth: OAuth2 with client_credentials or refresh_token grant.
 */

export interface RedditAdsCampaign {
  id: string;
  name: string;
  status: "ACTIVE" | "PAUSED" | "COMPLETED" | "REMOVED";
  objective: string;
  budget_micros: number;
  spend_micros: number;
  impressions: number;
  clicks: number;
  conversions: number;
  start_time: string;
  end_time: string | null;
}

export interface RedditAdsAdGroup {
  id: string;
  campaign_id: string;
  name: string;
  bid_strategy: string;
  bid_amount_micros: number;
  status: "ACTIVE" | "PAUSED" | "REMOVED";
}

export interface RedditAdsCreative {
  id: string;
  ad_group_id: string;
  headline: string;
  body: string;
  thumbnail_url: string | null;
  click_url: string;
  status: "ACTIVE" | "PAUSED" | "REMOVED";
  impressions: number;
  clicks: number;
  conversions: number;
}

export interface RedditAdsMetrics {
  impressions: number;
  clicks: number;
  spend_micros: number;
  conversions: number;
  ecpm_micros: number;
  ecpc_micros: number;
  ctr: number;
}

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export class RedditAdsClient {
  private baseUrl = "https://ads-api.reddit.com/api/v3";
  private authUrl = "https://www.reddit.com/api/v1/access_token";
  private clientId: string;
  private clientSecret: string;
  private refreshToken: string | null;
  private accessToken: string | null = null;
  private tokenExpiry = 0;

  constructor(options: {
    clientId: string;
    clientSecret: string;
    refreshToken?: string;
    accessToken?: string;
  }) {
    this.clientId = options.clientId;
    this.clientSecret = options.clientSecret;
    this.refreshToken = options.refreshToken ?? null;
    this.accessToken = options.accessToken ?? null;
  }

  // ─── Auth ───

  private async getToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    const credentials = btoa(`${this.clientId}:${this.clientSecret}`);
    const params = new URLSearchParams();

    if (this.refreshToken) {
      params.set("grant_type", "refresh_token");
      params.set("refresh_token", this.refreshToken);
    } else {
      params.set("grant_type", "client_credentials");
    }

    const response = await fetch(this.authUrl, {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "GrowthOS/1.0",
      },
      body: params.toString(),
    });

    if (!response.ok) {
      throw new Error(`Reddit OAuth failed: ${response.status}`);
    }

    const data = (await response.json()) as TokenResponse;
    this.accessToken = data.access_token;
    this.tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
    return this.accessToken;
  }

  private async request<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const token = await this.getToken();
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "User-Agent": "GrowthOS/1.0",
        ...options.headers,
      },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Reddit Ads API error (${response.status}): ${text}`);
    }

    return response.json() as Promise<T>;
  }

  // ─── Campaigns ───

  async listCampaigns(accountId: string): Promise<RedditAdsCampaign[]> {
    const data = await this.request<{ data: RedditAdsCampaign[] }>(
      `/accounts/${accountId}/campaigns`
    );
    return data.data;
  }

  async getCampaign(
    accountId: string,
    campaignId: string
  ): Promise<RedditAdsCampaign> {
    const data = await this.request<{ data: RedditAdsCampaign }>(
      `/accounts/${accountId}/campaigns/${campaignId}`
    );
    return data.data;
  }

  async createCampaign(
    accountId: string,
    payload: {
      name: string;
      objective: string;
      budget_micros: number;
      start_time: string;
      end_time?: string;
    }
  ): Promise<RedditAdsCampaign> {
    const data = await this.request<{ data: RedditAdsCampaign }>(
      `/accounts/${accountId}/campaigns`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      }
    );
    return data.data;
  }

  async updateCampaignStatus(
    accountId: string,
    campaignId: string,
    status: "ACTIVE" | "PAUSED"
  ): Promise<void> {
    await this.request(
      `/accounts/${accountId}/campaigns/${campaignId}`,
      {
        method: "PUT",
        body: JSON.stringify({ status }),
      }
    );
  }

  // ─── Ad Groups ───

  async listAdGroups(
    accountId: string,
    campaignId: string
  ): Promise<RedditAdsAdGroup[]> {
    const data = await this.request<{ data: RedditAdsAdGroup[] }>(
      `/accounts/${accountId}/campaigns/${campaignId}/adgroups`
    );
    return data.data;
  }

  async createAdGroup(
    accountId: string,
    campaignId: string,
    payload: {
      name: string;
      bid_strategy: string;
      bid_amount_micros: number;
      targeting: Record<string, unknown>;
    }
  ): Promise<RedditAdsAdGroup> {
    const data = await this.request<{ data: RedditAdsAdGroup }>(
      `/accounts/${accountId}/campaigns/${campaignId}/adgroups`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      }
    );
    return data.data;
  }

  // ─── Creatives / Ads ───

  async listAds(
    accountId: string,
    adGroupId: string
  ): Promise<RedditAdsCreative[]> {
    const data = await this.request<{ data: RedditAdsCreative[] }>(
      `/accounts/${accountId}/adgroups/${adGroupId}/ads`
    );
    return data.data;
  }

  async createAd(
    accountId: string,
    adGroupId: string,
    payload: {
      headline: string;
      body: string;
      thumbnail_url?: string;
      click_url: string;
    }
  ): Promise<RedditAdsCreative> {
    const data = await this.request<{ data: RedditAdsCreative }>(
      `/accounts/${accountId}/adgroups/${adGroupId}/ads`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      }
    );
    return data.data;
  }

  // ─── Metrics / Reporting ───

  async getCampaignMetrics(
    accountId: string,
    campaignId: string,
    options?: { startDate?: string; endDate?: string }
  ): Promise<RedditAdsMetrics> {
    const params = new URLSearchParams();
    if (options?.startDate) params.set("starts_at", options.startDate);
    if (options?.endDate) params.set("ends_at", options.endDate);

    const query = params.toString() ? `?${params.toString()}` : "";
    const data = await this.request<{ data: RedditAdsMetrics }>(
      `/accounts/${accountId}/campaigns/${campaignId}/metrics${query}`
    );
    return data.data;
  }

  async getAccountMetrics(
    accountId: string,
    options?: { startDate?: string; endDate?: string }
  ): Promise<RedditAdsMetrics> {
    const params = new URLSearchParams();
    if (options?.startDate) params.set("starts_at", options.startDate);
    if (options?.endDate) params.set("ends_at", options.endDate);

    const query = params.toString() ? `?${params.toString()}` : "";
    const data = await this.request<{ data: RedditAdsMetrics }>(
      `/accounts/${accountId}/metrics${query}`
    );
    return data.data;
  }

  // ─── Helpers ───

  /**
   * Map Reddit campaign status to GrowthOS status.
   */
  static mapStatus(
    redditStatus: RedditAdsCampaign["status"]
  ): "draft" | "active" | "paused" | "completed" | "archived" {
    switch (redditStatus) {
      case "ACTIVE":
        return "active";
      case "PAUSED":
        return "paused";
      case "COMPLETED":
        return "completed";
      case "REMOVED":
        return "archived";
      default:
        return "draft";
    }
  }

  /**
   * Map Reddit objective to GrowthOS objective.
   */
  static mapObjective(
    redditObjective: string
  ): "awareness" | "traffic" | "engagement" | "conversions" | "app_installs" {
    const lower = redditObjective.toLowerCase();
    if (lower.includes("brand") || lower.includes("awareness"))
      return "awareness";
    if (lower.includes("traffic") || lower.includes("visit")) return "traffic";
    if (lower.includes("engage") || lower.includes("community"))
      return "engagement";
    if (lower.includes("conversion") || lower.includes("purchase"))
      return "conversions";
    if (lower.includes("install") || lower.includes("app"))
      return "app_installs";
    return "traffic";
  }

  /**
   * Convert micros (1/1,000,000 of a dollar) to cents.
   */
  static microsToCents(micros: number): number {
    return Math.round(micros / 10000);
  }
}
