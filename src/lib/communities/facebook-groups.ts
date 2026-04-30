/**
 * Facebook Groups API Client
 *
 * Uses the Facebook Graph API to manage groups, post content,
 * create polls, and track membership.
 *
 * Requires:
 * - Page/User access token with groups_access_member_info, publish_to_groups scopes
 * - Group must have the app installed
 *
 * Graph API v21.0
 */

const GRAPH_API_BASE = "https://graph.facebook.com/v21.0";

export interface FacebookGroupInfo {
  id: string;
  name: string;
  description?: string;
  memberCount: number;
  privacy: "OPEN" | "CLOSED" | "SECRET";
  createdTime: string;
}

export interface FacebookGroupPost {
  id: string;
  message: string;
  createdTime: string;
  reactions?: { summary: { total_count: number } };
  comments?: { summary: { total_count: number } };
}

export interface PostToGroupOptions {
  groupId: string;
  message: string;
  link?: string;
  accessToken: string;
}

export interface CreatePollOptions {
  groupId: string;
  question: string;
  options: string[];
  accessToken: string;
}

export class FacebookGroupsClient {
  private accessToken: string;

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  /**
   * Get groups the user/page manages or is a member of.
   */
  async listGroups(): Promise<FacebookGroupInfo[]> {
    const response = await fetch(
      `${GRAPH_API_BASE}/me/groups?fields=id,name,description,member_count,privacy,created_time&access_token=${this.accessToken}`
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Facebook Groups API error: ${error}`);
    }

    const data = (await response.json()) as {
      data: Array<{
        id: string;
        name: string;
        description?: string;
        member_count: number;
        privacy: "OPEN" | "CLOSED" | "SECRET";
        created_time: string;
      }>;
    };

    return data.data.map((g) => ({
      id: g.id,
      name: g.name,
      description: g.description,
      memberCount: g.member_count,
      privacy: g.privacy,
      createdTime: g.created_time,
    }));
  }

  /**
   * Get group details by ID.
   */
  async getGroup(groupId: string): Promise<FacebookGroupInfo> {
    const response = await fetch(
      `${GRAPH_API_BASE}/${groupId}?fields=id,name,description,member_count,privacy,created_time&access_token=${this.accessToken}`
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Facebook Groups API error: ${error}`);
    }

    const g = (await response.json()) as {
      id: string;
      name: string;
      description?: string;
      member_count: number;
      privacy: "OPEN" | "CLOSED" | "SECRET";
      created_time: string;
    };

    return {
      id: g.id,
      name: g.name,
      description: g.description,
      memberCount: g.member_count,
      privacy: g.privacy,
      createdTime: g.created_time,
    };
  }

  /**
   * Post to a group.
   */
  async postToGroup(options: PostToGroupOptions): Promise<string> {
    const params = new URLSearchParams({
      message: options.message,
      access_token: options.accessToken || this.accessToken,
    });

    if (options.link) {
      params.set("link", options.link);
    }

    const response = await fetch(
      `${GRAPH_API_BASE}/${options.groupId}/feed`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to post to group: ${error}`);
    }

    const result = (await response.json()) as { id: string };
    return result.id;
  }

  /**
   * Create a poll in a group.
   * Note: Facebook Graph API poll support is limited.
   * This uses the standard post format with poll-like formatting.
   */
  async createPoll(options: CreatePollOptions): Promise<string> {
    // Facebook doesn't have a dedicated poll API for groups via Graph API.
    // We format it as a structured engagement post with numbered options.
    const pollMessage = [
      `📊 POLL: ${options.question}`,
      "",
      ...options.options.map((opt, i) => `${getEmoji(i)} ${opt}`),
      "",
      "React or comment with your choice!",
    ].join("\n");

    return this.postToGroup({
      groupId: options.groupId,
      message: pollMessage,
      accessToken: options.accessToken || this.accessToken,
    });
  }

  /**
   * Get recent posts from a group.
   */
  async getGroupPosts(
    groupId: string,
    limit = 25
  ): Promise<FacebookGroupPost[]> {
    const response = await fetch(
      `${GRAPH_API_BASE}/${groupId}/feed?fields=id,message,created_time,reactions.summary(true),comments.summary(true)&limit=${limit}&access_token=${this.accessToken}`
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to get group posts: ${error}`);
    }

    const data = (await response.json()) as {
      data: Array<{
        id: string;
        message?: string;
        created_time: string;
        reactions?: { summary: { total_count: number } };
        comments?: { summary: { total_count: number } };
      }>;
    };

    return data.data.map((p) => ({
      id: p.id,
      message: p.message ?? "",
      createdTime: p.created_time,
      reactions: p.reactions,
      comments: p.comments,
    }));
  }

  /**
   * Get group member count (used for growth tracking).
   */
  async getMemberCount(groupId: string): Promise<number> {
    const response = await fetch(
      `${GRAPH_API_BASE}/${groupId}?fields=member_count&access_token=${this.accessToken}`
    );

    if (!response.ok) return 0;

    const data = (await response.json()) as { member_count?: number };
    return data.member_count ?? 0;
  }
}

function getEmoji(index: number): string {
  const emojis = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"];
  return emojis[index] ?? `${index + 1}.`;
}
