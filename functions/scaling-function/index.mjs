/**
 * Controls Lambda MI execution environments for manual scaling capacity providers.
 *
 * Supports two operations:
 * - Scale (up/down): Sets min/max execution environments
 * - Check: Polls if scaling config is applied and ready
 *
 * Example events from Step Functions:
 *
 * ScaleUpProcessor / ScaleDownProcessor:
 * {
 *   "functionName": "LambdaMiStack-VideoProcessorFunction...",
 *   "minExecutionEnvironments": 100, // or 0 for scale down
 *   "maxExecutionEnvironments": 100  // or 0 for scale down
 * }
 *
 * CheckScalingConfig:
 * {
 *   "action": "check",
 *   "functionName": "LambdaMiStack-VideoProcessorFunction..."
 * }
 */
import {
  GetFunctionScalingConfigCommand,
  LambdaClient,
  PutFunctionScalingConfigCommand,
} from '@aws-sdk/client-lambda'

const lambda = new LambdaClient()

export const handler = async (event) => {
  console.log('Scaling request:', JSON.stringify(event))

  const {
    action,
    functionName,
    minExecutionEnvironments,
    maxExecutionEnvironments,
  } = event

  if (action === 'check') {
    // $LATEST.PUBLISHED targets the auto-published version that Lambda MI creates
    const command = new GetFunctionScalingConfigCommand({
      FunctionName: functionName,
      Qualifier: '$LATEST.PUBLISHED',
    })

    const response = await lambda.send(command)
    console.log('Scaling config check:', response)

    // AppliedFunctionScalingConfig reflects actual state (vs requested which may still be provisioning)
    const applied = response.AppliedFunctionScalingConfig || {}
    const isReady =
      (applied.MinExecutionEnvironments || 0) > 0 &&
      (applied.MaxExecutionEnvironments || 0) > 0

    return {
      statusCode: 200,
      isReady,
      appliedMin: applied.MinExecutionEnvironments || 0,
      appliedMax: applied.MaxExecutionEnvironments || 0,
      response,
    }
  }

  // Scale up or scale down
  const command = new PutFunctionScalingConfigCommand({
    FunctionName: functionName,
    Qualifier: '$LATEST.PUBLISHED',
    FunctionScalingConfig: {
      MinExecutionEnvironments: minExecutionEnvironments,
      MaxExecutionEnvironments: maxExecutionEnvironments,
    },
  })

  const response = await lambda.send(command)
  console.log('Scaling response:', response)

  return {
    statusCode: 200,
    minExecutionEnvironments,
    maxExecutionEnvironments,
    response,
  }
}
