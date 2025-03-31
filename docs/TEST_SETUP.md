# Test Setup Guide

This guide explains how to set up and configure the testing environment for the project.

## Quick Start

```bash
# Install dependencies and setup test environment
npm run test:setup

# Verify your setup
npm run test:verify

# Run your first test report
npm run test:report
```

## Initial Setup

The test environment setup script (`scripts/setup-test-env.ts`) will:

1. Create necessary directories
   - `coverage/` - Test coverage reports
   - `test-results/` - Test execution results
   - `reports/` - Quality and trend reports

2. Install required dependencies
   - Test runners and frameworks
   - Coverage tools
   - Notification utilities

3. Configure environment
   - Create/update `.env` file
   - Set up quality thresholds
   - Configure notifications

## Configuration

### Environment Variables

```env
# Test Configuration
NODE_ENV=development
TEST_TIMEOUT=5000

# Quality Thresholds
MIN_COVERAGE=80
MIN_TEST_RATIO=0.5
MAX_FLAKINESS=0.01
QUALITY_THRESHOLD=75

# Notifications
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your-email@example.com
SMTP_PASS=your-password
EMAIL_RECIPIENTS=team@example.com

SLACK_WEBHOOK_URL=https://hooks.slack.com/services/your/webhook/url
SLACK_CHANNEL=#test-reports
```

### Quality Standards

Quality thresholds are defined in `docs/QUALITY_STANDARDS.md`:

```markdown
| Metric     | Minimum | Target |
|------------|---------|--------|
| Lines      | 80%     | 90%    |
| Functions  | 85%     | 95%    |
| Branches   | 75%     | 85%    |
```

## Available Commands

### Basic Testing

```bash
# Run all tests
npm test

# Watch mode for development
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

### Test Categories

```bash
# Component tests
npm run test:components

# API tests
npm run test:api

# Library tests
npm run test:lib

# Integration tests
npm run test:openai
npm run test:errors

# Script tests
npm run test:scripts
```

### Quality Analysis

```bash
# Run quality analysis
npm run quality

# View quality report
npm run quality:report

# Analyze trends
npm run quality:trend
npm run quality:trend:week
npm run quality:trend:month
```

### Reports and Notifications

```bash
# Generate weekly report
npm run report:weekly

# View latest report
npm run report:view

# Send notifications
npm run report:send    # All channels
npm run report:email   # Email only
npm run report:slack   # Slack only
```

## Continuous Integration

### GitHub Actions

The CI pipeline includes:

1. **Verification**
   ```bash
   npm run verify:env
   npm run verify:tests
   npm run verify:quality
   ```

2. **Testing**
   ```bash
   npm run test:ci
   npm run test:all
   ```

3. **Quality Checks**
   ```bash
   npm run quality
   npm run quality:trend:week
   ```

4. **Reporting**
   ```bash
   npm run report:weekly
   npm run coverage:badges
   ```

### Local CI Testing

```bash
# Run complete CI pipeline locally
npm run ci

# Run individual stages
npm run ci:verify
npm run ci:test
npm run ci:quality
```

## Test Organization

### Directory Structure

```
project/
├── coverage/           # Coverage reports
├── test-results/      # Test execution results
├── reports/           # Quality reports
└── src/
    ├── components/
    │   └── __tests__/ # Component tests
    ├── app/
    │   ├── api/
    │   │   └── __tests__/ # API tests
    │   └── lib/
    │       └── __tests__/ # Library tests
    └── test/
        ├── fixtures/  # Test fixtures
        └── helpers/   # Test utilities
```

### Test Files

- `*.test.ts` - Unit tests
- `*.spec.ts` - Integration tests
- `*.e2e.ts` - End-to-end tests

## Best Practices

1. **File Organization**
   - Keep tests close to code
   - Use descriptive test names
   - Group related tests

2. **Test Quality**
   - Write meaningful assertions
   - Test edge cases
   - Keep tests focused

3. **Maintenance**
   - Regular quality checks
   - Address flaky tests
   - Review coverage gaps

## Troubleshooting

### Common Issues

1. **Missing Coverage**
   ```bash
   # Regenerate coverage
   npm run coverage -- --clearCache
   ```

2. **Flaky Tests**
   ```bash
   # Run specific test suite repeatedly
   npm run test:repeat -- test-name
   ```

3. **Configuration**
   ```bash
   # Verify environment
   npm run verify:env
   ```

### Getting Help

- Check error logs in `test-results/`
- Review quality reports
- Run setup verification
- Consult documentation

## Additional Resources

- [Test Reports Guide](TEST_REPORTS.md)
- [Quality Standards](QUALITY_STANDARDS.md)
- [Contributing Guide](../CONTRIBUTING.md)
- [Jest Documentation](https://jestjs.io/)