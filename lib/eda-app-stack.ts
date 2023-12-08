import * as cdk from "aws-cdk-lib";
import * as lambdanode from "aws-cdk-lib/aws-lambda-nodejs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3n from "aws-cdk-lib/aws-s3-notifications";
import * as events from "aws-cdk-lib/aws-lambda-event-sources";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as sns from "aws-cdk-lib/aws-sns";
import * as subs from "aws-cdk-lib/aws-sns-subscriptions";
import * as iam from "aws-cdk-lib/aws-iam";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import { Construct } from "constructs";
// import * as sqs from 'aws-cdk-lib/aws-sqs';

export class EDAAppStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Import the table ARN and create a reference to the DynamoDB table
    const imageDatabaseArn = cdk.Fn.importValue("ImageTableArn");
    const imageTable = dynamodb.Table.fromTableArn(
      this,
      "ImportedTable",
      imageDatabaseArn
    );

    const imagesBucket = new s3.Bucket(this, "images", {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      publicReadAccess: false,
    });

      // Integration infrastructure
      const imageRejectionDLQ = new sqs.Queue(this, "ImageRejectionDLQ", {
        queueName: "ImageRejectionDLQ",
        retentionPeriod: cdk.Duration.days(14), // Customize to your preference
      });
      
            const mailerQ = new sqs.Queue(this, "mailer-queue", {
        receiveMessageWaitTime: cdk.Duration.seconds(10),
      });
      
      const imageProcessQueue = new sqs.Queue(this, "img-created-queue", {
        receiveMessageWaitTime: cdk.Duration.seconds(10),
        deadLetterQueue: {
          queue: imageRejectionDLQ,
          maxReceiveCount: 3,
        }
      });

      const newImageTopic = new sns.Topic(this, "NewImageTopic", {
        displayName: "New Image topic",
      }); 
      
      const rejectionTopic = new sns.Topic(this, "RejectionTopic", {
        displayName: "Rejection topic",
      });
  // Lambda functions

  const processImageFn = new lambdanode.NodejsFunction(
    this,
    "ProcessImageFn",
    {
      // architecture: lambda.Architecture.ARM_64,
      runtime: lambda.Runtime.NODEJS_18_X,
      entry: `${__dirname}/../lambdas/processImage.ts`,
      timeout: cdk.Duration.seconds(15),
      memorySize: 128,
      environment: {
        TABLE_NAME: imageTable.tableName, 
        REGION: "eu-west-1",
        DLQ_ARN: rejectionTopic.topicArn,
      },
    }
  );

  const mailerFn = new lambdanode.NodejsFunction(this, "MailerFunction", {
    architecture: lambda.Architecture.ARM_64,
    runtime: lambda.Runtime.NODEJS_18_X,
    memorySize: 1024,
    timeout: cdk.Duration.seconds(10),
    entry: `${__dirname}/../lambdas/mailer.ts`,
  });
  
  const rejectionMailerFn = new lambdanode.NodejsFunction(this, "RejectionMailerFunction", {
    runtime: lambda.Runtime.NODEJS_18_X, 
    memorySize: 1024,
    timeout: cdk.Duration.seconds(10),
    entry: `${__dirname}/../lambdas/rejectionMailer.ts`, // Adjust the path to where your Lambda code is
  });
  
  // Event triggers

  imagesBucket.addEventNotification(
    s3.EventType.OBJECT_CREATED,
    new s3n.SnsDestination(newImageTopic)  // Changed
);

newImageTopic.addSubscription(
  new subs.SqsSubscription(imageProcessQueue)
);

rejectionTopic.addSubscription(
  new subs.SqsSubscription(imageRejectionDLQ)
);

newImageTopic.addSubscription(new subs.SqsSubscription(mailerQ));

  const newImageEventSource = new events.SqsEventSource(imageProcessQueue, {
    batchSize: 5,
    maxBatchingWindow: cdk.Duration.seconds(10),
  });

  const newImageMailEventSource = new events.SqsEventSource(mailerQ, {
    batchSize: 5,
    maxBatchingWindow: cdk.Duration.seconds(10),
  }); 

  const rejectionMailerEventSource = new events.SqsEventSource(imageRejectionDLQ, {
    batchSize: 5,
    maxBatchingWindow: cdk.Duration.seconds(10),
  });

  mailerFn.addEventSource(newImageMailEventSource);
  rejectionMailerFn.addEventSource(rejectionMailerEventSource);
  processImageFn.addEventSource(newImageEventSource);


  mailerFn.addToRolePolicy(
    new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        "ses:SendEmail",
        "ses:SendRawEmail",
        "ses:SendTemplatedEmail",
      ],
      resources: ["*"],
    })
  );

  rejectionMailerFn.addToRolePolicy(
  new iam.PolicyStatement({
    effect: iam.Effect.ALLOW,
    actions: [
      "ses:SendEmail",
      "ses:SendRawEmail",
      "ses:SendTemplatedEmail",
    ],
    resources: ["*"],
  }));
  // Permissions
  rejectionTopic.grantPublish(processImageFn);
  newImageTopic.grantPublish(processImageFn);
  imageRejectionDLQ.grantSendMessages(rejectionMailerFn);
  imagesBucket.grantRead(processImageFn);
  imageTable.grantWriteData(processImageFn);
 
  // Output
  
  new cdk.CfnOutput(this, "bucketName", {
    value: imagesBucket.bucketName,
  });
  }
}
