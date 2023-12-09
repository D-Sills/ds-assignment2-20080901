import { SNSEvent, SQSHandler } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";

const ddbDocClient = createDDbDocClient();

export const handler = async (event: SNSEvent) => {
    console.log("Event ", JSON.stringify(event, null, 2));

    for (const record of event.Records) {
        const snsRecord = record.Sns;
        const { MessageAttributes, Message } = snsRecord;

        if (
            MessageAttributes &&
            MessageAttributes.comment_type.Value === "Caption"
        ) {
            const { name, description } = JSON.parse(Message);

            try {
                await ddbDocClient.send(
                    new UpdateCommand({
                        TableName: process.env.TABLE_NAME,
                        Key: {
                            fileName: name,
                        },
                        UpdateExpression: "set description = :d",
                        ExpressionAttributeValues: {
                            ":d": description,
                        },
                    })
                );
                console.log(
                    `Updated image record in DynamoDB: ${name} with description: ${description}`
                );
            } catch (error) {
                console.error(
                    `Error updating image record in DynamoDB: ${error}`
                );
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
