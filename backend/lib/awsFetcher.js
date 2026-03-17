// backend/lib/awsFetcher.js
const { DescribeInstancesCommand }   = require("@aws-sdk/client-ec2");
const { DescribeDBInstancesCommand } = require("@aws-sdk/client-rds");
const { GetMetricStatisticsCommand } = require("@aws-sdk/client-cloudwatch");
const { GetCostAndUsageCommand }     = require("@aws-sdk/client-cost-explorer");
const { cloudwatch, costExplorer, ec2, rds, regionsFromAccount } = require("./awsClient");

// ── List all instances across all regions for one account ─────────────────────
async function listInstancesForAccount(account) {
  const regions   = regionsFromAccount(account);
  const instances = [];

  for (const region of regions) {
    try {
      const resp = await ec2(account, region).send(new DescribeInstancesCommand({ MaxResults: 200 }));
      for (const res of resp.Reservations || []) {
        for (const inst of res.Instances || []) {
          const nameTag = inst.Tags?.find(t => t.Key === "Name");
          instances.push({
            id: inst.InstanceId, accountId: account.id,
            awsName: nameTag?.Value || "", type: inst.InstanceType,
            service: "EC2", state: inst.State?.Name || "unknown",
            az: inst.Placement?.AvailabilityZone || "", region,
          });
        }
      }
    } catch (e) { console.warn(`[listInstances] EC2 ${region} (acct ${account.id}):`, e.message); }

    try {
      const resp = await rds(account, region).send(new DescribeDBInstancesCommand({}));
      for (const db of resp.DBInstances || []) {
        instances.push({
          id: db.DBInstanceIdentifier, accountId: account.id,
          awsName: db.DBInstanceIdentifier, type: db.DBInstanceClass,
          service: "RDS", state: db.DBInstanceStatus || "unknown",
          az: db.AvailabilityZone || "", region,
        });
      }
    } catch (e) { console.warn(`[listInstances] RDS ${region} (acct ${account.id}):`, e.message); }
  }
  return instances;
}

// ── CloudWatch helper — fetches both Average and Maximum in one call ──────────
async function cwMetric(account, region, params) {
  const resp = await cloudwatch(account, region).send(new GetMetricStatisticsCommand(params));
  return (resp.Datapoints || []).sort((a, b) => new Date(a.Timestamp) - new Date(b.Timestamp));
}

// ── Daily EC2 CloudWatch metrics ──────────────────────────────────────────────
// Period = 86400 (1 day). Fetches Average AND Maximum for CPU/RAM/bandwidth.
async function getEC2Metrics(account, instanceId, region, start, end) {
  const base = {
    Namespace:  "AWS/EC2",
    Dimensions: [{ Name: "InstanceId", Value: instanceId }],
    StartTime:  new Date(start), EndTime: new Date(end),
    Period:     86400,   // one data point per day
  };

  const [cpu, netIn, netOut] = await Promise.all([
    // CPU: Average + Maximum per day
    cwMetric(account, region, { ...base, MetricName: "CPUUtilization", Statistics: ["Average", "Maximum"] }),
    // Bandwidth: Sum per day (in + out)
    cwMetric(account, region, { ...base, MetricName: "NetworkIn",  Statistics: ["Sum", "Maximum"] }),
    cwMetric(account, region, { ...base, MetricName: "NetworkOut", Statistics: ["Sum", "Maximum"] }),
  ]);

  // RAM via CloudWatch Agent (optional — empty if agent not installed)
  let ram = [];
  try {
    ram = await cwMetric(account, region, {
      Namespace: "CWAgent", MetricName: "mem_used_percent",
      Dimensions: [{ Name: "InstanceId", Value: instanceId }],
      StartTime: new Date(start), EndTime: new Date(end),
      Period: 86400, Statistics: ["Average", "Maximum"],
    });
  } catch (_) {}

  // Disk via CloudWatch Agent (optional)
  let disk = [];
  try {
    disk = await cwMetric(account, region, {
      Namespace: "CWAgent", MetricName: "disk_used_percent",
      Dimensions: [{ Name: "InstanceId", Value: instanceId }, { Name: "path", Value: "/" }],
      StartTime: new Date(start), EndTime: new Date(end),
      Period: 86400, Statistics: ["Average", "Maximum"],
    });
  } catch (_) {}

  return { cpu, netIn, netOut, ram, disk };
}

// ── Monthly costs — still monthly granularity (Cost Explorer max = MONTHLY) ───
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

// ── Build daily dataset for one instance ─────────────────────────────────────
// Returns array of { date: "YYYY-MM-DD", bandwidth, bandwidthMax, cpu, cpuMax,
//                    ram, ramMax, disk, diskMax, costServer, costBandwidth, costOther }
// Cost data is monthly — spread evenly across days in each month for chart continuity
async function buildDailyDataset(account, instanceId, region, start, end) {
  const [cw, costs] = await Promise.all([
    getEC2Metrics(account, instanceId, region, start, end),
    getInstanceCosts(account, instanceId, start, end),
  ]);

  const toDate  = ts => new Date(ts).toISOString().slice(0, 10);  // YYYY-MM-DD
  const toMonth = ts => new Date(ts).toISOString().slice(0, 7);   // YYYY-MM

  const map = {};
  const ensure = d => { if (!map[d]) map[d] = {}; };

  // CPU — Average and Maximum per day
  cw.cpu.forEach(dp => {
    const d = toDate(dp.Timestamp); ensure(d);
    map[d].cpu    = +(dp.Average || 0).toFixed(1);
    map[d].cpuMax = +(dp.Maximum || 0).toFixed(1);
  });

  // Bandwidth — Sum(in) + Sum(out) per day, Max of out as peak indicator
  cw.netIn.forEach(dp => {
    const d = toDate(dp.Timestamp); ensure(d);
    map[d].bwIn    = +((dp.Sum || 0) / 1e9).toFixed(3);
  });
  cw.netOut.forEach(dp => {
    const d = toDate(dp.Timestamp); ensure(d);
    map[d].bwOut    = +((dp.Sum     || 0) / 1e9).toFixed(3);
    map[d].bwOutMax = +((dp.Maximum || 0) / 1e9).toFixed(3);
  });

  // RAM — Average and Maximum per day
  cw.ram.forEach(dp => {
    const d = toDate(dp.Timestamp); ensure(d);
    map[d].ram    = +(dp.Average || 0).toFixed(1);
    map[d].ramMax = +(dp.Maximum || 0).toFixed(1);
  });

  // Disk — Average and Maximum per day
  cw.disk.forEach(dp => {
    const d = toDate(dp.Timestamp); ensure(d);
    map[d].disk    = +(dp.Average || 0).toFixed(1);
    map[d].diskMax = +(dp.Maximum || 0).toFixed(1);
  });

  // Build monthly cost map first, then spread across days
  const monthlyCosts = {};
  for (const period of costs) {
    const m = period.TimePeriod?.Start?.slice(0, 7);
    if (!m) continue;
    let cs = 0, cb = 0, co = 0;
    for (const g of period.Groups || []) {
      const key  = g.Keys?.[0] || "";
      const cost = parseFloat(g.Metrics?.BlendedCost?.Amount || 0);
      if (/BoxUsage|Instance/i.test(key))           cs += cost;
      else if (/DataTransfer|Bandwidth/i.test(key)) cb += cost;
      else                                           co += cost;
    }
    monthlyCosts[m] = { cs: +cs.toFixed(2), cb: +cb.toFixed(2), co: +co.toFixed(2) };
  }

  // Count days per month in our dataset to spread costs evenly
  const daysPerMonth = {};
  Object.keys(map).forEach(d => {
    const m = d.slice(0, 7);
    daysPerMonth[m] = (daysPerMonth[m] || 0) + 1;
  });

  // Apply daily cost = monthly cost / days in month
  Object.keys(map).forEach(d => {
    const m = d.slice(0, 7);
    const mc = monthlyCosts[m];
    const days = daysPerMonth[m] || 1;
    if (mc) {
      map[d].costServer    = +(mc.cs / days).toFixed(4);
      map[d].costBandwidth = +(mc.cb / days).toFixed(4);
      map[d].costOther     = +(mc.co / days).toFixed(4);
    }
  });

  return Object.entries(map)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, d]) => ({
      date,
      bandwidth:     +((d.bwIn||0)+(d.bwOut||0)).toFixed(3),
      bandwidthMax:  d.bwOutMax   ?? null,
      cpu:           d.cpu        ?? null,
      cpuMax:        d.cpuMax     ?? null,
      ram:           d.ram        ?? null,
      ramMax:        d.ramMax     ?? null,
      disk:          d.disk       ?? null,
      diskMax:       d.diskMax    ?? null,
      costServer:    d.costServer    ?? 0,
      costBandwidth: d.costBandwidth ?? 0,
      costOther:     d.costOther     ?? 0,
    }));
}

module.exports = { listInstancesForAccount, buildDailyDataset };
