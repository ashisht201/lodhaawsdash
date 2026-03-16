// backend/lib/awsFetcher.js
const {
  DescribeInstancesCommand,
} = require("@aws-sdk/client-ec2");
const {
  DescribeDBInstancesCommand,
} = require("@aws-sdk/client-rds");
const {
  GetMetricStatisticsCommand,
} = require("@aws-sdk/client-cloudwatch");
const {
  GetCostAndUsageCommand,
} = require("@aws-sdk/client-cost-explorer");
const { cloudwatch, costExplorer, ec2, rds } = require("./awsClient");

// ── List all EC2 + RDS instances ─────────────────────────────────────────────
async function listInstances() {
  const instances = [];

  // EC2
  try {
    const resp = await ec2().send(new DescribeInstancesCommand({ MaxResults: 200 }));
    for (const res of resp.Reservations || []) {
      for (const inst of res.Instances || []) {
        const nameTag = inst.Tags?.find(t => t.Key === "Name");
        instances.push({
          id:      inst.InstanceId,
          awsName: nameTag?.Value || "",
          type:    inst.InstanceType,
          service: "EC2",
          state:   inst.State?.Name || "unknown",
          az:      inst.Placement?.AvailabilityZone || "",
        });
      }
    }
  } catch (e) {
    console.warn("[listInstances] EC2:", e.message);
  }

  // RDS
  try {
    const resp = await rds().send(new DescribeDBInstancesCommand({}));
    for (const db of resp.DBInstances || []) {
      instances.push({
        id:      db.DBInstanceIdentifier,
        awsName: db.DBInstanceIdentifier,
        type:    db.DBInstanceClass,
        service: "RDS",
        state:   db.DBInstanceStatus || "unknown",
        az:      db.AvailabilityZone || "",
      });
    }
  } catch (e) {
    console.warn("[listInstances] RDS:", e.message);
  }

  return instances;
}

// ── CloudWatch single metric helper ─────────────────────────────────────────
async function cwMetric(params) {
  const resp = await cloudwatch().send(new GetMetricStatisticsCommand(params));
  return (resp.Datapoints || []).sort((a, b) => new Date(a.Timestamp) - new Date(b.Timestamp));
}

// ── Monthly EC2 CloudWatch metrics ──────────────────────────────────────────
async function getEC2Metrics(instanceId, start, end) {
  const base = {
    Namespace:  "AWS/EC2",
    Dimensions: [{ Name: "InstanceId", Value: instanceId }],
    StartTime:  new Date(start),
    EndTime:    new Date(end),
    Period:     2592000, // 30 days — monthly buckets
  };

  const [cpu, netIn, netOut] = await Promise.all([
    cwMetric({ ...base, MetricName: "CPUUtilization", Statistics: ["Average"] }),
    cwMetric({ ...base, MetricName: "NetworkIn",      Statistics: ["Sum"] }),
    cwMetric({ ...base, MetricName: "NetworkOut",     Statistics: ["Sum"] }),
  ]);

  // RAM via CloudWatch Agent (optional — may be empty if agent not installed)
  let ram = [];
  try {
    ram = await cwMetric({
      Namespace:  "CWAgent",
      MetricName: "mem_used_percent",
      Dimensions: [{ Name: "InstanceId", Value: instanceId }],
      StartTime:  new Date(start),
      EndTime:    new Date(end),
      Period:     2592000,
      Statistics: ["Average"],
    });
  } catch (_) {}

  return { cpu, netIn, netOut, ram };
}

// ── Monthly Cost Explorer data ───────────────────────────────────────────────
// Returns cost grouped by USAGE_TYPE for the whole account, monthly
async function getMonthlyCosts(start, end) {
  try {
    const resp = await costExplorer().send(new GetCostAndUsageCommand({
      TimePeriod:  { Start: start.slice(0, 10), End: end.slice(0, 10) },
      Granularity: "MONTHLY",
      GroupBy:     [{ Type: "DIMENSION", Key: "SERVICE" }],
      Metrics:     ["BlendedCost"],
    }));
    return resp.ResultsByTime || [];
  } catch (e) {
    console.warn("[getMonthlyCosts]", e.message);
    return [];
  }
}

// ── Per-instance cost via resource tags ──────────────────────────────────────
async function getInstanceCosts(instanceId, start, end) {
  try {
    const resp = await costExplorer().send(new GetCostAndUsageCommand({
      TimePeriod:  { Start: start.slice(0, 10), End: end.slice(0, 10) },
      Granularity: "MONTHLY",
      Filter: { Dimensions: { Key: "RESOURCE_ID", Values: [instanceId] } },
      GroupBy: [{ Type: "DIMENSION", Key: "USAGE_TYPE" }],
      Metrics: ["BlendedCost"],
    }));
    return resp.ResultsByTime || [];
  } catch (e) {
    // Requires Cost Explorer resource-level feature — gracefully returns empty
    return [];
  }
}

// ── Build unified monthly dataset for one instance ───────────────────────────
// Returns [{ month: "YYYY-MM", bandwidth, cpu, ram, costServer, costBandwidth, costOther }]
async function buildMonthlyDataset(instanceId, start, end) {
  const [cw, costs] = await Promise.all([
    getEC2Metrics(instanceId, start, end),
    getInstanceCosts(instanceId, start, end),
  ]);

  const toMonth = ts => new Date(ts).toISOString().slice(0, 7);
  const map = {};

  const ensure = m => { if (!map[m]) map[m] = {}; };

  cw.cpu.forEach(dp    => { const m = toMonth(dp.Timestamp); ensure(m); map[m].cpu = +(dp.Average || 0).toFixed(1); });
  cw.netIn.forEach(dp  => { const m = toMonth(dp.Timestamp); ensure(m); map[m].bwIn  = +((dp.Sum || 0) / 1e9).toFixed(3); });
  cw.netOut.forEach(dp => { const m = toMonth(dp.Timestamp); ensure(m); map[m].bwOut = +((dp.Sum || 0) / 1e9).toFixed(3); });
  cw.ram.forEach(dp    => { const m = toMonth(dp.Timestamp); ensure(m); map[m].ram = +(dp.Average || 0).toFixed(1); });

  for (const period of costs) {
    const m = period.TimePeriod?.Start?.slice(0, 7);
    if (!m) continue;
    ensure(m);
    let cs = 0, cb = 0, co = 0;
    for (const g of period.Groups || []) {
      const key  = g.Keys?.[0] || "";
      const cost = parseFloat(g.Metrics?.BlendedCost?.Amount || 0);
      if (/BoxUsage|Instance/i.test(key))          cs += cost;
      else if (/DataTransfer|Bandwidth/i.test(key)) cb += cost;
      else                                           co += cost;
    }
    map[m].costServer    = +cs.toFixed(2);
    map[m].costBandwidth = +cb.toFixed(2);
    map[m].costOther     = +co.toFixed(2);
  }

  return Object.entries(map)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, d]) => ({
      month,
      bandwidth:     +((d.bwIn || 0) + (d.bwOut || 0)).toFixed(3),
      cpu:           d.cpu           ?? null,
      ram:           d.ram           ?? null,
      costServer:    d.costServer    ?? 0,
      costBandwidth: d.costBandwidth ?? 0,
      costOther:     d.costOther     ?? 0,
    }));
}

module.exports = { listInstances, getMonthlyCosts, buildMonthlyDataset };
