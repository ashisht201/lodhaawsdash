// backend/lib/syncEngine.js
const { pool }       = require("./db");
const { listInstances, buildMonthlyDataset } = require("./awsFetcher");

const MONTHS_BACK = 12;

function dateRange() {
  const end   = new Date();
  const start = new Date();
  start.setMonth(start.getMonth() - MONTHS_BACK);
  const fmt = d => d.toISOString().slice(0, 10);
  return { start: fmt(start), end: fmt(end) };
}

async function cacheInstances(instances) {
  for (const inst of instances) {
    await pool.query(`
      INSERT INTO instances_cache (id, aws_name, type, service, state, az, region, synced_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
      ON CONFLICT (id) DO UPDATE SET
        aws_name  = EXCLUDED.aws_name,
        type      = EXCLUDED.type,
        service   = EXCLUDED.service,
        state     = EXCLUDED.state,
        az        = EXCLUDED.az,
        region    = EXCLUDED.region,
        synced_at = NOW()
    `, [inst.id, inst.awsName, inst.type, inst.service, inst.state, inst.az, inst.region]);
  }
}

async function cacheMetrics(instanceId, monthlyData) {
  for (const row of monthlyData) {
    await pool.query(`
      INSERT INTO metrics_cache
        (instance_id, month, bandwidth, cpu, ram, cost_server, cost_bandwidth, cost_other, synced_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
      ON CONFLICT (instance_id, month) DO UPDATE SET
        bandwidth      = EXCLUDED.bandwidth,
        cpu            = EXCLUDED.cpu,
        ram            = EXCLUDED.ram,
        cost_server    = EXCLUDED.cost_server,
        cost_bandwidth = EXCLUDED.cost_bandwidth,
        cost_other     = EXCLUDED.cost_other,
        synced_at      = NOW()
    `, [instanceId, row.month, row.bandwidth, row.cpu, row.ram,
        row.costServer, row.costBandwidth, row.costOther]);
  }
}

async function runSync() {
  const { rows: [log] } = await pool.query(
    "INSERT INTO sync_log (started_at, status) VALUES (NOW(), 'running') RETURNING id"
  );
  const logId = log.id;
  console.log(`[sync] Started (log id=${logId})`);

  try {
    const { start, end } = dateRange();
    console.log(`[sync] Fetching instances across all regions…`);
    const instances = await listInstances();
    await cacheInstances(instances);
    console.log(`[sync] Found ${instances.length} instances. Fetching metrics ${start} → ${end}…`);

    let synced = 0;
    for (const inst of instances) {
      try {
        console.log(`[sync]   ${inst.id} (${inst.service} / ${inst.region})…`);
        // Pass region so CloudWatch queries the right endpoint
        const data = await buildMonthlyDataset(inst.id, inst.region, start, end);
        await cacheMetrics(inst.id, data);
        synced++;
      } catch (e) {
        console.warn(`[sync]   ✗ ${inst.id}: ${e.message}`);
      }
    }

    await pool.query(
      "UPDATE sync_log SET finished_at=NOW(), status='ok', instances_synced=$1 WHERE id=$2",
      [synced, logId]
    );
    console.log(`[sync] Done. ${synced}/${instances.length} instances synced.`);
    return { ok: true, synced, total: instances.length };

  } catch (e) {
    await pool.query(
      "UPDATE sync_log SET finished_at=NOW(), status='error', error_msg=$1 WHERE id=$2",
      [e.message, logId]
    );
    console.error(`[sync] Failed:`, e.message);
    throw e;
  }
}

async function getLastSync() {
  const { rows } = await pool.query(`
    SELECT * FROM sync_log
    WHERE status != 'running'
    ORDER BY started_at DESC LIMIT 1
  `);
  return rows[0] || null;
}

async function isSyncRunning() {
  const { rows } = await pool.query(
    "SELECT id FROM sync_log WHERE status = 'running' AND started_at > NOW() - INTERVAL '30 minutes'"
  );
  return rows.length > 0;
}

module.exports = { runSync, getLastSync, isSyncRunning };
