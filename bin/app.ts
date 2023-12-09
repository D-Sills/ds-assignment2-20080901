#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { EDAAppStack } from "../lib/eda-app-stack";
import { SES_REGION } from "../env";

const app = new cdk.App();

new EDAAppStack(app, "ImageStorageStack", {
    env: {
        region: SES_REGION,
    },
});
