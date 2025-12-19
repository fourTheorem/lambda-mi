# GitHub Copilot Instructions for lambda-mi

## Project Overview
This is an AWS CDK TypeScript project demonstrating AWS Lambda Managed Instances (Lambda MI). It showcases how to configure Lambda Capacity Providers to run Lambda functions on dedicated compute capacity within a VPC.

## Technology Stack
- **Language**: TypeScript 5.6.x
- **Framework**: AWS CDK 2.x
- **Runtime**: Node.js 24.x
- **Architecture**: ARM64
- **Testing**: Jest 29.x
- **AWS Services**: Lambda, EC2 (VPC), IAM

## Project Structure
```
lambda-mi/
├── bin/              # CDK app entry point
├── lib/              # CDK stack definitions
│   └── lambda-mi-stack.ts
├── test/             # Jest tests
├── cdk.json          # CDK configuration
├── package.json      # Dependencies and scripts
└── tsconfig.json     # TypeScript configuration
```

## Key Concepts

### Lambda Managed Instances (Lambda MI)
- Lambda MI provides dedicated compute capacity for Lambda functions
- Functions run in customer VPCs with enhanced networking control
- Supports both auto-scaling and manual scaling policies
- Requires capacity providers, operator roles, and VPC configuration

### Stack Components
1. **Lambda Functions**: Node.js 24.x on ARM64 architecture
2. **Capacity Providers**: Manage dedicated compute resources
3. **Security Groups**: Control network access
4. **Operator Role**: IAM role with `AWSLambdaManagedEC2ResourceOperator` policy
5. **VPC Integration**: Uses existing VPC with private subnets

## Code Conventions

### TypeScript
- Use explicit types where beneficial for clarity
- Leverage CDK L2 constructs (high-level abstractions)
- Follow AWS CDK best practices for resource naming

### CDK Patterns
- Stack resources should be created in logical order: VPC → IAM → Lambda → Capacity Provider
- Use `tryGetContext()` for runtime configuration (e.g., VPC ID)
- Create security groups before capacity providers
- Configure operator roles with appropriate managed policies

### Naming
- Use PascalCase for construct IDs (e.g., `MyFunction`, `CapacityProviderSG`)
- Use descriptive names that indicate the resource type
- Prefix related resources (e.g., `CapacityProvider` prefix for scaling-related resources)

## Common Tasks

### Adding a New Lambda Function
```typescript
const fn = new lambda.Function(this, 'MyFunction', {
  runtime: lambda.Runtime.NODEJS_24_X,
  code: lambda.Code.fromInline('exports.handler = async () => "Hello!";'),
  handler: 'index.handler',
  architecture: lambda.Architecture.ARM_64,
});
```

### Creating a Capacity Provider with Auto Scaling
```typescript
const capacityProvider = new lambda.CapacityProvider(this, 'MyCapacityProvider', {
  subnets: vpc.privateSubnets,
  securityGroups: [capacityProviderSg],
  operatorRole,
  architectures: [lambda.Architecture.ARM_64],
  scalingOptions: lambda.ScalingOptions.auto(),
  maxVCpuCount: 32,
});
```

### Creating a Capacity Provider with Manual Scaling
```typescript
const capacityProvider = new lambda.CapacityProvider(this, 'MyCapacityProvider', {
  subnets: vpc.privateSubnets,
  securityGroups: [capacityProviderSg],
  operatorRole,
  architectures: [lambda.Architecture.ARM_64],
  scalingOptions: lambda.ScalingOptions.manual([
    lambda.TargetTrackingScalingPolicy.cpuUtilization(50),
  ]),
});
```

### Attaching Functions to Capacity Providers
```typescript
capacityProvider.addFunction(fn, {
  executionEnvironmentMemoryGiBPerVCpu: 2.0,
  perExecutionEnvironmentMaxConcurrency: 64,
  latestPublishedScalingConfig: {
    minExecutionEnvironments: 1,
    maxExecutionEnvironments: 1
  }
});
```

## Build & Test Commands
```bash
npm run build          # Compile TypeScript
npm run watch          # Watch mode for development
npm run test           # Run Jest tests
npm run cdk            # CDK CLI commands
npx cdk deploy -c vpcId=<VPC_ID>  # Deploy with VPC context
npx cdk synth          # Synthesize CloudFormation
npx cdk diff           # Show diff with deployed stack
```

## Important Configuration

### VPC Requirement
- Stack requires an existing VPC ID passed via CDK context
- Uses private subnets for capacity provider deployment
- VPC is looked up at synthesis time

### IAM Permissions
- Operator role must have `AWSLambdaManagedEC2ResourceOperator` managed policy
- This grants permissions to manage EC2 resources for Lambda MI

### Scaling Configuration
- `executionEnvironmentMemoryGiBPerVCpu`: Memory per vCPU ratio
- `perExecutionEnvironmentMaxConcurrency`: Max concurrent executions per environment
- `minExecutionEnvironments` / `maxExecutionEnvironments`: Scaling bounds

## When Suggesting Code

### Do:
- Use ARM64 architecture for Lambda functions in this project
- Include proper VPC, security group, and IAM role configuration
- Consider both auto-scaling and manual scaling options
- Use Node.js 24.x runtime for consistency
- Follow the existing pattern of creating shared resources (SG, roles) before capacity providers

### Don't:
- Don't create Lambda functions without specifying ARM64 architecture
- Don't create capacity providers without operator roles
- Don't forget to attach functions to capacity providers
- Don't hardcode VPC IDs (use context or lookup)
- Avoid mixing architectures within a capacity provider

## Testing Approach
- Unit tests should use CDK assertions (`aws-cdk-lib/assertions`)
- Test that resources are created with expected properties
- Verify IAM policies and security group configurations
- Validate capacity provider configurations

## Dependencies
Key packages:
- `aws-cdk-lib`: CDK core library
- `constructs`: Base construct library
- `typescript`: TypeScript compiler
- `jest` & `ts-jest`: Testing framework

## Additional Resources
- See `LAMBDA_MANAGED_INSTANCES_SUMMARY.md` for Lambda MI details
- AWS CDK documentation: https://docs.aws.amazon.com/cdk/
- Lambda MI documentation: AWS Lambda Developer Guide
