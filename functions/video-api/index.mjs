import {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  QueryCommand,
  ScanCommand,
  UpdateItemCommand,
} from '@aws-sdk/client-dynamodb'
import { SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn'
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb'

const dynamodb = new DynamoDBClient({})
const sfn = new SFNClient({})

const TABLE_NAME = process.env.TABLE_NAME
const STATE_MACHINE_ARN = process.env.STATE_MACHINE_ARN

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
}

export const handler = async (event) => {
  console.log('Event:', JSON.stringify(event, null, 2))

  const path = event.path || event.rawPath || '/'
  const method = event.httpMethod || event.requestContext?.http?.method || 'GET'
  const pathParams = event.pathParameters || {}

  try {
    if (method === 'POST' && path === '/videos') {
      return await createVideo(event)
    }
    if (method === 'GET' && path === '/videos') {
      return await listVideos(event)
    }
    if (
      method === 'GET' &&
      path.startsWith('/videos/') &&
      !path.endsWith('/process')
    ) {
      const videoId = pathParams.id || path.split('/')[2]
      return await getVideo(videoId)
    }
    if (
      method === 'POST' &&
      path.startsWith('/videos/') &&
      path.endsWith('/process')
    ) {
      const videoId = pathParams.id || path.split('/')[2]
      return await triggerProcessing(videoId)
    }
    if (method === 'GET' && path === '/health') {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          status: 'healthy',
          timestamp: new Date().toISOString(),
        }),
      }
    }
    return {
      statusCode: 404,
      headers,
      body: JSON.stringify({ error: 'Not found' }),
    }
  } catch (error) {
    console.error('Error:', error)
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message }),
    }
  }
}

async function createVideo(event) {
  const body = JSON.parse(event.body || '{}')
  const { title, sourceUrl, description } = body

  if (!title || !sourceUrl) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'title and sourceUrl are required' }),
    }
  }

  const videoId = generateId()
  const timestamp = new Date().toISOString()

  const video = {
    id: videoId,
    title,
    sourceUrl,
    description: description || '',
    status: 'uploaded',
    createdAt: timestamp,
    updatedAt: timestamp,
  }

  await dynamodb.send(
    new PutItemCommand({
      TableName: TABLE_NAME,
      Item: marshall(video),
    }),
  )

  return {
    statusCode: 201,
    headers,
    body: JSON.stringify(video),
  }
}

async function listVideos(event) {
  const queryParams = event.queryStringParameters || {}
  const status = queryParams.status

  let items
  if (status) {
    const result = await dynamodb.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: 'StatusIndex',
        KeyConditionExpression: '#status = :status',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: marshall({ ':status': status }),
      }),
    )
    items = result.Items || []
  } else {
    const result = await dynamodb.send(
      new ScanCommand({
        TableName: TABLE_NAME,
      }),
    )
    items = result.Items || []
  }

  const videos = items.map((item) => unmarshall(item))

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ videos, count: videos.length }),
  }
}

async function getVideo(videoId) {
  if (!videoId) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'videoId is required' }),
    }
  }

  const result = await dynamodb.send(
    new GetItemCommand({
      TableName: TABLE_NAME,
      Key: marshall({ id: videoId }),
    }),
  )

  if (!result.Item) {
    return {
      statusCode: 404,
      headers,
      body: JSON.stringify({ error: 'Video not found' }),
    }
  }

  const video = unmarshall(result.Item)

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify(video),
  }
}

async function triggerProcessing(videoId) {
  if (!videoId) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'videoId is required' }),
    }
  }

  const result = await dynamodb.send(
    new GetItemCommand({
      TableName: TABLE_NAME,
      Key: marshall({ id: videoId }),
    }),
  )

  if (!result.Item) {
    return {
      statusCode: 404,
      headers,
      body: JSON.stringify({ error: 'Video not found' }),
    }
  }

  const video = unmarshall(result.Item)

  if (video.status === 'processing') {
    return {
      statusCode: 409,
      headers,
      body: JSON.stringify({ error: 'Video is already being processed' }),
    }
  }

  await dynamodb.send(
    new UpdateItemCommand({
      TableName: TABLE_NAME,
      Key: marshall({ id: videoId }),
      UpdateExpression: 'SET #status = :status, updatedAt = :updatedAt',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: marshall({
        ':status': 'queued',
        ':updatedAt': new Date().toISOString(),
      }),
    }),
  )

  const executionName = `process-${videoId}-${Date.now()}`
  const execution = await sfn.send(
    new StartExecutionCommand({
      stateMachineArn: STATE_MACHINE_ARN,
      name: executionName,
      input: JSON.stringify({ videoId }),
    }),
  )

  return {
    statusCode: 202,
    headers,
    body: JSON.stringify({
      message: 'Processing started',
      executionArn: execution.executionArn,
      videoId,
    }),
  }
}

function generateId() {
  return `vid_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}
