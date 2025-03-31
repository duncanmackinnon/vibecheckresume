#!/bin/bash

# Color definitions
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Error handling
set -e
trap 'echo -e "${RED}Error: Command failed at line $LINENO${NC}"; exit 1' ERR

# Print header
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}     Running Complete Test Suite        ${NC}"
echo -e "${BLUE}========================================${NC}"

# Check environment
echo -e "\n${YELLOW}Checking environment...${NC}"
npm run verify:env
echo -e "${GREEN}✓ Environment verified${NC}"

# Run linting
echo -e "\n${YELLOW}Running linting...${NC}"
npm run lint
echo -e "${GREEN}✓ Linting passed${NC}"

# Type checking
echo -e "\n${YELLOW}Running type checks...${NC}"
npx tsc --noEmit
echo -e "${GREEN}✓ Type checking passed${NC}"

# Unit tests
echo -e "\n${YELLOW}Running unit tests...${NC}"
echo -e "${BLUE}---------------------${NC}"
echo "→ Components"
npm run test:components
echo -e "${GREEN}✓ Component tests passed${NC}"

echo -e "\n→ API endpoints"
npm run test:api
echo -e "${GREEN}✓ API tests passed${NC}"

echo -e "\n→ Library functions"
npm run test:lib
echo -e "${GREEN}✓ Library tests passed${NC}"

echo -e "\n→ Scripts"
npm run test:scripts
echo -e "${GREEN}✓ Script tests passed${NC}"

# Integration tests
echo -e "\n${YELLOW}Running integration tests...${NC}"
echo -e "${BLUE}-------------------------${NC}"
echo "→ OpenAI integration"
npm run test:openai
echo -e "${GREEN}✓ OpenAI tests passed${NC}"

echo -e "\n→ Error handling"
npm run test:errors
echo -e "${GREEN}✓ Error handling tests passed${NC}"

echo -e "\n→ Fixtures"
npm run test:fixtures
echo -e "${GREEN}✓ Fixture tests passed${NC}"

# Generate coverage report
echo -e "\n${YELLOW}Generating coverage report...${NC}"
npm run test:coverage

# Generate badges if in CI environment
if [ "$CI" = "true" ]; then
    echo -e "\n${YELLOW}Generating coverage badges...${NC}"
    npm run test:badges
fi

# Final summary
echo -e "\n${BLUE}========================================${NC}"
echo -e "${GREEN}          All Tests Passed!            ${NC}"
echo -e "${BLUE}========================================${NC}"
echo -e "\nTest Results Summary:"
echo -e "---------------------"
echo -e "Coverage report: ./coverage/lcov-report/index.html"
echo -e "Test results: ./test-results/"
echo -e "\nTo view detailed results:"
echo -e "  → Coverage report: open coverage/lcov-report/index.html"
echo -e "  → Latest results: cat test-results/latest.json"

# Cleanup
echo -e "\n${YELLOW}Cleaning up...${NC}"
find . -name "*.test.js.snap" -type f -delete

exit 0