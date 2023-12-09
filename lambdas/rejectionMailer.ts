import { SQSHandler } from "aws-lambda";
import {
    SESClient,
    SendEmailCommand,
    SendEmailCommandInput,
} from "@aws-sdk/client-ses";
import { SES_EMAIL_FROM, SES_EMAIL_TO } from "../env";

const sesClient = new SESClient({ region: "eu-west-1" });

export const handler: SQSHandler = async (event) => {
    console.log("Event ", event);
    for (const record of event.Records) {
        const recordBody = JSON.parse(record.body);
        const snsMessage = JSON.parse(recordBody.Message);
        const s3Record = snsMessage.Records[0].s3;
        const objectKey = decodeURIComponent(s3Record.object.key.replace(/\+/g, ' '));

        const params: SendEmailCommandInput = {
            Destination: {
                ToAddresses: [SES_EMAIL_TO],
            },
            Message: {
                Body: {
                    Html: {
                        Charset: "UTF-8",
                        Data: `<p>Image upload rejected for file: ${objectKey}. Please only upload .png or .jpeg.</p>`,
                    },
                },
                Subject: {
                    Charset: "UTF-8",
                    Data: "Image Upload Rejection",
                },
            },
            Source: SES_EMAIL_FROM,
        };

        try {
            await sesClient.send(new SendEmailCommand(params));
            console.log(`Rejection email sent for file: ${objectKey}`);
        } catch (error) {
            console.error("Error sending rejection email", error);
        }
    }
};
