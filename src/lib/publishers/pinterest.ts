/**
 * Pinterest API v5 Client
 *
 * Handles Pin creation, board management, and analytics.
 * Uses Pinterest API v5: https://developers.pinterest.com/docs/api/v5/
 *
 * Auth: OAuth2 Bearer token (access_token from connected_accounts)
 *
 * Reunion strategy: 10–25 pins/day
 * Content: family traditions, memory preservation, conversation starters
 * Goal: SEO engine — pins index in Google and Pinterest search
 */

const PINTEREST_API = "https://api.pinterest.com/v5";

// ─── Types ───

export interface PinterestBoard {
  id: string;
  name: string;
  description: string | null;
  pin_count: number;
  follower_count: number;
  privacy: "PUBLIC" | "PROTECTED" | "SECRET";
}

export interface PinterestPin {
  id: string;
  link: string | null;
  title: string | null;
  description: string | null;
  board_id: string;
  created_at: string;
  media: {
    images?: {
      "1200x"?: { url: string; width: number; height: number };
      "600x"?: { url: string; width: number; height: number };
    };
  };
}

export interface PinterestPinMetrics {
  pin_click: number;
  impression: number;
  save: number;
  outbound_click: number;
}

export interface CreatePinOptions {
  /** Pinterest Board ID to post to */
  boardId: string;
  /** Pin title (max 100 chars) */
  title: string;
  /** Pin description (max 500 chars — optimised for SEO/AEO indexing) */
  description: string;
  /** Destination URL when user clicks the pin */
  link?: string;
  /** Publicly accessible image URL (jpg/png/webp, min 100×100px) */
  imageUrl: string;
  /** Alt text for accessibility */
  altText?: string;
  /** Board section ID (optional — organises pin into a section) */
  boardSectionId?: string;
  /** Note to self (not shown publicly) */
  note?: string;
}

export interface CreateVideoPinOptions {
  boardId: string;
  title: string;
  description: string;
  link?: string;
  /** Publicly accessible video URL */
  videoUrl: string;
  /** Cover image URL */
  coverImageUrl?: string;
  altText?: string;
}

// ─── Client ───

export class PinterestClient {
  private accessToken: string;

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  private async request<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const res = await fetch(`${PINTEREST_API}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Pinterest API error (${res.status}): ${text}`);
    }

    return res.json() as Promise<T>;
  }

  // ─── User ───

  /** Get the authenticated user's account info */
  async getUser(): Promise<{ username: string; account_type: string; profile_image: string }> {
    return this.request("/user_account");
  }

  // ─── Boards ───

  /** List all boards for the authenticated user */
  async listBoards(options?: { pageSize?: number; privacy?: "PUBLIC" | "PROTECTED" | "SECRET" | "ALL" }): Promise<PinterestBoard[]> {
    const params = new URLSearchParams();
    params.set("page_size", String(options?.pageSize ?? 25));
    if (options?.privacy) params.set("privacy", options.privacy);

    const data = await this.request<{ items: PinterestBoard[] }>(
      `/boards?${params.toString()}`
    );
    return data.items;
  }

  /** Get a single board by ID */
  async getBoard(boardId: string): Promise<PinterestBoard> {
    return this.request<PinterestBoard>(`/boards/${boardId}`);
  }

  /** Create a new board */
  async createBoard(options: {
    name: string;
    description?: string;
    privacy?: "PUBLIC" | "PROTECTED" | "SECRET";
  }): Promise<PinterestBoard> {
    return this.request<PinterestBoard>("/boards", {
      method: "POST",
      body: JSON.stringify({
        name: options.name,
        description: options.description ?? "",
        privacy: options.privacy ?? "PUBLIC",
      }),
    });
  }

  /** List sections within a board */
  async listBoardSections(boardId: string): Promise<Array<{ id: string; name: string }>> {
    const data = await this.request<{ items: Array<{ id: string; name: string }> }>(
      `/boards/${boardId}/sections`
    );
    return data.items;
  }

  // ─── Pins ───

  /**
   * Create an image pin.
   *
   * For Reunion: pins are the primary SEO/AEO engine.
   * Format description for natural language search indexing.
   */
  async createPin(options: CreatePinOptions): Promise<PinterestPin> {
    const body: Record<string, unknown> = {
      board_id: options.boardId,
      title: options.title.substring(0, 100),
      description: options.description.substring(0, 500),
      media_source: {
        source_type: "image_url",
        url: options.imageUrl,
      },
    };

    if (options.link) body.link = options.link;
    if (options.altText) body.alt_text = options.altText;
    if (options.boardSectionId) body.board_section_id = options.boardSectionId;
    if (options.note) body.note = options.note;

    return this.request<PinterestPin>("/pins", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  /**
   * Create a video pin.
   * Pinterest Trial access supports video pins via URL upload.
   */
  async createVideoPin(options: CreateVideoPinOptions): Promise<PinterestPin> {
    const body: Record<string, unknown> = {
      board_id: options.boardId,
      title: options.title.substring(0, 100),
      description: options.description.substring(0, 500),
      media_source: {
        source_type: "video_id",
        cover_image_url: options.coverImageUrl,
        content_type: "video/mp4",
        data: options.videoUrl,
      },
    };

    if (options.link) body.link = options.link;
    if (options.altText) body.alt_text = options.altText;

    return this.request<PinterestPin>("/pins", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  /** Get a pin by ID */
  async getPin(pinId: string): Promise<PinterestPin> {
    return this.request<PinterestPin>(`/pins/${pinId}`);
  }

  /** List pins on a board (up to pageSize, default 25) */
  async listBoardPins(boardId: string, pageSize = 25): Promise<PinterestPin[]> {
    const data = await this.request<{ items: PinterestPin[] }>(
      `/boards/${boardId}/pins?page_size=${pageSize}`
    );
    return data.items;
  }

  // ─── Analytics ───

  /**
   * Get metrics for a specific pin.
   * Returns clicks, impressions, saves, outbound clicks.
   * Dates in YYYY-MM-DD format.
   */
  async getPinAnalytics(
    pinId: string,
    options: {
      startDate: string; // YYYY-MM-DD
      endDate: string;   // YYYY-MM-DD
      metricTypes?: Array<"IMPRESSION" | "OUTBOUND_CLICK" | "PIN_CLICK" | "SAVE">;
    }
  ): Promise<PinterestPinMetrics> {
    const params = new URLSearchParams({
      start_date: options.startDate,
      end_date: options.endDate,
      metric_types: (options.metricTypes ?? ["IMPRESSION", "OUTBOUND_CLICK", "PIN_CLICK", "SAVE"]).join(","),
    });

    const data = await this.request<{
      value?: { daily_metrics?: Array<{ data_status: string; date: string; metrics: Record<string, number> }> };
    }>(`/pins/${pinId}/analytics?${params.toString()}`);

    // Sum daily metrics into totals
    const totals: PinterestPinMetrics = {
      pin_click: 0,
      impression: 0,
      save: 0,
      outbound_click: 0,
    };

    for (const day of data.value?.daily_metrics ?? []) {
      totals.pin_click += day.metrics.PIN_CLICK ?? 0;
      totals.impression += day.metrics.IMPRESSION ?? 0;
      totals.save += day.metrics.SAVE ?? 0;
      totals.outbound_click += day.metrics.OUTBOUND_CLICK ?? 0;
    }

    return totals;
  }

  /**
   * Get account-level analytics.
   * Useful for dashboard summaries.
   */
  async getAccountAnalytics(options: {
    startDate: string;
    endDate: string;
    metricTypes?: string[];
  }): Promise<Record<string, number>> {
    const params = new URLSearchParams({
      start_date: options.startDate,
      end_date: options.endDate,
      metric_types: (options.metricTypes ?? ["IMPRESSION", "PIN_CLICK_RATE", "SAVE"]).join(","),
    });

    const data = await this.request<{
      all?: { daily_metrics?: Array<{ metrics: Record<string, number> }> };
    }>(`/user_account/analytics?${params.toString()}`);

    const totals: Record<string, number> = {};
    for (const day of data.all?.daily_metrics ?? []) {
      for (const [key, value] of Object.entries(day.metrics)) {
        totals[key] = (totals[key] ?? 0) + (value ?? 0);
      }
    }
    return totals;
  }

  // ─── Helpers ───

  /**
   * Format a Pin description for maximum AEO/SEO indexing.
   *
   * Pinterest descriptions are indexed by Google and Pinterest search.
   * Best practice: natural language, 150–300 chars, include keywords
   * and a soft CTA. Hashtags at the end (max 5).
   */
  static formatDescription(text: string, hashtags: string[] = []): string {
    const body = text.substring(0, 450);
    if (hashtags.length === 0) return body;
    const tags = hashtags
      .slice(0, 5)
      .map((h) => (h.startsWith("#") ? h : `#${h}`))
      .join(" ");
    return `${body} ${tags}`.substring(0, 500);
  }

  /**
   * Build a board name from a content pillar.
   * Used when auto-creating boards per content category.
   */
  static boardNameFromPillar(pillar: string): string {
    const map: Record<string, string> = {
      memory_legacy: "Family Memories & Legacy",
      modern_fragmentation: "Modern Family Life",
      participation: "Family Activities & Games",
      humor: "Family Humor",
      human_connection: "Family Connection & Belonging",
    };
    return map[pillar] ?? pillar;
  }
}
