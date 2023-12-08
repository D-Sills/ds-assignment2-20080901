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
          maxReceiveCount: 1,
        }
      });
      
      const imageEventsTopic = new sns.Topic(this, 'ImageEventsTopic', {
        displayName: 'Image Events Topic'
      });
      
      
  // Lambda functions
  const processImageFn = this.createLambdaFunction(
    "ProcessImageFn",
    "../lambdas/processImage.ts",
    imageTable
  );

  const mailerFn = this.createLambdaFunction(
    "MailerFunction",
    "../lambdas/mailer.ts",
    imageTable
  );
  
  const rejectionMailerFn = this.createLambdaFunction(
    "RejectionMailerFunction",
    "../lambdas/rejectionMailer.ts",
    imageTable
  );
  
  const imageDeletionFn = this.createLambdaFunction(
    "ImageDeletionFunction",
    "../lambdas/imageDelete.ts",
    imageTable,
    {
      TOPIC_ARN: imageEventsTopic.topicArn,
    }
  );
  
  const updateTableFn = this.createLambdaFunction(
    "UpdateTableFunction",
    "../lambdas/updateTable.ts",
    imageTable
  );
  
  // Event triggers
  imagesBucket.addEventNotification(
    s3.EventType.OBJECT_CREATED,
    new s3n.SnsDestination(imageEventsTopic)
  );
  
  imageEventsTopic.addSubscription(new subs.LambdaSubscription(processImageFn));
  imageEventsTopic.addSubscription(new subs.LambdaSubscription(imageDeletionFn));
  imageEventsTopic.addSubscription(new subs.SqsSubscription(imageProcessQueue));
  imageEventsTopic.addSubscription(new subs.SqsSubscription(imageRejectionDLQ));
  imageEventsTopic.addSubscription(new subs.SqsSubscription(mailerQ));
  
  imagesBucket.addEventNotification(
    s3.EventType.OBJECT_REMOVED_DELETE,
    new s3n.SnsDestination(imageEventsTopic)
  );

  const updateFilterPolicy = {
    comment_type: sns.SubscriptionFilter.stringFilter({
      allowlist: ["Caption"]
    })
  };
  
  imageEventsTopic.addSubscription(new subs.LambdaSubscription(updateTableFn, {
    filterPolicy: updateFilterPolicy
  }));

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
  imageEventsTopic.grantPublish(processImageFn);
  imageEventsTopic.grantPublish(processImageFn);
  imageRejectionDLQ.grantSendMessages(rejectionMailerFn);
  imagesBucket.grantRead(processImageFn);
  imageTable.grantWriteData(processImageFn);
  imageTable.grantWriteData(imageDeletionFn);
  imageTable.grantWriteData(updateTableFn);
  
  // Output the bucket name
  new cdk.CfnOutput(this, "bucketName", {
    value: imagesBucket.bucketName,
  });
  }
  
  private createLambdaFunction(
    functionId: string,
        entryPath: string,
        table: dynamodb.ITable,
        additionalEnv?: { [key: string]: string }
    ): lambdanode.NodejsFunction {
        return new lambdanode.NodejsFunction(this, functionId, {
            architecture: lambda.Architecture.ARM_64,
            runtime: lambda.Runtime.NODEJS_16_X,
            entry: `${__dirname}/${entryPath}`,
            timeout: cdk.Duration.seconds(10),
            memorySize: 1024,
            environment: {
                TABLE_NAME: table.tableName,
                REGION: "eu-west-1",
                ...additionalEnv,
            },
        });
    }
}
