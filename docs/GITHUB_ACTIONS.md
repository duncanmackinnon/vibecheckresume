# GitHub Actions Usage

This project includes a reusable GitHub Actions workflow for test quality analysis.

## Test Quality Action

The test quality action provides comprehensive test analysis, reporting, and quality checks.

### Basic Usage

```yaml
jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: ./.github/actions/test-quality
        with:
          node-version: '20'
```

### Full Configuration

```yaml
jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - uses: ./.github/actions/test-quality
        with:
          # Node.js version (default: '20')
          node-version: '20'
          
          # Coverage threshold percentage (default: '80')
          coverage-threshold: '85'
          
          # Quality score threshold (default: '75')
          quality-threshold: '80'
          
          # Update PR with stats (default: true)
          update-pr: true
          
          # Send notifications (default: true)
          send-notifications: true
          
          # Archive results (default: true)
          archive-results: true
        env:
          # Required for PR updates
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          
          # Optional: Email notifications
          SMTP_HOST: ${{ secrets.SMTP_HOST }}
          SMTP_PORT: ${{ secrets.SMTP_PORT }}
          SMTP_USER: ${{ secrets.SMTP_USER }}
          SMTP_PASS: ${{ secrets.SMTP_PASS }}
          EMAIL_RECIPIENTS: ${{ secrets.EMAIL_RECIPIENTS }}
          
          # Optional: Slack notifications
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}
```

### Outputs

The action provides the following outputs:

```yaml
steps:
  - uses: ./.github/actions/test-quality
    id: quality
    
  - name: Use outputs
    run: |
      echo "Coverage: ${{ steps.quality.outputs.coverage }}%"
      echo "Quality Score: ${{ steps.quality.outputs.quality-score }}"
      echo "Flaky Tests: ${{ steps.quality.outputs.flaky-tests }}"
      echo "Report URL: ${{ steps.quality.outputs.report-url }}"
```

### Workflow Events

The test quality workflow runs on:
- Pull requests to `main` or `develop`
- Pushes to `main` or `develop`
- Manual trigger (`workflow_dispatch`)

### Notifications

The action can send notifications via:
- Email (requires SMTP configuration)
- Slack (requires webhook URL)
- GitHub PR comments

### Artifacts

The following artifacts are generated:
- Coverage reports
- Test results
- Quality analysis
- Trend reports
- Coverage badges

### Examples

#### Minimal Setup
```yaml
name: Tests
on: [push]
jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: ./.github/actions/test-quality
```

#### With Custom Thresholds
```yaml
name: Tests
on: [push]
jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: ./.github/actions/test-quality
        with:
          coverage-threshold: '90'
          quality-threshold: '85'
```

#### With Notifications
```yaml
name: Tests
on: [push]
jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: ./.github/actions/test-quality
        with:
          send-notifications: true
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}
          EMAIL_RECIPIENTS: team@example.com
```

### Troubleshooting

Common issues and solutions:

1. **PR Updates Failing**
   ```yaml
   # Ensure GITHUB_TOKEN is provided
   env:
     GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
   ```

2. **Missing Notifications**
   ```yaml
   # Check notification configuration
   env:
     SMTP_HOST: smtp.example.com
     SMTP_PORT: 587
     SMTP_USER: user
     SMTP_PASS: ${{ secrets.SMTP_PASS }}
     EMAIL_RECIPIENTS: team@example.com
     SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}
   ```

3. **Badge Updates Failing**
   ```yaml
   # Ensure proper git configuration
   steps:
     - uses: actions/checkout@v4
       with:
         fetch-depth: 0
         token: ${{ secrets.GITHUB_TOKEN }}