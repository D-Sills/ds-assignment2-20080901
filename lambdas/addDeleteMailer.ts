import { DynamoDBStreamHandler } from "aws-lambda";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { SES_EMAIL_FROM, SES_EMAIL_TO } from "../env";

const sesClient = new SESClient({ region: "eu-west-1" });

export const handler: DynamoDBStreamHandler = async (event) => {
    for (const record of event.Records) {
        let emailSubject = "";
        let emailBody = "";
        let fileName =
            record.dynamodb?.NewImage?.fileName?.S ||
            record.dynamodb?.OldImage?.fileName?.S ||
            "";

        if (record.eventName === "INSERT") {
            emailSubject = "New Image Added";
            emailBody = `A new image has been added to the database: ${fileName}`;
        } else if (record.eventName === "REMOVE") {
            emailSubject = "Image Deleted";
            emailBody = `An image has been deleted from the database: ${fileName}`;
        }

        if (emailSubject) {
            const params = {
                Destination: { ToAddresses: [SES_EMAIL_TO] },
                Message: {
                    Body: { Text: { Data: emailBody, Charset: "UTF-8" } },
                    Subject: { Data: emailSubject, Charset: "UTF-8" },
                },
                Source: SES_EMAIL_FROM,
            };

            try {
                await sesClient.send(new SendEmailCommand(params));
                console.log(`Email sent: ${emailSubject}`);
            } catch (error) {
                console.error(`Error sending email:`, error);
            }
        }
    }
};
