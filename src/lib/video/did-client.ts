/**
 * D-ID API Client — Talking Head Avatar Videos
 *
 * Docs: https://docs.d-id.com/reference/createtalk
 *
 * Flow:
 *   1. POST /talks — submit presenter image + script → get talk_id
 *   2. GET /talks/:id — poll until status="done" → get result_url
 *   3. Download MP4 from result_url
 */

const DID_API_URL = "https://api.d-id.com";

export interface DidTalkResult {
  id: string;
  status: "created" | "started" | "done" | "error";
  result_url?: string;
  error?: { kind: string; description: string };
}

export class DidClient {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private get headers(): Record<string, string> {
    return {
      Authorization: `Basic ${this.apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    };
  }

  /**
   * Create a talking head video from a presenter image and script.
   *
   * @param sourceUrl     Public URL of the presenter image (face photo)
   * @param script        Text to speak (TTS)
   * @param voiceId       ElevenLabs voice ID (optional — defaults to D-ID's built-in TTS)
   * @param elevenLabsKey ElevenLabs API key (only needed if using ElevenLabs voice)
   */
  async createTalk(options: {
    sourceUrl: string;
    script: string;
    voiceId?: string;
    elevenLabsKey?: string;
    voiceStyle?: string;
  }): Promise<string> {
    const body: Record<string, unknown> = {
      source_url: options.sourceUrl,
      script: {
        type: "text",
        input: options.script,
        ...(options.voiceId && options.elevenLabsKey
          ? {
              provider: {
                type: "elevenlabs",
                voice_id: options.voiceId,
                voice_config: { stability: 0.5, similarity_boost: 0.75 },
              },
            }
          : {
              provider: {
                type: "microsoft",
                voice_id: "en-US-JennyNeural",
              },
            }),
      },
      config: {
        fluent: true,
        pad_audio: 0.0,
        stitch: true,
      },
    };

    const res = await fetch(`${DID_API_URL}/talks`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`D-ID createTalk failed (${res.status}): ${err}`);
    }

    const data = await res.json() as { id: string };
    return data.id;
  }

  /**
   * Poll a talk until done or error. Times out after 5 minutes.
   */
  async pollTalk(talkId: string, timeoutMs = 300_000): Promise<DidTalkResult> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const res = await fetch(`${DID_API_URL}/talks/${talkId}`, {
        headers: this.headers,
      });
      if (!res.ok) throw new Error(`D-ID pollTalk failed (${res.status})`);

      const data = await res.json() as DidTalkResult;
      if (data.status === "done" || data.status === "error") return data;

      await new Promise(r => setTimeout(r, 5000));
    }
    throw new Error("D-ID talk timed out");
  }
}
