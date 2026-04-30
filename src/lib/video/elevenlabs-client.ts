/**
 * ElevenLabs Text-to-Speech client.
 *
 * Used for high-realism video narration with cloned founder voice.
 * Docs: https://docs.elevenlabs.io/api-reference
 */

export interface ElevenLabsVoiceSettings {
  stability: number; // 0.0 - 1.0
  similarity_boost: number; // 0.0 - 1.0
  style?: number; // 0.0 - 1.0 (style exaggeration)
  use_speaker_boost?: boolean;
}

export interface TTSOptions {
  voiceId: string;
  text: string;
  modelId?: string;
  voiceSettings?: ElevenLabsVoiceSettings;
  outputFormat?: "mp3_44100_128" | "mp3_22050_32" | "pcm_16000" | "pcm_24000";
}

export interface VoiceInfo {
  voice_id: string;
  name: string;
  category: string;
  labels: Record<string, string>;
}

export class ElevenLabsClient {
  private baseUrl = "https://api.elevenlabs.io/v1";
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * Generate speech audio from text using a specific voice.
   * Returns raw audio buffer (mp3 or pcm depending on outputFormat).
   */
  async textToSpeech(options: TTSOptions): Promise<ArrayBuffer> {
    const {
      voiceId,
      text,
      modelId = "eleven_multilingual_v2",
      voiceSettings,
      outputFormat = "mp3_44100_128",
    } = options;

    const response = await fetch(
      `${this.baseUrl}/text-to-speech/${voiceId}?output_format=${outputFormat}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": this.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text,
          model_id: modelId,
          voice_settings: voiceSettings ?? {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.0,
            use_speaker_boost: true,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `ElevenLabs TTS failed (${response.status}): ${errorText}`
      );
    }

    return response.arrayBuffer();
  }

  /**
   * Stream speech audio (returns a ReadableStream for progressive playback).
   */
  async textToSpeechStream(options: TTSOptions): Promise<ReadableStream<Uint8Array>> {
    const {
      voiceId,
      text,
      modelId = "eleven_multilingual_v2",
      voiceSettings,
      outputFormat = "mp3_44100_128",
    } = options;

    const response = await fetch(
      `${this.baseUrl}/text-to-speech/${voiceId}/stream?output_format=${outputFormat}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": this.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text,
          model_id: modelId,
          voice_settings: voiceSettings,
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `ElevenLabs TTS stream failed (${response.status}): ${errorText}`
      );
    }

    if (!response.body) {
      throw new Error("No response body from ElevenLabs stream");
    }

    return response.body;
  }

  /**
   * List available voices (includes cloned voices).
   */
  async listVoices(): Promise<VoiceInfo[]> {
    const response = await fetch(`${this.baseUrl}/voices`, {
      headers: { "xi-api-key": this.apiKey },
    });

    if (!response.ok) {
      throw new Error(`ElevenLabs list voices failed: ${response.status}`);
    }

    const data = (await response.json()) as { voices: VoiceInfo[] };
    return data.voices;
  }

  /**
   * Get voice details by ID.
   */
  async getVoice(voiceId: string): Promise<VoiceInfo> {
    const response = await fetch(`${this.baseUrl}/voices/${voiceId}`, {
      headers: { "xi-api-key": this.apiKey },
    });

    if (!response.ok) {
      throw new Error(`ElevenLabs get voice failed: ${response.status}`);
    }

    return response.json() as Promise<VoiceInfo>;
  }

  /**
   * Check remaining character quota.
   */
  async getSubscriptionInfo(): Promise<{
    character_count: number;
    character_limit: number;
    next_character_count_reset_unix: number;
  }> {
    const response = await fetch(`${this.baseUrl}/user/subscription`, {
      headers: { "xi-api-key": this.apiKey },
    });

    if (!response.ok) {
      throw new Error(
        `ElevenLabs subscription check failed: ${response.status}`
      );
    }

    return response.json() as Promise<{
      character_count: number;
      character_limit: number;
      next_character_count_reset_unix: number;
    }>;
  }
}
