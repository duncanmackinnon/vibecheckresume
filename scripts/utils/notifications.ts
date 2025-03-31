import nodemailer from 'nodemailer';
import { IncomingWebhook } from '@slack/webhook';

interface EmailConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
}

interface EmailOptions {
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

/**
 * Send email notification
 */
export async function sendEmail(config: EmailConfig, options: EmailOptions): Promise<void> {
  const transporter = nodemailer.createTransport(config);

  try {
    await transporter.verify();
    await transporter.sendMail(options);
  } catch (error) {
    console.error('Failed to send email:', error);
    throw error;
  }
}

/**
 * Format report for email
 */
export function formatEmailReport(reportText: string): string {
  const html = reportText
    .split('\n')
    .map(line => {
      if (line.startsWith('#')) {
        return `<h2>${line.replace('#', '')}</h2>`;
      }
      if (line.startsWith('•')) {
        return `<li>${line.replace('•', '')}</li>`;
      }
      if (line.match(/^[A-Z].*:/)) {
        return `<strong>${line}</strong>`;
      }
      if (line === '') {
        return '<br>';
      }
      return line;
    })
    .join('\n');

  return `
    <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; }
          h2 { color: #2c3e50; border-bottom: 1px solid #eee; }
          li { margin: 5px 0; }
          .success { color: #27ae60; }
          .warning { color: #f39c12; }
          .error { color: #c0392b; }
        </style>
      </head>
      <body>
        ${html}
      </body>
    </html>
  `;
}

/**
 * Format report for Slack
 */
export function formatSlackReport(reportText: string): Record<string, any> {
  const sections = reportText.split('\n\n');
  const blocks: any[] = [];

  sections.forEach(section => {
    const lines = section.split('\n');
    const header = lines[0];

    if (header.match(/={2,}/)) {
      // Main title
      blocks.push({
        type: 'header',
        text: {
          type: 'plain_text',
          text: lines[0]
        }
      });
    } else if (header.match(/-{2,}/)) {
      // Section header
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${header}*`
        }
      });
    } else {
      // Regular section
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: section
            .replace(/•/g, '•')
            .replace(/(improving)/gi, ':arrow_up: $1')
            .replace(/(declining|failing)/gi, ':arrow_down: $1')
            .replace(/(stable)/gi, ':heavy_minus_sign: $1')
            .replace(/(\d+\.?\d*%)/g, '`$1`')
        }
      });
    }
  });

  return {
    blocks,
    text: 'Weekly Test Quality Report'
  };
}

/**
 * Send Slack notification
 */
export async function sendSlackNotification(
  webhookUrl: string,
  message: Record<string, any>
): Promise<void> {
  const webhook = new IncomingWebhook(webhookUrl);

  try {
    await webhook.send(message);
  } catch (error) {
    console.error('Failed to send Slack notification:', error);
    throw error;
  }
}

/**
 * Send notifications using configured methods
 */
export async function sendNotifications(
  reportText: string,
  options: {
    email?: {
      config: EmailConfig;
      recipients: string[];
    };
    slack?: {
      webhookUrl: string;
    };
  }
): Promise<void> {
  const promises: Promise<void>[] = [];

  // Send email if configured
  if (options.email) {
    const html = formatEmailReport(reportText);
    const emailPromise = sendEmail(options.email.config, {
      from: options.email.config.auth.user,
      to: options.email.recipients,
      subject: 'Weekly Test Quality Report',
      html,
      text: reportText
    });
    promises.push(emailPromise);
  }

  // Send Slack notification if configured
  if (options.slack) {
    const slackMessage = formatSlackReport(reportText);
    const slackPromise = sendSlackNotification(options.slack.webhookUrl, slackMessage);
    promises.push(slackPromise);
  }

  // Wait for all notifications to be sent
  await Promise.all(promises);
}

// Helper for checking if notifications are configured
export function getNotificationConfig() {
  const config: {
    email?: {
      config: EmailConfig;
      recipients: string[];
    };
    slack?: {
      webhookUrl: string;
    };
  } = {};

  // Check email configuration
  if (
    process.env.SMTP_HOST &&
    process.env.SMTP_PORT &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASS &&
    process.env.EMAIL_RECIPIENTS
  ) {
    config.email = {
      config: {
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT),
        secure: true,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        }
      },
      recipients: process.env.EMAIL_RECIPIENTS.split(',')
    };
  }

  // Check Slack configuration
  if (process.env.SLACK_WEBHOOK_URL) {
    config.slack = {
      webhookUrl: process.env.SLACK_WEBHOOK_URL
    };
  }

  return config;
}