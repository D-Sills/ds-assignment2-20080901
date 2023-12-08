#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { EDAAppStack } from "../lib/eda-app-stack";
import { ImageStorageStack } from "../lib/database-stack";

const app = new cdk.App();

const dbStack = new ImageStorageStack(app, "ImageStorageStack", {
  env: { region: "eu-west-1" },
});

const appStack = new EDAAppStack(app, "EDAStack", {
  env: { region: "eu-west-1" },
});

appStack.addDependency(dbStack);

app.synth();