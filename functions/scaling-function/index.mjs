import { LambdaClient, PutFunctionScalingConfigCommand, GetFunctionScalingConfigCommand } from '@aws-sdk/client-lambda';

const lambda = new LambdaClient({});

export const handler = async (event) => {
  console.log('Scaling request:', JSON.stringify(event));
  
  const { action, functionName, minExecutionEnvironments, maxExecutionEnvironments } = event;
  
  if (action === 'check') {
    // Check if scaling config is applied and ready
    const command = new GetFunctionScalingConfigCommand({
      FunctionName: functionName,
      Qualifier: '$LATEST.PUBLISHED',
    });
    
    const response = await lambda.send(command);
    console.log('Scaling config check:', response);
    
    const applied = response.AppliedFunctionScalingConfig || {};
    const isReady = (applied.MinExecutionEnvironments || 0) > 0 && 
                    (applied.MaxExecutionEnvironments || 0) > 0;
    
    return {
      statusCode: 200,
      isReady,
      appliedMin: applied.MinExecutionEnvironments || 0,
      appliedMax: applied.MaxExecutionEnvironments || 0,
      response,
    };
  }
  
  // Scale up or scale down
  const command = new PutFunctionScalingConfigCommand({
    FunctionName: functionName,
    Qualifier: '$LATEST.PUBLISHED',
    FunctionScalingConfig: {
      MinExecutionEnvironments: minExecutionEnvironments,
      MaxExecutionEnvironments: maxExecutionEnvironments,
    },
  });
  
  const response = await lambda.send(command);
  console.log('Scaling response:', response);
  
  return {
    statusCode: 200,
    minExecutionEnvironments,
    maxExecutionEnvironments,
    response,
  };
};
