/**
 * Ambient module declarations for JS-only packages used by GullyScore.
 */

declare module 'qrcode' {
  interface QrCodeToStringOptions {
    type?: 'svg' | 'utf8' | 'terminal';
    width?: number;
    margin?: number;
    errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
    color?: { dark?: string; light?: string };
  }
  interface QrCodeOptions extends QrCodeToStringOptions {}
  const QRCode: {
    toString(text: string, options?: QrCodeToStringOptions): Promise<string>;
    toDataURL(text: string, options?: QrCodeOptions): Promise<string>;
    toFile(path: string, text: string, options?: QrCodeOptions): Promise<void>;
  };
  export default QRCode;
}

declare module 'web-push' {
  interface PushSubscriptionLike {
    endpoint: string;
    keys: { p256dh: string; auth: string };
  }
  interface SendResult {
    statusCode: number;
    body?: string;
    headers?: Record<string, string>;
  }
  interface RequestOptions {
    TTL?: number;
    urgency?: 'very-low' | 'low' | 'normal' | 'high';
    topic?: string;
  }
  const webpush: {
    setVapidDetails(subject: string, publicKey: string, privateKey: string): void;
    sendNotification(
      subscription: PushSubscriptionLike,
      payload?: string | Buffer,
      options?: RequestOptions
    ): Promise<SendResult>;
    generateVAPIDKeys(): { publicKey: string; privateKey: string };
  };
  export default webpush;
}
