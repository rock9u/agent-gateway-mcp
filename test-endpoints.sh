#!/bin/bash

# Quick endpoint verification script
# Created: $(date -u +"%Y-%m-%dT%H:%M:%SZ")

echo "================================"
echo "MCP Unified Gateway - Endpoint Tests"
echo "Started at: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
echo "================================"
echo ""

BASE_URL="http://localhost:3000"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Test 1: Root endpoint
echo -e "${YELLOW}Test 1: Root Endpoint (GET /)${NC}"
curl -s "${BASE_URL}/" | jq '.' || echo "Failed"
echo ""

# Test 2: Gateway Status
echo -e "${YELLOW}Test 2: Gateway Status (GET /gateway/status)${NC}"
curl -s "${BASE_URL}/gateway/status" | jq '.' || echo "Failed"
echo ""

# Test 3: Health Check
echo -e "${YELLOW}Test 3: Health Check (GET /health)${NC}"
curl -s "${BASE_URL}/health" | jq '.' || echo "Failed"
echo ""

# Test 4: Method Not Allowed
echo -e "${YELLOW}Test 4: Method Not Allowed (GET /mcp)${NC}"
curl -s "${BASE_URL}/mcp" | jq '.' || echo "Failed"
echo ""

echo "================================"
echo "Tests Completed"
echo "Finished at: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
echo "================================"
echo ""
echo -e "${GREEN}✓ If all responses showed JSON, the gateway is working!${NC}"
echo ""
echo "Your prompt is complete desu: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
