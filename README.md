# Resume Analyzer

[![Build Status](https://github.com/yourusername/vibecheckresume/workflows/CI/CD/badge.svg)](https://github.com/yourusername/vibecheckresume/actions)
[![Test Quality](https://github.com/yourusername/vibecheckresume/workflows/Test%20Quality%20Checks/badge.svg)](https://github.com/yourusername/vibecheckresume/actions)
[![Coverage](./coverage/badge-lines.svg)](./coverage/lcov-report/index.html)
[![TypeScript](https://badges.frapsoft.com/typescript/code/typescript.svg?v=101)](https://github.com/microsoft/TypeScript)
[![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](https://choosealicense.com/licenses/mit/)

AI-powered resume analyzer that matches your resume against job descriptions and provides detailed feedback.

## Features

- 📄 PDF and text resume analysis
- 🎯 Job description matching
- 💡 Skill gap analysis
- 📊 Detailed recommendations
- ⚡ Real-time feedback
- 🔒 Secure API integration

## Quick Start

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/vibecheckresume.git
   cd vibecheckresume
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment**
   ```bash
   cp .env.example .env
   # Add your OpenAI API key to .env
   ```

4. **Set up test environment**
   ```bash
   npm run test:setup
   ```

5. **Run development server**
   ```bash
   npm run dev
   ```

6. **Open browser**
   ```
   http://localhost:3000
   ```

## Testing

### Test Infrastructure

The project includes comprehensive test quality infrastructure:

- Automated test quality analysis
- Coverage tracking and reporting
- Quality metrics monitoring
- PR status updates
- Test trend analysis
- Email and Slack notifications

### Running Tests

```bash
# Basic test commands
npm test                 # Run all tests
npm run test:watch      # Watch mode
npm run test:coverage   # Generate coverage

# Quality analysis
npm run quality         # Analyze test quality
npm run quality:report  # View quality report
npm run quality:trend   # View trends

# Weekly reports
npm run report:weekly   # Generate report
npm run report:view     # View latest report
```

### GitHub Actions Integration

The project includes automated test quality checks:

- PR test status updates
- Coverage badge generation
- Quality trend tracking
- Automated notifications

See [GitHub Actions Guide](docs/GITHUB_ACTIONS.md) for details.

### Test Documentation

Detailed documentation available in:
- [Test Setup Guide](docs/TEST_SETUP.md)
- [Test Reports Guide](docs/TEST_REPORTS.md)
- [Quality Standards](docs/QUALITY_STANDARDS.md)

## Development

### Prerequisites

- Node.js (>= 16.0.0)
- npm
- OpenAI API key

### Scripts

```bash
# Development
npm run dev

# Build
npm run build

# Start production server
npm run start

# Linting and verification
npm run lint
npm run verify

# Clean installation
npm run reset
```

### Docker Support

```bash
# Build image
npm run docker:build

# Run tests in container
npm run docker:test

# Start services
npm run docker:up
```

## Contributing

1. Fork the repository
2. Create your feature branch
   ```bash
   git checkout -b feature/amazing-feature
   ```
3. Setup test environment
   ```bash
   npm run test:setup
   ```
4. Make your changes
5. Run quality checks
   ```bash
   npm run verify
   ```
6. Create a pull request

See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed guidelines.

## Test Quality Standards

We maintain high testing standards:

- Minimum 80% code coverage
- Quality score above 75
- No flaky tests
- Comprehensive documentation

See [QUALITY_STANDARDS.md](docs/QUALITY_STANDARDS.md) for details.

## Security

See [SECURITY.md](SECURITY.md) for reporting vulnerabilities.

## License

This project is MIT licensed. See [LICENSE](LICENSE) file.

## Support

- [Report Bug](https://github.com/yourusername/vibecheckresume/issues)
- [Request Feature](https://github.com/yourusername/vibecheckresume/issues)

## Acknowledgments

- OpenAI for their API
- Next.js team
- All contributors