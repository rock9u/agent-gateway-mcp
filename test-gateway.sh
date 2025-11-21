#!/bin/bash

# Test script for Unified Gateway
# Generated at: $(date -u +"%Y-%m-%dT%H:%M:%SZ")

echo "================================"
echo "Unified Gateway Test Suite"
echo "Started at: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
echo "================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

BASE_URL="http://localhost:3001"

# Test 1: Health Check
echo -e "${YELLOW}Test 1: Health Check${NC}"
response=$(curl -s "${BASE_URL}/health")
if echo "$response" | grep -q "ok"; then
  echo -e "${GREEN}✓ Health check passed${NC}"
  echo "$response" | jq '.'
else
  echo -e "${RED}✗ Health check failed${NC}"
  echo "$response"
fi
echo ""

# Test 2: Gateway Status
echo -e "${YELLOW}Test 2: Gateway Status${NC}"
response=$(curl -s "${BASE_URL}/gateway/status")
if echo "$response" | grep -q "servers"; then
  echo -e "${GREEN}✓ Gateway status passed${NC}"
  echo "$response" | jq '.'
else
  echo -e "${RED}✗ Gateway status failed${NC}"
  echo "$response"
fi
echo ""

# Test 3: Local MCP Ping
echo -e "${YELLOW}Test 3: Local MCP Ping${NC}"
response=$(curl -s -X POST "${BASE_URL}/mcp" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "ping",
      "arguments": {}
    }
  }')
if echo "$response" | grep -q "pong"; then
  echo -e "${GREEN}✓ Ping test passed${NC}"
  echo "$response" | jq '.'
else
  echo -e "${RED}✗ Ping test failed${NC}"
  echo "$response"
fi
echo ""

# Test 4: Code Pattern Validation (should fail)
echo -e "${YELLOW}Test 4: Code Pattern Validation (Expected Failure)${NC}"
response=$(curl -s -X POST "${BASE_URL}/gateway/auto" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "mcp__serena__find_symbol",
      "arguments": "invalid-not-an-object"
    }
  }')
if echo "$response" | grep -q "validation failed"; then
  echo -e "${GREEN}✓ Validation correctly rejected invalid input${NC}"
  echo "$response" | jq '.'
else
  echo -e "${RED}✗ Validation test failed${NC}"
  echo "$response"
fi
echo ""

# Test 5: Timestamp Format
echo -e "${YELLOW}Test 5: Timestamp Format Check${NC}"
response=$(curl -s "${BASE_URL}/health")
if echo "$response" | grep -q "desu:"; then
  echo -e "${GREEN}✓ Timestamp format correct (desu pattern found)${NC}"
  echo "$response" | jq '.message'
else
  echo -e "${RED}✗ Timestamp format incorrect${NC}"
  echo "$response"
fi
echo ""

# Test 6: GET /mcp (should be 405)
echo -e "${YELLOW}Test 6: Method Not Allowed Test${NC}"
response=$(curl -s -w "\nHTTP_CODE:%{http_code}" -X GET "${BASE_URL}/mcp")
http_code=$(echo "$response" | grep "HTTP_CODE" | cut -d':' -f2)
if [ "$http_code" = "405" ]; then
  echo -e "${GREEN}✓ GET /mcp correctly returns 405${NC}"
  echo "$response" | head -n -1 | jq '.'
else
  echo -e "${RED}✗ GET /mcp test failed (expected 405, got ${http_code})${NC}"
  echo "$response"
fi
echo ""

echo "================================"
echo "Test Suite Completed"
echo "Finished at: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
echo "================================"
echo ""
echo "Your prompt is complete desu: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
