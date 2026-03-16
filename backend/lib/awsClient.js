// backend/lib/awsClient.js
// Accepts an account object from the DB — credentials are decrypted at call time.
// Falls back to env vars for backwards compatibility during migration.
const { CloudWatchClient }   = require("@aws-sdk/client-cloudwatch");
const { CostExplorerClient } = require("@aws-sdk/client-cost-explorer");
const { EC2Client }          = require("@aws-sdk/client-ec2");
const { RDSClient }          = require("@aws-sdk/client-rds");
const { STSClient, GetCallerIdentityCommand } = require("@aws-sdk/client-sts");
const { decrypt } = require("./crypto");

// Build credentials object from a DB account row
function credsFromAccount(account) {
  return {
    accessKeyId:     account.access_key_id,
    secretAccessKey: decrypt(account.secret_key_enc),
  };
}

// Parse regions from account row
function regionsFromAccount(account) {
  return account.regions.split(",").map(r => r.trim()).filter(Boolean);
}

const cloudwatch   = (account, region) => new CloudWatchClient({ region, credentials: credsFromAccount(account) });
const costExplorer = (account)         => new CostExplorerClient({ region: "us-east-1", credentials: credsFromAccount(account) });
const ec2          = (account, region) => new EC2Client({ region, credentials: credsFromAccount(account) });
const rds          = (account, region) => new RDSClient({ region, credentials: credsFromAccount(account) });

async function validateAccount(account) {
  const regions = regionsFromAccount(account);
  const sts = new STSClient({ region: regions[0], credentials: credsFromAccount(account) });
  return sts.send(new GetCallerIdentityCommand({}));
}

module.exports = { cloudwatch, costExplorer, ec2, rds, validateAccount, regionsFromAccount };
