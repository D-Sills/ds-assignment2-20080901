import { DynamoDBStreamHandler } from "aws-lambda";
import { SESClient, SendEmailCommand, SendEmailCommandInput } from "@aws-sdk/client-ses";
import { SES_EMAIL_FROM, SES_EMAIL_TO, SES_REGION } from "../env";
if (!SES_EMAIL_TO || !SES_EMAIL_FROM || !SES_REGION) {
  throw new Error(
    "Please add the SES_EMAIL_TO, SES_EMAIL_FROM and SES_REGION environment variables in an env.js file located in the root directory"
  );
}

const sesClient = new SESClient({ region: "eu-west-1" });

export const handler: DynamoDBStreamHandler = async (event) => {
  for (const record of event.Records) {
    let emailSubject = '';
    let emailBody = '';
    let fileName = '';
    
    // Extract the file name from the DynamoDB stream record
    fileName = record.dynamodb?.NewImage?.fileName?.S ?? record.dynamodb?.OldImage?.fileName?.S ?? '';

    if (record.eventName === 'INSERT') {
      emailSubject = 'New Image Added';
      emailBody = `A new image has been added to the database:<br>
                   <strong>Image:</strong> ${fileName}`;
    } else if (record.eventName === 'REMOVE') {
      emailSubject = 'Image Deleted';
      emailBody = `An image has been deleted from the database:<br>
                   <strong>Image:</strong> ${fileName}`;
    }

    // Send email if the subject exists
    if (emailSubject) {
      const params = sendEmailParams(emailSubject, emailBody);
      try {
        await sesClient.send(new SendEmailCommand(params));
        console.log(`Email sent for event ${record.eventName}`);
      } catch (error) {
        console.error(`Error sending email for event ${record.eventName}:`, error);
      }
    }
  }
};

function sendEmailParams(subject: string, body: string): SendEmailCommandInput {
  return {
    Destination: {
      ToAddresses: [SES_EMAIL_TO],
    },
    Message: {
      Body: {
        Html: {
          Charset: "UTF-8",
          Data: 
          `<html><body>
          <h1>${subject}</h1>
          <p>${body}</p>
          </body></html>`,
        },
      },
      Subject: {
        Charset: "UTF-8",
        Data: subject,
      },
    },
    Source: SES_EMAIL_FROM
  };
}
