// CDK stack demonstrating Lambda MI with auto-scaling (always-on API) vs manual scaling (on-demand processing)
// The video processing workflow is simulated - focus on the capacity provider patterns
import * as path from 'node:path'
import * as cdk from 'aws-cdk-lib'
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2'
import * as apigatewayv2_integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations'
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb'
import * as ec2 from 'aws-cdk-lib/aws-ec2'
import * as iam from 'aws-cdk-lib/aws-iam'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as logs from 'aws-cdk-lib/aws-logs'
import * as sfn from 'aws-cdk-lib/aws-stepfunctions'
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks'
import type { Construct } from 'constructs'

export class LambdaMiStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props)

    const vpcId = scope.node.tryGetContext('vpcId')
    const vpc = vpcId
      ? ec2.Vpc.fromLookup(this, 'VPC', { vpcId })
      : new ec2.Vpc(this, 'VPC')

    const videosTable = new dynamodb.Table(this, 'VideosTable', {
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
    })

    videosTable.addGlobalSecondaryIndex({
      indexName: 'StatusIndex',
      partitionKey: { name: 'status', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'createdAt', type: dynamodb.AttributeType.STRING },
    })

    const capacityProviderSg = new ec2.SecurityGroup(
      this,
      'CapacityProviderSG',
      {
        vpc,
        allowAllOutbound: true,
        description: 'Security group for Lambda Capacity Provider',
      },
    )

    // Lambda MI requires an operator role with permissions to manage EC2 resources (instances, ENIs, etc.)
    const operatorRole = new iam.Role(this, 'OperatorRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    })

    operatorRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName(
        'AWSLambdaManagedEC2ResourceOperator',
      ),
    )

    // Auto-scaling: Lambda MI manages execution environments automatically based on demand
    const apiCapacityProvider = new lambda.CapacityProvider(
      this,
      'ApiCapacityProvider',
      {
        subnets: vpc.privateSubnets,
        securityGroups: [capacityProviderSg],
        operatorRole,
        architectures: [lambda.Architecture.ARM_64],
        scalingOptions: lambda.ScalingOptions.auto(),
        maxVCpuCount: 32,
      },
    )

    // Manual scaling: we control when to scale via API calls (see scalingFunction below)
    // Target tracking policy keeps CPU at 70% utilization once environments are provisioned
    const processorCapacityProvider = new lambda.CapacityProvider(
      this,
      'ProcessorCapacityProvider',
      {
        subnets: vpc.privateSubnets,
        securityGroups: [capacityProviderSg],
        operatorRole,
        architectures: [lambda.Architecture.ARM_64],
        scalingOptions: lambda.ScalingOptions.manual([
          lambda.TargetTrackingScalingPolicy.cpuUtilization(70),
        ]),
      },
    )

    const apiFunction = new lambda.Function(this, 'VideoApiFunction', {
      runtime: lambda.Runtime.NODEJS_24_X,
      code: lambda.Code.fromAsset(
        path.join(__dirname, '..', 'functions', 'video-api'),
      ),
      handler: 'index.handler',
      architecture: lambda.Architecture.ARM_64,
      timeout: cdk.Duration.seconds(30),
      environment: {
        TABLE_NAME: videosTable.tableName,
        STATE_MACHINE_ARN: '', // Will be set after state machine creation
      },
      logGroup: new logs.LogGroup(this, 'VideoApiFunctionLogGroup', {
        retention: logs.RetentionDays.ONE_WEEK,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }),
    })

    videosTable.grantReadWriteData(apiFunction)

    // Keep 1 environment always warm for low-latency API responses
    apiCapacityProvider.addFunction(apiFunction, {
      executionEnvironmentMemoryGiBPerVCpu: 2.0,
      perExecutionEnvironmentMaxConcurrency: 64,
      latestPublishedScalingConfig: {
        minExecutionEnvironments: 1,
        maxExecutionEnvironments: 1,
      },
    })

    const processorFunction = new lambda.Function(
      this,
      'VideoProcessorFunction',
      {
        runtime: lambda.Runtime.NODEJS_24_X,
        code: lambda.Code.fromAsset(
          path.join(__dirname, '..', 'functions', 'video-processor'),
        ),
        handler: 'index.handler',
        architecture: lambda.Architecture.ARM_64,
        timeout: cdk.Duration.minutes(5),
        memorySize: 2048,
        environment: {
          TABLE_NAME: videosTable.tableName,
        },
        logGroup: new logs.LogGroup(this, 'VideoProcessorFunctionLogGroup', {
          retention: logs.RetentionDays.ONE_WEEK,
          removalPolicy: cdk.RemovalPolicy.DESTROY,
        }),
      },
    )

    videosTable.grantReadWriteData(processorFunction)

    // Start with 0 environments (cost-efficient) - scale up on-demand via Step Functions workflow
    processorCapacityProvider.addFunction(processorFunction, {
      executionEnvironmentMemoryGiBPerVCpu: 2.0,
      perExecutionEnvironmentMaxConcurrency: 32,
      latestPublishedScalingConfig: {
        minExecutionEnvironments: 0,
        maxExecutionEnvironments: 0,
      },
    })

    const scalingFunction = new lambda.Function(this, 'ScalingFunction', {
      runtime: lambda.Runtime.NODEJS_24_X,
      handler: 'index.handler',
      architecture: lambda.Architecture.ARM_64,
      timeout: cdk.Duration.seconds(30),
      code: lambda.Code.fromAsset(
        path.join(__dirname, '..', 'functions', 'scaling-function'),
      ),
      logGroup: new logs.LogGroup(this, 'ScalingFunctionLogGroup', {
        retention: logs.RetentionDays.ONE_WEEK,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }),
    })

    // Permissions to control the processor's execution environments via the scaling config API
    scalingFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          'lambda:PutFunctionScalingConfig',
          'lambda:GetFunctionScalingConfig',
        ],
        resources: [`${processorFunction.functionArn}:$LATEST.PUBLISHED`],
      }),
    )

    // Step Functions workflow: scale up → poll until ready → process → scale down
    // This pattern ensures environments are warm before processing, then releases them after
    const scaleUpTask = new tasks.LambdaInvoke(this, 'ScaleUpProcessor', {
      lambdaFunction: scalingFunction,
      payload: sfn.TaskInput.fromObject({
        functionName: processorFunction.functionName,
        minExecutionEnvironments: 100,
        maxExecutionEnvironments: 100,
      }),
      resultPath: '$.scaleUpResult',
    })

    const scaleDownTask = new tasks.LambdaInvoke(this, 'ScaleDownProcessor', {
      lambdaFunction: scalingFunction,
      payload: sfn.TaskInput.fromObject({
        functionName: processorFunction.functionName,
        minExecutionEnvironments: 0,
        maxExecutionEnvironments: 0,
      }),
      resultPath: '$.scaleDownResult',
    })

    const checkScalingTask = new tasks.LambdaInvoke(
      this,
      'CheckScalingConfig',
      {
        lambdaFunction: scalingFunction,
        payload: sfn.TaskInput.fromObject({
          action: 'check',
          functionName: processorFunction.functionName,
        }),
        resultPath: '$.scalingCheck',
      },
    )

    const waitBetweenChecks = new sfn.Wait(this, 'WaitBetweenChecks', {
      time: sfn.WaitTime.duration(cdk.Duration.seconds(1)),
    })

    const processVideoTask = new tasks.LambdaInvoke(this, 'ProcessVideo', {
      lambdaFunction: processorFunction,
      payload: sfn.TaskInput.fromObject({
        videoId: sfn.JsonPath.stringAt('$.videoId'),
      }),
      resultPath: '$.processingResult',
    })

    const handleError = new sfn.Pass(this, 'HandleProcessingError', {
      result: sfn.Result.fromObject({
        status: 'failed',
        error: 'Processing failed',
      }),
    })

    const successState = new sfn.Succeed(this, 'ProcessingSucceeded')
    const failureState = new sfn.Fail(this, 'ProcessingFailed', {
      cause: 'Video processing failed',
      error: 'ProcessingError',
    })

    const scaleDownOnError = new tasks.LambdaInvoke(
      this,
      'ScaleDownProcessorOnError',
      {
        lambdaFunction: scalingFunction,
        payload: sfn.TaskInput.fromObject({
          functionName: processorFunction.functionName,
          minExecutionEnvironments: 0,
          maxExecutionEnvironments: 0,
        }),
        resultPath: '$.scaleDownResultError',
      },
    ).next(failureState)

    // Build the polling loop for scaling check
    const scalingReadyPass = new sfn.Pass(this, 'ScalingReady')

    const isScalingReady = new sfn.Choice(this, 'IsScalingReady')
      .when(
        sfn.Condition.booleanEquals('$.scalingCheck.Payload.isReady', true),
        scalingReadyPass,
      )
      .otherwise(waitBetweenChecks)

    waitBetweenChecks.next(checkScalingTask)
    checkScalingTask.next(isScalingReady)

    scalingReadyPass.next(processVideoTask)

    processVideoTask.addCatch(handleError.next(scaleDownOnError), {
      resultPath: '$.error',
    })
    processVideoTask.next(scaleDownTask)
    scaleDownTask.next(successState)

    const definition = scaleUpTask.next(checkScalingTask)

    const stateMachine = new sfn.StateMachine(
      this,
      'VideoProcessingStateMachine',
      {
        definitionBody: sfn.DefinitionBody.fromChainable(definition),
        timeout: cdk.Duration.minutes(10),
        logs: {
          destination: new logs.LogGroup(this, 'StateMachineLogGroup', {
            retention: logs.RetentionDays.ONE_WEEK,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
          }),
          level: sfn.LogLevel.ALL,
        },
      },
    )

    apiFunction.addEnvironment(
      'STATE_MACHINE_ARN',
      stateMachine.stateMachineArn,
    )
    stateMachine.grantStartExecution(apiFunction)

    const httpApi = new apigatewayv2.HttpApi(this, 'VideoApi', {
      apiName: 'video-processing-api',
      description: 'API for video processing service using Lambda MI',
      corsPreflight: {
        allowOrigins: ['*'],
        allowMethods: [apigatewayv2.CorsHttpMethod.ANY],
        allowHeaders: ['*'],
      },
    })

    const integration = new apigatewayv2_integrations.HttpLambdaIntegration(
      'ApiIntegration',
      apiFunction,
    )

    httpApi.addRoutes({
      path: '/{proxy+}',
      methods: [apigatewayv2.HttpMethod.ANY],
      integration,
    })

    httpApi.addRoutes({
      path: '/',
      methods: [apigatewayv2.HttpMethod.ANY],
      integration,
    })

    new cdk.CfnOutput(this, 'ApiEndpoint', {
      value: httpApi.apiEndpoint,
      description: 'HTTP API Gateway Endpoint',
    })

    new cdk.CfnOutput(this, 'VideosTableName', {
      value: videosTable.tableName,
      description: 'DynamoDB Videos Table Name',
    })

    new cdk.CfnOutput(this, 'StateMachineArn', {
      value: stateMachine.stateMachineArn,
      description: 'Step Functions State Machine ARN',
    })

    new cdk.CfnOutput(this, 'ApiCapacityProviderArn', {
      value: apiCapacityProvider.capacityProviderArn,
      description: 'API Capacity Provider ARN',
    })

    new cdk.CfnOutput(this, 'ProcessorCapacityProviderArn', {
      value: processorCapacityProvider.capacityProviderArn,
      description: 'Processor Capacity Provider ARN',
    })
  }
}
