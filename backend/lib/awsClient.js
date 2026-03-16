// backend/lib/awsClient.js
// All AWS credentials come from environment variables set in Render dashboard.
// No credential files, no CLI setup needed.
const { CloudWatchClient }   = require("@aws-sdk/client-cloudwatch");
const { CostExplorerClient } = require("@aws-sdk/client-cost-explorer");
const { EC2Client }          = require("@aws-sdk/client-ec2");
const { RDSClient }          = require("@aws-sdk/client-rds");
const { STSClient, GetCallerIdentityCommand } = require("@aws-sdk/client-sts");

function creds() {
  const id     = process.env.AWS_ACCESS_KEY_ID;
  const secret = process.env.AWS_SECRET_ACCESS_KEY;
  if (!id || !secret) throw new Error("AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY not set in environment.");
  return { accessKeyId: id, secretAccessKey: secret };
}

const REGION = () => process.env.AWS_REGION || "us-east-1";

const cloudwatch   = () => new CloudWatchClient({ region: REGION(), credentials: creds() });
// Cost Explorer must always use us-east-1
const costExplorer = () => new CostExplorerClient({ region: "us-east-1", credentials: creds() });
const ec2          = () => new EC2Client({ region: REGION(), credentials: creds() });
const rds          = () => new RDSClient({ region: REGION(), credentials: creds() });

async function validateCreds() {
  const sts = new STSClient({ region: REGION(), credentials: creds() });
  return sts.send(new GetCallerIdentityCommand({}));
}

module.exports = { cloudwatch, costExplorer, ec2, rds, validateCreds };
