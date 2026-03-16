// backend/lib/awsClient.js
// Credentials come from Render environment variables.
// AWS_REGIONS = comma-separated list e.g. "ap-south-1,us-east-1"
// Falls back to AWS_REGION (single region) for backwards compatibility.
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

// Returns array of all configured regions
function getRegions() {
  const multi  = process.env.AWS_REGIONS;
  const single = process.env.AWS_REGION;
  if (multi)  return multi.split(",").map(r => r.trim()).filter(Boolean);
  if (single) return [single.trim()];
  return ["us-east-1"];
}

// Region-specific clients — pass region explicitly
const cloudwatch   = (region) => new CloudWatchClient({ region, credentials: creds() });
const costExplorer = ()       => new CostExplorerClient({ region: "us-east-1", credentials: creds() });
const ec2          = (region) => new EC2Client({ region, credentials: creds() });
const rds          = (region) => new RDSClient({ region, credentials: creds() });

async function validateCreds() {
  const regions = getRegions();
  const sts = new STSClient({ region: regions[0], credentials: creds() });
  return sts.send(new GetCallerIdentityCommand({}));
}

module.exports = { cloudwatch, costExplorer, ec2, rds, validateCreds, getRegions };
