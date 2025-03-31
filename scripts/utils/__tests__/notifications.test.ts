import {
  sendEmail,
  sendSlackNotification,
  formatEmailReport,
  formatSlackReport,
  getNotificationConfig,
  sendNotifications
} from '../notifications';
import nodemailer from 'nodemailer';
import { IncomingWebhook } from '@slack/webhook';

jest.mock('nodemailer');
jest.mock('@slack/webhook');

describe('Notifications Utilities', () => {
  const mockEmailConfig = {
    host: 'smtp.example.com',
    port: 587,
    secure: true,
    auth: {
      user: 'test@example.com',
      pass: 'password123'
    }
  };

  const mockReport = `
Test Quality Report
==================

Coverage Metrics
---------------
Lines: 85.00%
Functions: 90.00%

• Improve test coverage
• Fix flaky tests
`;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('sendEmail', () => {
    const mockTransporter = {
      verify: jest.fn().mockResolvedValue(true),
      sendMail: jest.fn().mockResolvedValue({ messageId: '123' })
    };

    beforeEach(() => {
      (nodemailer.createTransport as jest.Mock).mockReturnValue(mockTransporter);
    });

    it('should send email successfully', async () => {
      const emailOptions = {
        from: 'test@example.com',
        to: 'team@example.com',
        subject: 'Test Report',
        text: mockReport
      };

      await sendEmail(mockEmailConfig, emailOptions);

      expect(mockTransporter.verify).toHaveBeenCalled();
      expect(mockTransporter.sendMail).toHaveBeenCalledWith(emailOptions);
    });

    it('should handle email sending errors', async () => {
      mockTransporter.sendMail.mockRejectedValue(new Error('Send failed'));

      await expect(
        sendEmail(mockEmailConfig, {
          from: 'test@example.com',
          to: 'team@example.com',
          subject: 'Test Report'
        })
      ).rejects.toThrow('Send failed');
    });
  });

  describe('sendSlackNotification', () => {
    const mockWebhook = {
      send: jest.fn().mockResolvedValue(undefined)
    };

    beforeEach(() => {
      (IncomingWebhook as jest.Mock).mockImplementation(() => mockWebhook);
    });

    it('should send Slack notification successfully', async () => {
      const message = {
        text: 'Test message',
        blocks: [{ type: 'section', text: { type: 'plain_text', text: 'Test' } }]
      };

      await sendSlackNotification('https://hooks.slack.com/test', message);

      expect(mockWebhook.send).toHaveBeenCalledWith(message);
    });

    it('should handle Slack notification errors', async () => {
      mockWebhook.send.mockRejectedValue(new Error('Slack error'));

      await expect(
        sendSlackNotification('https://hooks.slack.com/test', { text: 'Test' })
      ).rejects.toThrow('Slack error');
    });
  });

  describe('formatEmailReport', () => {
    it('should format report as HTML', () => {
      const html = formatEmailReport(mockReport);

      expect(html).toContain('<html>');
      expect(html).toContain('<style>');
      expect(html).toContain('<h2>Test Quality Report</h2>');
      expect(html).toContain('<li>Improve test coverage</li>');
    });

    it('should handle different line formats', () => {
      const html = formatEmailReport(mockReport);

      expect(html).toContain('<strong>Lines: 85.00%</strong>');
      expect(html).toContain('<br>');
    });
  });

  describe('formatSlackReport', () => {
    it('should format report for Slack', () => {
      const slackMessage = formatSlackReport(mockReport);

      expect(slackMessage.blocks).toBeDefined();
      expect(slackMessage.blocks).toContainEqual(
        expect.objectContaining({
          type: 'header',
          text: expect.objectContaining({
            text: expect.stringContaining('Test Quality Report')
          })
        })
      );
    });

    it('should format metrics and indicators', () => {
      const slackMessage = formatSlackReport(mockReport);
      const messageText = JSON.stringify(slackMessage);

      expect(messageText).toContain('`85.00%`');
      expect(messageText).toContain('•');
    });
  });

  describe('sendNotifications', () => {
    it('should send notifications through all configured channels', async () => {
      const options = {
        email: {
          config: mockEmailConfig,
          recipients: ['team@example.com']
        },
        slack: {
          webhookUrl: 'https://hooks.slack.com/test'
        }
      };

      await sendNotifications(mockReport, options);

      // Should attempt both email and Slack notifications
      expect(nodemailer.createTransport).toHaveBeenCalled();
      expect(IncomingWebhook).toHaveBeenCalled();
    });

    it('should handle partial configuration', async () => {
      await sendNotifications(mockReport, {
        email: {
          config: mockEmailConfig,
          recipients: ['team@example.com']
        }
      });

      expect(nodemailer.createTransport).toHaveBeenCalled();
      expect(IncomingWebhook).not.toHaveBeenCalled();
    });
  });

  describe('getNotificationConfig', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should return email config when environment variables are set', () => {
      process.env.SMTP_HOST = 'smtp.example.com';
      process.env.SMTP_PORT = '587';
      process.env.SMTP_USER = 'test@example.com';
      process.env.SMTP_PASS = 'password123';
      process.env.EMAIL_RECIPIENTS = 'team@example.com,admin@example.com';

      const config = getNotificationConfig();

      expect(config.email).toBeDefined();
      expect(config.email?.recipients).toHaveLength(2);
    });

    it('should return Slack config when webhook URL is set', () => {
      process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/test';

      const config = getNotificationConfig();

      expect(config.slack).toBeDefined();
      expect(config.slack?.webhookUrl).toBe('https://hooks.slack.com/test');
    });

    it('should return empty config when no variables are set', () => {
      const config = getNotificationConfig();

      expect(config.email).toBeUndefined();
      expect(config.slack).toBeUndefined();
    });
  });
});