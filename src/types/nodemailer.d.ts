declare module 'nodemailer' {
  interface Transport {
    name: string;
    version: string;
    send: Function;
  }

  interface TransportOptions {
    host: string;
    port: number;
    secure?: boolean;
    auth: {
      user: string;
      pass: string;
    };
  }

  interface Envelope {
    from: string;
    to: string[];
  }

  interface MailOptions {
    from: string;
    to: string | string[];
    subject: string;
    text?: string;
    html?: string;
    attachments?: Array<{
      filename: string;
      content: string | Buffer;
    }>;
  }

  interface SentMessageInfo {
    accepted: string[];
    rejected: string[];
    envelopeTime: number;
    messageTime: number;
    messageSize: number;
    response: string;
    envelope: Envelope;
    messageId: string;
  }

  interface Transporter {
    verify(): Promise<boolean>;
    sendMail(options: MailOptions): Promise<SentMessageInfo>;
  }

  function createTransport(options: TransportOptions): Transporter;

  export = {
    createTransport
  };
}