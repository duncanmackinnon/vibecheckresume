declare module '@slack/webhook' {
  interface WebhookOptions {
    username?: string;
    icon_emoji?: string;
    icon_url?: string;
    channel?: string;
  }

  interface BlockElement {
    type: string;
    text?: {
      type: string;
      text: string;
    };
    elements?: BlockElement[];
    [key: string]: any;
  }

  interface MessageAttachment {
    fallback?: string;
    color?: string;
    pretext?: string;
    author_name?: string;
    author_link?: string;
    author_icon?: string;
    title?: string;
    title_link?: string;
    text?: string;
    fields?: Array<{
      title: string;
      value: string;
      short?: boolean;
    }>;
    image_url?: string;
    thumb_url?: string;
    footer?: string;
    footer_icon?: string;
    ts?: number;
    [key: string]: any;
  }

  interface MessageBlock {
    type: string;
    text?: {
      type: string;
      text: string;
    };
    elements?: BlockElement[];
    [key: string]: any;
  }

  interface WebhookMessage {
    text?: string;
    blocks?: MessageBlock[];
    attachments?: MessageAttachment[];
    thread_ts?: string;
    mrkdwn?: boolean;
    [key: string]: any;
  }

  export class IncomingWebhook {
    constructor(url: string, options?: WebhookOptions);
    send(message: string | WebhookMessage): Promise<void>;
  }
}