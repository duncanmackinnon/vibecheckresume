# Contributing to Resume Analyzer

Thank you for your interest in contributing to Resume Analyzer! This document provides guidelines and instructions for contributing to the project.

## Development Setup

1. **Prerequisites**
   - Node.js (version >= 16.0.0)
   - npm (usually comes with Node.js)
   - OpenAI API key

2. **Initial Setup**
   ```bash
   # Clone the repository
   git clone https://github.com/yourusername/vibecheckresume.git
   cd vibecheckresume

   # Install dependencies
   npm install

   # Copy environment file and configure
   cp .env.example .env
   # Edit .env and add your OpenAI API key
   ```

3. **Verify Setup**
   ```bash
   # Run environment verification
   npm run verify:env

   # Run all tests
   npm run test:all
   ```

## Testing

### Running Tests

1. **Quick Test**
   ```bash
   npm test
   ```

2. **Watch Mode (for development)**
   ```bash
   npm run test:watch
   ```

3. **Complete Test Suite**
   ```bash
   npm run test:all
   ```

4. **Individual Test Categories**
   ```bash
   # Unit tests
   npm run test:ci

   # OpenAI Integration tests
   npm run test:openai

   # Error handling tests
   npm run test:errors

   # Fixture tests
   npm run test:fixtures
   ```

5. **Test Reports**
   ```bash
   # Generate test report
   npm run test:report
   ```

### CI/CD Pipeline

Our GitHub Actions workflow includes:

1. **Verify & Test**
   - Environment verification
   - Linting
   - Type checking
   - Unit tests
   - Coverage report generation

2. **Integration Tests**
   - OpenAI API integration
   - Error handling
   - Fixture testing

3. **Build**
   - Next.js production build
   - Artifact upload

4. **Deploy**
   - Production deployment
   - Environment validation

### Writing Tests

1. **Unit Tests**
   - Place test files next to the code they test
   - Use `.test.ts` or `.test.tsx` extension
   - Follow the existing test patterns

2. **Integration Tests**
   - Add tests to appropriate test suites
   - Mock external services when needed
   - Test error cases

3. **Test Utilities**
   - Use provided test helpers and fixtures
   - Add new utilities to `/test` directory
   - Document test utility functions

## Code Quality

1. **Code Style**
   ```bash
   # Run linting
   npm run lint
   ```

2. **Type Checking**
   ```bash
   # Check types
   npx tsc --noEmit
   ```

3. **Verification**
   ```bash
   # Run all checks
   npm run verify
   ```

## Pull Request Process

1. **Before Submitting**
   - Ensure all tests pass: `npm run verify`
   - Update documentation if needed
   - Add tests for new features
   - Follow existing code style

2. **Submission Checklist**
   - [ ] Tests pass locally
   - [ ] New tests added
   - [ ] Documentation updated
   - [ ] Code follows style guidelines
   - [ ] Branch is up to date with main

3. **Review Process**
   - All PRs require review
   - Address review comments
   - Keep commits organized

## Documentation

1. **Code Comments**
   - Document complex logic
   - Explain non-obvious decisions
   - Include example usage

2. **Repository Documentation**
   - Update README.md for new features
   - Keep CONTRIBUTING.md current
   - Document API changes

## Getting Help

- Create an issue for bugs
- Use discussions for questions
- Join our community chat
- Check existing documentation

## License

By contributing, you agree that your contributions will be licensed under the project's MIT License.