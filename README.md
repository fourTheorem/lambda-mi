# AWS Lambda Managed Instaces minimal example

## Overview
This AWS CDK stack demonstrates how to set up a Lambda Capacity Provider using AWS Lambda Managed Instances (Lambda MI) to run a Node.js 24.x Lambda function on ARM64 architecture within an existing VPC.

## Prerequisites

- A VPC with private subnets
- Node.js 24.x
- AWS credentials configured

## Deployment

```bash
npx cdk deploy -c vpcId=<VPC_ID>
```

## Components

```mermaid
graph TB
    Stack[LambdaMiStack]
    VPC[VPC<br/>Existing VPC Lookup]
    Fn[Lambda Function<br/>MyFunction<br/>Node.js 24.x ARM64]
    SG[Security Group<br/>CapacityProviderSG]
    Role[IAM Role<br/>OperatorRole]
    CP[Lambda Capacity Provider<br/>MyCapacityProvider<br/>Max 32 vCPU, ARM64]
    
    Stack --> VPC
    Stack --> Fn
    Stack --> SG
    Stack --> Role
    Stack --> CP
    
    VPC -.->|lookup| SG
    VPC -.->|private subnets| CP
    SG -->|attached to| CP
    Role -->|operator role| CP
    CP -->|manages| Fn
    
    style Stack fill:#0969da,stroke:#1f6feb,color:#fff
    style VPC fill:#bf8700,stroke:#9a6700,color:#fff
    style Fn fill:#1a7f37,stroke:#26a148,color:#fff
    style CP fill:#8250df,stroke:#9a6feb,color:#fff
    style SG fill:#bc4c00,stroke:#e36209,color:#fff
    style Role fill:#d1242f,stroke:#e34850,color:#fff
```
