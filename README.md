# AWS Lambda Managed Instaces minimal example

## Prequisites

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
    
    style Stack fill:#e1f5ff
    style VPC fill:#fff4e6
    style Fn fill:#e8f5e9
    style CP fill:#f3e5f5
    style SG fill:#fff3e0
    style Role fill:#fce4ec
```
