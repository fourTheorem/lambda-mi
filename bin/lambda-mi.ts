#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib'
import { LambdaMiStack } from '../lib/lambda-mi-stack'

const app = new cdk.App()
new LambdaMiStack(app, 'LambdaMiStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
})
