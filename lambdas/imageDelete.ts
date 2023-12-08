import { SQSHandler } from "aws-lambda";
import { DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";

const ddbDocClient = createDDbDocClient();

export const handler: SQSHandler = async (event) => {
    console.log("ARN ", process.env.TOPIC_ARN); // just for the update command
    console.log("Event ", event);
    for (const record of event.Records) {
    const snsRecord = record as any; // Cast record to SNS type, thank you typescript
    const message = snsRecord.Sns.Message; // Get the Message property from the Sns object, thank you cloudwatch logs
    
    const messageData = JSON.parse(message);
        
      if (messageData.Records) {
        for (const messageRecord of messageData.Records) {
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