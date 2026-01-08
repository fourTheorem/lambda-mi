#!/bin/bash

# Video Processing Service - Usage Examples
# This script demonstrates how to interact with the deployed API

set -e

if [ -z "$API_ENDPOINT" ]; then
  echo "Error: API_ENDPOINT environment variable not set"
  echo "Usage: export API_ENDPOINT=https://your-api-id.execute-api.region.amazonaws.com"
  exit 1
fi

echo "🎬 Video Processing Service Demo"
echo "=================================="
echo "API Endpoint: $API_ENDPOINT"
echo ""

echo "1️⃣  Health Check..."
curl -s "$API_ENDPOINT/health" | jq .
echo ""

echo "2️⃣  Creating test videos..."
VIDEO1=$(curl -s -X POST "$API_ENDPOINT/videos" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Summer Vacation 2024",
    "sourceUrl": "s3://demo-bucket/videos/summer-vacation.mp4",
    "description": "Beach and mountain adventures"
  }' | jq -r '.id')

VIDEO2=$(curl -s -X POST "$API_ENDPOINT/videos" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Product Demo",
    "sourceUrl": "s3://demo-bucket/videos/product-demo.mp4",
    "description": "New product features walkthrough"
  }' | jq -r '.id')

echo "Created video 1: $VIDEO1"
echo "Created video 2: $VIDEO2"
echo ""

echo "3️⃣  Listing all videos..."
curl -s "$API_ENDPOINT/videos" | jq '.videos[] | {id, title, status}'
echo ""

echo "4️⃣  Getting specific video details..."
curl -s "$API_ENDPOINT/videos/$VIDEO1" | jq .
echo ""

echo "5️⃣  Triggering video processing..."
echo "This will start the Step Functions workflow that:"
echo "  - Scales up processor capacity (0 → 2-5 environments)"
echo "  - Processes the video (transcoding, thumbnails, etc.)"
echo "  - Scales down processor capacity (back to 0)"
echo ""

PROCESSING=$(curl -s -X POST "$API_ENDPOINT/videos/$VIDEO1/process")
echo "$PROCESSING" | jq .
EXECUTION_ARN=$(echo "$PROCESSING" | jq -r '.executionArn')
echo ""

echo "6️⃣  Monitoring processing status..."
for i in {1..5}; do
  echo "Check #$i (waiting 10 seconds between checks)..."
  STATUS=$(curl -s "$API_ENDPOINT/videos/$VIDEO1" | jq -r '.status')
  echo "Current status: $STATUS"
  
  if [ "$STATUS" = "completed" ] || [ "$STATUS" = "failed" ]; then
    echo ""
    echo "Processing finished with status: $STATUS"
    curl -s "$API_ENDPOINT/videos/$VIDEO1" | jq .
    break
  fi
  
  if [ $i -lt 5 ]; then
    sleep 10
  fi
done
echo ""

echo "7️⃣  Filtering videos by status..."
curl -s "$API_ENDPOINT/videos?status=completed" | jq '.videos[] | {id, title, status, processingTimeMs}'
echo ""

echo "✅ Demo complete!"
echo ""
echo "Step Functions Execution ARN:"
echo "$EXECUTION_ARN"
echo ""
echo "You can view the execution in the AWS Console to see:"
echo "  - Scaling activities"
echo "  - Processing logs"
echo "  - Detailed workflow steps"
