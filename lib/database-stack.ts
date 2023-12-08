import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

export class ImageStorageStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // DynamoDB table for image file names
    const imagesTable = new dynamodb.Table(this, 'ImageFiles', {
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      partitionKey: {
        name: 'fileName', 
        type: dynamodb.AttributeType.STRING,
      },
      tableName: 'ImageFiles',
      removalPolicy: cdk.RemovalPolicy.DESTROY, 
    });

    // Output the table ARN for cross-stack access
    new cdk.CfnOutput(this, 'ImageTableArn', {
      value: imagesTable.tableArn,
      exportName: 'ImageTableArn',
    });
    
    
  }
}
