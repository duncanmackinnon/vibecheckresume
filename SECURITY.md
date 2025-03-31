# Security Policy

## Supported Versions

We currently support the following versions with security updates:

| Version | Supported          |
| ------- | ------------------ |
| 1.x.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

We take security vulnerabilities seriously. Please follow these steps to report a security issue:

### Do NOT:
- Open a public GitHub issue about a security vulnerability
- Share security vulnerabilities in public forums or chat rooms
- Share sensitive details about the vulnerability until it has been addressed

### DO:
1. **Email**: Send details to security@yourdomain.com
2. **Private Report**: Use GitHub's private vulnerability reporting feature
3. **Include Details**:
   - Detailed description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Your name/contact info (optional)

### What to Expect:
1. **Acknowledgment**: Within 48 hours
2. **Updates**: Regular updates on the progress
3. **Resolution**: Timeline for patch/fix
4. **Disclosure**: Coordinated disclosure after fix

## Security Measures

### API Security
- Rate limiting on all endpoints
- API key validation
- Input sanitization
- Request validation

### Data Security
- No storage of sensitive data
- HTTPS/TLS encryption
- Secure API key handling
- Environment variable protection

### OpenAI Integration
- Secure API key management
- Rate limiting
- Error handling
- Request validation

## Best Practices for Users

1. **API Keys**
   - Never share your OpenAI API key
   - Rotate keys regularly
   - Use environment variables
   - Set appropriate usage limits

2. **Data Handling**
   - Don't include sensitive info in resumes
   - Review data before submission
   - Use secure connections

3. **Environment Setup**
   - Follow security guidelines in README
   - Keep dependencies updated
   - Use latest Node.js LTS version

## Development Security

1. **Dependencies**
   - Regular security audits
   - Automated vulnerability scanning
   - Dependency updates

2. **Code Reviews**
   - Security-focused reviews
   - Automated static analysis
   - Regular security testing

3. **Deployment**
   - Secure CI/CD pipeline
   - Production environment hardening
   - Regular security updates

## Vulnerability Disclosure Policy

1. **Timeline**
   - Day 0: Report received
   - Day 2: Initial response
   - Day 14: Assessment complete
   - Day 30: Fix developed
   - Day 45: Public disclosure

2. **Credit**
   - Proper attribution to reporters
   - Acknowledgment in release notes
   - Optional: Bug bounty program

3. **Public Disclosure**
   - Coordinated with reporter
   - Clear documentation
   - Affected versions listed
   - Mitigation steps provided

## Contact

For security concerns, contact us:
- Email: security@yourdomain.com
- Private Report: [GitHub Security](https://github.com/yourusername/vibecheckresume/security)
- GPG Key: [security.asc](./security.asc)

## Updates

This security policy is reviewed and updated regularly. Last update: March 2025