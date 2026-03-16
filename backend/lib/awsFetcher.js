// backend/lib/awsFetcher.js
const { DescribeInstancesCommand }   = require("@aws-sdk/client-ec2");
const { DescribeDBInstancesCommand } = require("@aws-sdk/client-rds");
const { GetMetricStatisticsCommand } = require("@aws-sdk/client-cloudwatch");
const { GetCostAndUsageCommand }     = require("@aws-sdk/client-cost-explorer");
const { cloudwatch, costExplorer, ec2, rds, regionsFromAccount } = require("./awsClient");

// ── List all instances for one account across its configured regions ──────────
async function listInstancesForAccount(account) {
  const regions   = regionsFromAccount(account);
  const instances = [];

  for (const region of regions) {
    // EC2
    try {
      const resp = await ec2(account, region).send(new DescribeInstancesCommand({ MaxResults: 200 }));
      for (const res of resp.Reservations || []) {
        for (const inst of res.Instances || []) {
          const nameTag = inst.Tags?.find(t => t.Key === "Name");
          instances.push({
            id:        inst.InstanceId,
            accountId: account.id,
            awsName:   nameTag?.Value || "",
            type:      inst.InstanceType,
            service:   "EC2",
            state:     inst.State?.Name || "unknown",
            az:        inst.Placement?.AvailabilityZone || "",
            region,
          });
        }
      }
    } catch (e) { console.warn(`[listInstances] EC2 ${region} (account ${account.id}):`, e.message); }

    // RDS
    try {
      const resp = await rds(account, region).send(new DescribeDBInstancesCommand({}));
      for (const db of resp.DBInstances || []) {
        instances.push({
          id:        db.DBInstanceIdentifier,
          accountId: account.id,
          awsName:   db.DBInstanceIdentifier,
          type:      db.DBInstanceClass,
          service:   "RDS",
          state:     db.DBInstanceStatus || "unknown",
          az:        db.AvailabilityZone || "",
          region,
        });
      }
    } catch (e) { console.warn(`[listInstances] RDS ${region} (account ${account.id}):`, e.message); }
  }

  return instances;
}

// ── CloudWatch metric helper ──────────────────────────────────────────────────
async function cwMetric(account, region, params) {
  const resp = await cloudwatch(account, region).send(new GetMetricStatisticsCommand(params));
  return (resp.Datapoints || []).sort((a, b) => new Date(a.Timestamp) - new Date(b.Timestamp));
}

// ── EC2 CloudWatch metrics for one instance ───────────────────────────────────
async function getEC2Metrics(account, instanceId, region, start, end) {
  const base = {
    Namespace:  "AWS/EC2",
    Dimensions: [{ Name: "InstanceId", Value: instanceId }],
    StartTime:  new Date(start), EndTime: new Date(end),
    Period:     2592000,
  };
  const [cpu, netIn, netOut] = await Promise.all([
    cwMetric(account, region, { ...base, MetricName: "CPUUtilization", Statistics: ["Average"] }),
    cwMetric(account, region, { ...base, MetricName: "NetworkIn",      Statistics: ["Sum"] }),
    cwMetric(account, region, { ...base, MetricName: "NetworkOut",     Statistics: ["Sum"] }),
  ]);
  let ram = [];
  try {
    ram = await cwMetric(account, region, {
      Namespace: "CWAgent", MetricName: "mem_used_percent",
      Dimensions: [{ Name: "InstanceId", Value: instanceId }],
      StartTime: new Date(start), EndTime: new Date(end),
      Period: 2592000, Statistics: ["Average"],
    });
  } catch (_) {}
  return { cpu, netIn, netOut, ram };
}

// ── Per-instance cost via resource ID ────────────────────────────────────────
async function getInstanceCosts(account, instanceId, start, end) {
  try {
    const resp = await costExplorer(account).send(new GetCostAndUsageCommand({
      TimePeriod:  { Start: start.slice(0,10), End: end.slice(0,10) },
      Granularity: "MONTHLY",
      Filter: { Dimensions: { Key: "RESOURCE_ID", Values: [instanceId] } },
      GroupBy: [{ Type: "DIMENSION", Key: "USAGE_TYPE" }],
      Metrics: ["BlendedCost"],
    }));
    return resp.ResultsByTime || [];
  } catch (_) { return []; }
}

// ── Build monthly dataset for one instance ────────────────────────────────────
async function buildMonthlyDataset(account, instanceId, region, start, end) {
  const [cw, costs] = await Promise.all([
    getEC2Metrics(account, instanceId, region, start, end),
    getInstanceCosts(account, instanceId, start, end),
  ]);

  const toMonth = ts => new Date(ts).toISOString().slice(0, 7);
  const map = {};
  const ensure = m => { if (!map[m]) map[m] = {}; };

  cw.cpu.forEach(dp    => { const m = toMonth(dp.Timestamp); ensure(m); map[m].cpu   = +(dp.Average||0).toFixed(1); });
  cw.netIn.forEach(dp  => { const m = toMonth(dp.Timestamp); ensure(m); map[m].bwIn  = +((dp.Sum||0)/1e9).toFixed(3); });
  cw.netOut.forEach(dp => { const m = toMonth(dp.Timestamp); ensure(m); map[m].bwOut = +((dp.Sum||0)/1e9).toFixed(3); });
  cw.ram.forEach(dp    => { const m = toMonth(dp.Timestamp); ensure(m); map[m].ram   = +(dp.Average||0).toFixed(1); });

  for (const period of costs) {
    const m = period.TimePeriod?.Start?.slice(0, 7);
    if (!m) continue;
    ensure(m);
    let cs = 0, cb = 0, co = 0;
    for (const g of period.Groups || []) {
      const key  = g.Keys?.[0] || "";
      const cost = parseFloat(g.Metrics?.BlendedCost?.Amount || 0);
      if (/BoxUsage|Instance/i.test(key))           cs += cost;
      else if (/DataTransfer|Bandwidth/i.test(key)) cb += cost;
      else                                           co += cost;
    }
    map[m].costServer = +cs.toFixed(2); map[m].costBandwidth = +cb.toFixed(2); map[m].costOther = +co.toFixed(2);
  }

  return Object.entries(map).sort(([a],[b]) => a.localeCompare(b)).map(([month, d]) => ({
    month,
    bandwidth:     +((d.bwIn||0)+(d.bwOut||0)).toFixed(3),
    cpu:           d.cpu           ?? null,
    ram:           d.ram           ?? null,
    costServer:    d.costServer    ?? 0,
    costBandwidth: d.costBandwidth ?? 0,
    costOther:     d.costOther     ?? 0,
  }));
}

module.exports = { listInstancesForAccount, buildMonthlyDataset };
