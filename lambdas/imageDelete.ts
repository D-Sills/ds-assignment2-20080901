import { SQSHandler } from "aws-lambda";
import { DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";

const ddbDocClient = createDDbDocClient();

export const handler: SQSHandler = async (event) => {
    console.log("Event ", event);
    for (const record of event.Records) {
    const recordBody = JSON.parse(record.body);  // Parse SQS message
    const snsMessage = JSON.parse(recordBody.Message); // Parse SNS message
  
      if (snsMessage.Records) {
        for (const messageRecord of snsMessage.Records) {
          const s3e = messageRecord.s3;
          const srcKey = decodeURIComponent(s3e.object.key.replace(/\+/g, " "));
  
          try {
            await ddbDocClient.send(new DeleteCommand({
              TableName: process.env.TABLE_NAME,
              Key: {
                fileName: srcKey,
              }
            }));
            console.log(`Deleted image record from DynamoDB: ${srcKey}`);
          } catch (error) {
            console.error(`Error deleting image record from DynamoDB: ${error}`);
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