/* eslint-disable import/extensions, import/no-absolute-path */
import { SQSHandler } from "aws-lambda";
import {
  GetObjectCommand,
  PutObjectCommandInput,
  GetObjectCommandInput,
  S3Client,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";

const s3 = new S3Client();
const ddbDocClient = createDDbDocClient();

export const handler: SQSHandler = async (event) => {
  console.log("Event ", event);
  for (const record of event.Records) {
    const recordBody = JSON.parse(record.body);  // Parse SQS message
    const snsMessage = JSON.parse(recordBody.Message); // Parse SNS message

    if (snsMessage.Records) {
      console.log("Record body ", JSON.stringify(snsMessage));
      for (const messageRecord of snsMessage.Records) {
        const s3e = messageRecord.s3;
        const srcBucket = s3e.bucket.name;
        // Object key may have spaces or unicode non-ASCII characters.
        const srcKey = decodeURIComponent(s3e.object.key.replace(/\+/g, " "));
        const fileExtension = srcKey.split('.').pop()?.toLowerCase();
        
        if (fileExtension === 'jpeg' || fileExtension === 'png' || fileExtension === 'jpg') {
          // File has correct extension, proceed with processing and write to DynamoDB
          try {
            let origimage = null;
            
              // Download the image from the S3 source bucket.
              // is this needed? i'm not sure why we need to download the image
              const params: GetObjectCommandInput = {
                Bucket: srcBucket,
                Key: srcKey,
              };
              origimage = await s3.send(new GetObjectCommand(params));
              
              await ddbDocClient.send(new PutCommand({
                TableName: process.env.TABLE_NAME,
                Item: {
                  fileName: srcKey,
                  uploadTime: new Date().toISOString(),
                }
              }));
              console.log(`Processed and logged image: ${srcKey}`);
              
            } catch (error) {
              console.log(error);
            }
          } else {
          // File has incorrect extension, send to DLQ
          const params = {
            Message: JSON.stringify({ fileName: srcKey }),
            TopicArn: process.env.DLQ_ARN,
          };
          const snsClient = new SNSClient({ region: process.env.REGION });
          await snsClient.send(new PublishCommand(params));
        }
      }
    }
  }
};

function createDDbDocClient() {
  const ddbClient = new DynamoDBClient({ region: process.env.REGION });
  const marshallOptions = {
      convertEmptyValues: true,
      removeUndefinedValues: true,
      convertClassInstanceToMap: true,
  };
  const unmarshallOptions = {
      wrapNumbers: false,
  };
  const translateConfig = { marshallOptions, unmarshallOptions };
  return DynamoDBDocumentClient.from(ddbClient, translateConfig);
}