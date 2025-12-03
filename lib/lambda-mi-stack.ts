import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ec2 from 'aws-cdk-lib/aws-ec2';


export class LambdaMiStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const vpcId = scope.node.tryGetContext('vpcId');
    const vpc = ec2.Vpc.fromLookup(this, 'VPC', { vpcId });

    const fn = new lambda.Function(this, 'MyFunction', {
      runtime: lambda.Runtime.NODEJS_24_X,
      code: lambda.Code.fromInline('exports.handler = async () => "Hello, World!";'),
      handler: 'index.handler',
      architecture: lambda.Architecture.ARM_64,
    });

    const capacityProviderSg = new ec2.SecurityGroup(this, 'CapacityProviderSG', {
      vpc,
      allowAllOutbound: true,
      description: 'Security group for Lambda Capacity Provider',
    });

    const operatorRole = new iam.Role(this, 'OperatorRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    });

    operatorRole.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName("AWSLambdaManagedEC2ResourceOperator"));

    const capacityProvider = new lambda.CapacityProvider(this, 'MyCapacityProvider', {
      subnets: vpc.privateSubnets,
      securityGroups: [capacityProviderSg],
      operatorRole,
      architectures: [lambda.Architecture.ARM_64],
      scalingOptions: lambda.ScalingOptions.auto(),
      maxVCpuCount: 32,
    });

    capacityProvider.addFunction(fn);

  }
}
