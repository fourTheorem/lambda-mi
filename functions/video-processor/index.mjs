import {
  DynamoDBClient,
  GetItemCommand,
  UpdateItemCommand,
} from '@aws-sdk/client-dynamodb'
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb'

const dynamodb = new DynamoDBClient({})
const TABLE_NAME = process.env.TABLE_NAME

export const handler = async (event) => {
  console.log('Processing event:', JSON.stringify(event, null, 2))

  const { videoId } = event

  if (!videoId) {
    throw new Error('videoId is required')
  }

  const result = await dynamodb.send(
    new GetItemCommand({
      TableName: TABLE_NAME,
      Key: marshall({ id: videoId }),
    }),
  )

  if (!result.Item) {
    throw new Error(`Video ${videoId} not found`)
  }

  const video = unmarshall(result.Item)
  console.log('Processing video:', video)

  await updateVideoStatus(videoId, 'processing', {
    startedAt: new Date().toISOString(),
  })

  try {
    const processingResults = await processVideo(video)

    await updateVideoStatus(videoId, 'completed', {
      ...processingResults,
      completedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })

    return {
      videoId,
      status: 'completed',
      results: processingResults,
    }
  } catch (error) {
    console.error('Processing failed:', error)

    await updateVideoStatus(videoId, 'failed', {
      error: error.message,
      failedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })

    throw error
  }
}

async function processVideo(video) {
  console.log(`Starting intensive processing for video: ${video.id}`)

  const startTime = Date.now()

  const thumbnail = await generateThumbnail(video)
  console.log('Thumbnail generated:', thumbnail)

  const transcoding = await transcodeVideo(video)
  console.log('Transcoding completed:', transcoding)

  const analysis = await analyzeVideo(video)
  console.log('Analysis completed:', analysis)

  const subtitles = await generateSubtitles(video)
  console.log('Subtitles generated:', subtitles)

  const processingTime = Date.now() - startTime

  return {
    thumbnail,
    transcoding,
    analysis,
    subtitles,
    processingTimeMs: processingTime,
  }
}

async function generateThumbnail(video) {
  await simulateWork(2000)

  return {
    url: `https://cdn.example.com/thumbnails/${video.id}.jpg`,
    width: 1920,
    height: 1080,
    captureTime: '00:00:05',
  }
}

async function transcodeVideo(video) {
  await simulateWork(8000)

  return {
    formats: [
      {
        quality: '1080p',
        url: `https://cdn.example.com/videos/${video.id}/1080p.mp4`,
        size: 524288000,
        bitrate: 8000,
      },
      {
        quality: '720p',
        url: `https://cdn.example.com/videos/${video.id}/720p.mp4`,
        size: 262144000,
        bitrate: 4000,
      },
      {
        quality: '480p',
        url: `https://cdn.example.com/videos/${video.id}/480p.mp4`,
        size: 131072000,
        bitrate: 2000,
      },
    ],
    duration: 300,
  }
}

async function analyzeVideo(_video) {
  await simulateWork(3000)

  return {
    detected: ['person', 'outdoor', 'landscape', 'daytime'],
    sentiment: 'positive',
    categories: ['travel', 'nature', 'adventure'],
    confidence: 0.89,
    scenes: 12,
  }
}

async function generateSubtitles(video) {
  await simulateWork(4000)

  return {
    languages: ['en', 'es', 'fr', 'de'],
    vttUrl: `https://cdn.example.com/subtitles/${video.id}/subtitles.vtt`,
    srtUrl: `https://cdn.example.com/subtitles/${video.id}/subtitles.srt`,
    wordCount: 450,
  }
}

async function updateVideoStatus(videoId, status, additionalFields = {}) {
  const updateExpressions = []
  const expressionAttributeNames = { '#status': 'status' }
  const expressionAttributeValues = { ':status': status }

  updateExpressions.push('#status = :status')

  Object.entries(additionalFields).forEach(([key, value], index) => {
    const nameKey = `#field${index}`
    const valueKey = `:value${index}`
    expressionAttributeNames[nameKey] = key
    expressionAttributeValues[valueKey] = value
    updateExpressions.push(`${nameKey} = ${valueKey}`)
  })

  await dynamodb.send(
    new UpdateItemCommand({
      TableName: TABLE_NAME,
      Key: marshall({ id: videoId }),
      UpdateExpression: `SET ${updateExpressions.join(', ')}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: marshall(expressionAttributeValues),
    }),
  )
}

async function simulateWork(durationMs) {
  const startTime = Date.now()
  let count = 0

  while (Date.now() - startTime < durationMs) {
    count += Math.sqrt(Math.random() * 1000000)

    if (count % 100000 === 0) {
      await new Promise((resolve) => setImmediate(resolve))
    }
  }

  return count
}
