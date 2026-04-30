/**
 * Reunion API Client
 *
 * Communicates with the Reunion family platform API.
 * Used to push campaigns, invite reminders, reactivation messages,
 * and sync engagement data back into GrowthOS.
 */

export interface ReunionSegment {
  type: "all" | "active" | "inactive" | "new" | "custom";
  inactiveDays?: number;
  familySize?: { min?: number; max?: number };
  joinedAfter?: string;
  joinedBefore?: string;
  customFilter?: Record<string, unknown>;
}

export interface ReunionPushPayload {
  campaignId: string;
  title: string;
  body: string;
  cta?: string;
  deeplink?: string;
  imageUrl?: string;
  segment: ReunionSegment;
  scheduledFor?: string; // ISO 8601
}

export interface ReunionCampaignResult {
  reunionCampaignId: string;
  sentCount: number;
  estimatedReach: number;
  status: "queued" | "sending" | "sent" | "failed";
}

export interface ReunionEngagementStats {
  campaignId: string;
  sentCount: number;
  openedCount: number;
  clickedCount: number;
  convertedCount: number;
}

export interface ReunionUserStats {
  totalUsers: number;
  activeUsers30d: number;
  newUsers7d: number;
  churnRate: number;
}

export class ReunionClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.apiKey = apiKey;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
    };

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `Reunion API error ${response.status}: ${errorBody}`
      );
    }

    return response.json() as Promise<T>;
  }

  // ─── Campaigns ───

  /**
   * Send a push notification campaign to a segment of Reunion users.
   */
  async sendPushCampaign(
    payload: ReunionPushPayload
  ): Promise<ReunionCampaignResult> {
    return this.request<ReunionCampaignResult>(
      "POST",
      "/api/v1/campaigns/push",
      payload
    );
  }

  /**
   * Send invite reminders to users who haven't invited family members.
   */
  async sendInviteReminders(payload: {
    campaignId: string;
    title: string;
    body: string;
    maxInvitesSent?: number; // only target users who've sent fewer than N invites
  }): Promise<ReunionCampaignResult> {
    return this.request<ReunionCampaignResult>(
      "POST",
      "/api/v1/campaigns/invite-reminders",
      payload
    );
  }

  /**
   * Send reactivation messages to inactive users.
   */
  async sendReactivation(payload: {
    campaignId: string;
    title: string;
    body: string;
    inactiveDays: number;
    deeplink?: string;
  }): Promise<ReunionCampaignResult> {
    return this.request<ReunionCampaignResult>(
      "POST",
      "/api/v1/campaigns/reactivation",
      payload
    );
  }

  // ─── Stats ───

  /**
   * Get engagement stats for a previously sent campaign.
   */
  async getCampaignStats(
    reunionCampaignId: string
  ): Promise<ReunionEngagementStats> {
    return this.request<ReunionEngagementStats>(
      "GET",
      `/api/v1/campaigns/${reunionCampaignId}/stats`
    );
  }

  /**
   * Get overall Reunion user stats for the workspace.
   */
  async getUserStats(): Promise<ReunionUserStats> {
    return this.request<ReunionUserStats>("GET", "/api/v1/stats/users");
  }

  /**
   * Verify a webhook signature from Reunion.
   */
  static async verifyWebhook(
    payload: string,
    signatureHeader: string,
    secret: string
  ): Promise<boolean> {
    const parts = signatureHeader.split(",");
    const timestamp = parts.find((p) => p.startsWith("t="))?.substring(2);
    const signature = parts.find((p) => p.startsWith("v1="))?.substring(3);

    if (!timestamp || !signature) return false;

    // 5-minute tolerance
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - parseInt(timestamp)) > 300) return false;

    const signedPayload = `${timestamp}.${payload}`;
    const encoder = new TextEncoder();

    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    const mac = await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(signedPayload)
    );

    const expectedSig = Array.from(new Uint8Array(mac))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    if (expectedSig.length !== signature.length) return false;

    let mismatch = 0;
    for (let i = 0; i < expectedSig.length; i++) {
      mismatch |= expectedSig.charCodeAt(i) ^ signature.charCodeAt(i);
    }

    return mismatch === 0;
  }
}
