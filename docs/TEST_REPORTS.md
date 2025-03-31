# Test Reports and Notifications

This document describes the test reporting and notification features available in the project.

## Overview

The project includes comprehensive test reporting capabilities with:
- Coverage analysis and trending
- Quality metrics tracking
- Weekly reports
- Email and Slack notifications
- Historical data analysis

## Configuration

### Environment Variables

Set up notifications by configuring these environment variables:

```env
# Email Notifications
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your_email@example.com
SMTP_PASS=your_email_password
SMTP_SECURE=true
EMAIL_RECIPIENTS=team@example.com,admin@example.com

# Slack Notifications
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/your/webhook/url
SLACK_CHANNEL=#test-reports
```

## Available Commands

### Generate Reports

```bash
# Generate weekly report
npm run report:weekly

# View latest report
npm run report:view

# Generate and view report
npm run report:latest

# Send notifications
npm run report:send    # All configured channels
npm run report:email   # Email only
npm run report:slack   # Slack only

# Archive reports
npm run report:archive
```

### Quality Analysis

```bash
# Analyze test quality
npm run quality

# View quality report
npm run quality:report

# Analyze trends
npm run quality:trend
npm run quality:trend:week
npm run quality:trend:month
npm run quality:trend:quarter
```

### Coverage Reports

```bash
# Generate coverage report
npm run coverage

# View coverage report in browser
npm run coverage:open

# Generate coverage badges
npm run coverage:badges
```

## Report Types

### Weekly Report

Contains:
- Overall test statistics
- Coverage metrics
- Quality trends
- Recent test-related commits
- Recommendations for improvement

Example:
```
Weekly Test Quality Report
======================

Coverage Metrics
---------------
Lines: 85.00%
Functions: 90.00%
Branches: 80.00%

Quality Metrics
--------------
Test/Code Ratio: 0.45
Flakiness: 2.5%
Maintainability: 85

Recommendations
--------------
• Add more branch coverage
• Fix 3 flaky tests
• Increase test/code ratio
```

### Quality Report

Includes:
- Code complexity metrics
- Test maintainability scores
- Flakiness analysis
- Uncovered code sections
- Quality trends

### Trend Analysis

Analyzes:
- Coverage changes over time
- Quality metric trends
- Test reliability patterns
- Commit impact on quality

## Notifications

### Email Notifications

- HTML-formatted reports
- Configurable recipients
- Optional attachments
- Weekly digests
- Critical alerts

### Slack Notifications

- Rich message formatting
- Channel-specific reporting
- Interactive elements
- Real-time alerts
- Thread-based discussions

## Best Practices

1. **Regular Monitoring**
   - Review weekly reports
   - Track quality trends
   - Address declining metrics

2. **Quality Thresholds**
   ```bash
   # Verify quality meets standards
   npm run verify:quality
   npm run verify:trends
   ```

3. **Historical Analysis**
   - Keep report archives
   - Monitor long-term trends
   - Track improvement initiatives

4. **CI/CD Integration**
   ```bash
   # Generate reports in CI
   npm run ci:quality
   npm run ci:report
   ```

## Report Storage

Reports are stored in:
- `reports/` - Weekly reports
- `coverage/` - Coverage data
- `test-results/` - Test execution data

## Extending Reports

### Custom Metrics

Add custom metrics by modifying:
- `scripts/analyze-test-quality.ts`
- `scripts/generate-weekly-report.ts`

### Custom Notifications

Add new notification channels in:
- `scripts/utils/notifications.ts`

## Troubleshooting

Common issues:

1. **Missing Reports**
   ```bash
   # Regenerate reports
   npm run report:weekly --force
   ```

2. **Notification Failures**
   ```bash
   # Verify configuration
   npm run verify:env
   ```

3. **Invalid Data**
   ```bash
   # Clean and regenerate
   npm run clean:reports
   npm run report:all
   ```

## Further Reading

- [Contributing Guide](CONTRIBUTING.md)
- [Test Strategy](TEST_STRATEGY.md)
- [Quality Standards](QUALITY_STANDARDS.md)