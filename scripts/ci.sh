#!/bin/bash

# Exit on error
set -e

# Color definitions
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Error handling
trap 'echo -e "${RED}Error: Command failed at line $LINENO${NC}"; exit 1' ERR

# Print header
echo -e "${BLUE}==========================================${NC}"
echo -e "${BLUE}     CI/CD Pipeline - Test Quality        ${NC}"
echo -e "${BLUE}==========================================${NC}"

# Functions
check_env() {
  echo -e "\n${YELLOW}Checking environment...${NC}"
  if [ -z "$OPENAI_API_KEY" ]; then
    echo -e "${RED}Error: OPENAI_API_KEY not set${NC}"
    exit 1
  fi
  npm run verify:env
  echo -e "${GREEN}✓ Environment verified${NC}"
}

run_linting() {
  echo -e "\n${YELLOW}Running linting...${NC}"
  npm run lint
  echo -e "${GREEN}✓ Linting passed${NC}"
}

check_types() {
  echo -e "\n${YELLOW}Checking types...${NC}"
  npx tsc --noEmit
  echo -e "${GREEN}✓ Type checking passed${NC}"
}

run_tests() {
  echo -e "\n${YELLOW}Running tests...${NC}"
  
  echo -e "${BLUE}Unit Tests${NC}"
  npm run test:ci
  echo -e "${GREEN}✓ Unit tests passed${NC}"

  echo -e "\n${BLUE}Integration Tests${NC}"
  npm run test:openai
  npm run test:errors
  echo -e "${GREEN}✓ Integration tests passed${NC}"

  echo -e "\n${BLUE}Test Quality Analysis${NC}"
  npm run quality
  echo -e "${GREEN}✓ Quality analysis completed${NC}"

  echo -e "\n${BLUE}Test Coverage Report${NC}"
  npm run coverage:report
  echo -e "${GREEN}✓ Coverage report generated${NC}"

  echo -e "\n${BLUE}Test Trend Analysis${NC}"
  npm run quality:trend:week
  echo -e "${GREEN}✓ Trend analysis completed${NC}"
}

verify_quality() {
  echo -e "\n${YELLOW}Verifying test quality...${NC}"
  
  # Run quality verification
  if ! npm run verify:quality; then
    echo -e "${RED}Error: Quality standards not met${NC}"
    npm run quality:report
    exit 1
  fi

  # Check coverage trends
  if ! npm run verify:trends; then
    echo -e "${RED}Error: Coverage is declining${NC}"
    npm run quality:trend:week
    exit 1
  }

  echo -e "${GREEN}✓ Quality verification passed${NC}"
}

generate_reports() {
  echo -e "\n${YELLOW}Generating reports...${NC}"
  
  # Generate weekly report
  npm run report:weekly
  
  # Generate coverage badges
  npm run coverage:badges
  
  echo -e "${GREEN}✓ Reports generated${NC}"
}

notify_team() {
  echo -e "\n${YELLOW}Sending notifications...${NC}"
  
  if [ -n "$CI" ]; then
    # Send notifications in CI environment
    if [ -n "$SLACK_WEBHOOK_URL" ]; then
      npm run report:slack
    fi
    
    if [ -n "$SMTP_HOST" ]; then
      npm run report:email
    fi
  fi
  
  echo -e "${GREEN}✓ Notifications sent${NC}"
}

build_app() {
  echo -e "\n${YELLOW}Building application...${NC}"
  npm run build
  echo -e "${GREEN}✓ Build completed${NC}"
}

archive_artifacts() {
  echo -e "\n${YELLOW}Archiving artifacts...${NC}"
  
  # Create artifacts directory
  mkdir -p artifacts
  
  # Copy reports
  cp -r coverage artifacts/
  cp -r test-results artifacts/
  cp test-quality-report.txt artifacts/
  cp test-trends-report.txt artifacts/
  
  echo -e "${GREEN}✓ Artifacts archived${NC}"
}

# Main execution
main() {
  echo -e "\n${YELLOW}Starting CI/CD pipeline...${NC}"
  
  check_env
  run_linting
  check_types
  run_tests
  verify_quality
  generate_reports
  notify_team
  build_app
  archive_artifacts
  
  echo -e "\n${BLUE}==========================================${NC}"
  echo -e "${GREEN}            Pipeline Completed            ${NC}"
  echo -e "${BLUE}==========================================${NC}"
}

# Run if this is the main script
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main
fi