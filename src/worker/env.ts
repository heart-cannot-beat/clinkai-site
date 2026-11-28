// Worker 用到的 Cloudflare 绑定和配置。
// 绑定的类型按 Cloudflare 官方文档手写了最小子集，没有引 @cloudflare/workers-types：
// - 发信：https://developers.cloudflare.com/email-service/api/send-emails/workers-api/
// - 限流：https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/
// - 静态资源：https://developers.cloudflare.com/workers/static-assets/binding/

/** Email Service `send()` 的结构化消息（只列了用到的字段） */
export interface EmailMessageBuilder {
  to: string;
  from: string;
  subject: string;
  text?: string;
  html?: string;
  replyTo?: string;
}

export interface SendEmail {
  send(message: EmailMessageBuilder): Promise<{ messageId: string }>;
}

export interface RateLimit {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface AssetsFetcher {
  fetch(request: Request): Promise<Response>;
}

export interface Env {
  /** wrangler.jsonc 的 assets.binding */
  ASSETS: AssetsFetcher;
  /** wrangler.jsonc 的 send_email */
  EMAIL: SendEmail;
  /** wrangler.jsonc 的 ratelimits */
  CONTACT_RATE_LIMITER: RateLimit;
  /** 收件地址。Cloudflare secret；本地放 .dev.vars */
  CONTACT_TO?: string;
  /** 发件地址，必须在已接入 Email Service 的域名下。Cloudflare secret；本地放 .dev.vars */
  CONTACT_FROM?: string;
}
