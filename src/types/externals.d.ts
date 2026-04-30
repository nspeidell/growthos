// Type declarations for packages that need npm install
// These will be replaced by actual package types after `npm install`

declare module "clsx" {
  export type ClassValue =
    | ClassArray
    | ClassDictionary
    | string
    | number
    | bigint
    | null
    | boolean
    | undefined;
  export type ClassDictionary = Record<string, unknown>;
  export type ClassArray = ClassValue[];
  export function clsx(...inputs: ClassValue[]): string;
  export default clsx;
}

declare module "tailwind-merge" {
  export function twMerge(...classLists: (string | undefined)[]): string;
}

declare module "class-variance-authority" {
  import type { ClassValue } from "clsx";

  export type VariantProps<T extends (...args: unknown[]) => unknown> = Omit<
    Parameters<T>[0] extends Record<string, unknown>
      ? Parameters<T>[0]
      : never,
    "class" | "className"
  >;

  export function cva(
    base?: ClassValue,
    config?: {
      variants?: Record<string, Record<string, ClassValue>>;
      compoundVariants?: Array<
        Record<string, string | string[]> & { class?: ClassValue; className?: ClassValue }
      >;
      defaultVariants?: Record<string, string>;
    }
  ): (
    props?: Record<string, unknown> & { class?: ClassValue; className?: ClassValue }
  ) => string;
}

declare module "tailwindcss-animate" {
  const plugin: { handler: () => void };
  export default plugin;
}

declare module "resend" {
  export interface CreateEmailOptions {
    from: string;
    to: string | string[];
    subject: string;
    html?: string;
    text?: string;
    reply_to?: string;
    tags?: Array<{ name: string; value: string }>;
  }

  export interface CreateEmailResponse {
    id: string;
  }

  export interface ResendError {
    statusCode: number;
    message: string;
    name: string;
  }

  export class Resend {
    constructor(apiKey: string);
    emails: {
      send(options: CreateEmailOptions): Promise<{ data: CreateEmailResponse | null; error: ResendError | null }>;
    };
  }
}
