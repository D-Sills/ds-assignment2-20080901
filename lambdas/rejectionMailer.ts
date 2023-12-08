import { SQSHandler } from "aws-lambda";
import {
  SESClient,
  SendEmailCommand,
  SendEmailCommandInput,
} from "@aws-sdk/client-ses";
import { SES_EMAIL_FROM, SES_EMAIL_TO } from "../env";

const client = new SESClient({ region: "eu-west-1" });

export const handler: SQSHandler = async (event) => {
  for (const record of event.Records) {
    const recordBody  = JSON.parse(record.body);
    const snsMessage = JSON.parse(recordBody.Message);

    console.log("sending rejection email for file: ", snsMessage.fileName);
    
    const params: SendEmailCommandInput = {
      Destination: {
        ToAddresses: [SES_EMAIL_TO],
      },
      Message: {
        Body: {
          Html: {
            Charset: "UTF-8",
            Data: `<p>The file ${snsMessage.fileName} you uploaded is not a .jpeg or .png image file.</p>`,
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
      await client.send(new SendEmailCommand(params));
      console.log(`Rejection email sent for file: ${snsMessage}`);
    } catch (error) {
      console.error("Error sending rejection email", error);
    }
  }
};
