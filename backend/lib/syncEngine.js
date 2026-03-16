// backend/lib/syncEngine.js
const { pool }   = require("./db");
const { listInstancesForAccount, buildMonthlyDataset } = require("./awsFetcher");

const MONTHS_BACK = 12;

function dateRange() {
  const end = new Date(); const start = new Date();
  start.setMonth(start.getMonth() - MONTHS_BACK);
  const fmt = d => d.toISOString().slice(0, 10);
  return { start: fmt(start), end: fmt(end) };
}

async function cacheInstance(inst) {
  await pool.query(`
    INSERT INTO instances_cache (id, account_id, aws_name, type, service, state, az, region, synced_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
    ON CONFLICT (id) DO UPDATE SET
      account_id = EXCLUDED.account_id, aws_name = EXCLUDED.aws_name,
      type = EXCLUDED.type, service = EXCLUDED.service,
      state = EXCLUDED.state, az = EXCLUDED.az, region = EXCLUDED.region, synced_at = NOW()
  `, [inst.id, inst.accountId, inst.awsName, inst.type, inst.service, inst.state, inst.az, inst.region]);
}

async function cacheMetrics(instanceId, accountId, monthlyData) {
  for (const row of monthlyData) {
    await pool.query(`
      INSERT INTO metrics_cache
        (instance_id, account_id, month, bandwidth, cpu, ram, cost_server, cost_bandwidth, cost_other, synced_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
      ON CONFLICT (instance_id, month) DO UPDATE SET
        account_id = EXCLUDED.account_id, bandwidth = EXCLUDED.bandwidth,
        cpu = EXCLUDED.cpu, ram = EXCLUDED.ram,
        cost_server = EXCLUDED.cost_server, cost_bandwidth = EXCLUDED.cost_bandwidth,
        cost_other = EXCLUDED.cost_other, synced_at = NOW()
    `, [instanceId, accountId, row.month, row.bandwidth, row.cpu, row.ram,
        row.costServer, row.costBandwidth, row.costOther]);
  }
}

// Sync a single account — called per-account
async function syncAccount(account) {
  const { rows: [log] } = await pool.query(
    "INSERT INTO sync_log (account_id, started_at, status) VALUES ($1,NOW(),'running') RETURNING id",
    [account.id]
  );
  const logId = log.id;
  console.log(`[sync] Account "${account.display_name}" (id=${account.id}) started (log=${logId})`);

  try {
    const { start, end } = dateRange();
    const instances = await listInstancesForAccount(account);
    for (const inst of instances) await cacheInstance(inst);
    console.log(`[sync]   Found ${instances.length} instances. Fetching metrics ${start} → ${end}…`);

    let synced = 0;
    for (const inst of instances) {
      try {
        console.log(`[sync]   ${inst.id} (${inst.service} / ${inst.region})…`);
        const data = await buildMonthlyDataset(account, inst.id, inst.region, start, end);
        await cacheMetrics(inst.id, account.id, data);
        synced++;
      } catch (e) { console.warn(`[sync]   ✗ ${inst.id}: ${e.message}`); }
    }

    await pool.query(
      "UPDATE sync_log SET finished_at=NOW(), status='ok', instances_synced=$1 WHERE id=$2",
      [synced, logId]
    );
    console.log(`[sync]   Done. ${synced}/${instances.length} synced.`);
    return { synced, total: instances.length };
  } catch (e) {
    await pool.query(
      "UPDATE sync_log SET finished_at=NOW(), status='error', error_msg=$1 WHERE id=$2",
      [e.message, logId]
    );
    console.error(`[sync]   Failed: ${e.message}`);
    throw e;
  }
}

// Sync ALL active accounts
async function runSync(accountId = null) {
  const query = accountId
    ? "SELECT * FROM accounts WHERE active = TRUE AND id = $1"
    : "SELECT * FROM accounts WHERE active = TRUE";
  const params = accountId ? [accountId] : [];
  const { rows: accounts } = await pool.query(query, params);

  if (!accounts.length) {
    console.log("[sync] No active accounts to sync.");
    return { ok: true, accounts: 0 };
  }

  console.log(`[sync] Syncing ${accounts.length} account(s)…`);
  let totalSynced = 0, totalInstances = 0;
  for (const account of accounts) {
    try {
      const result = await syncAccount(account);
      totalSynced    += result.synced;
      totalInstances += result.total;
    } catch (e) {
      console.error(`[sync] Account "${account.display_name}" failed: ${e.message}`);
    }
  }
  console.log(`[sync] All accounts done. ${totalSynced}/${totalInstances} total instances synced.`);
  return { ok: true, synced: totalSynced, total: totalInstances };
}

async function getLastSync() {
  const { rows } = await pool.query(
    "SELECT * FROM sync_log WHERE status != 'running' ORDER BY started_at DESC LIMIT 1"
  );
  return rows[0] || null;
}

async function isSyncRunning() {
  const { rows } = await pool.query(
    "SELECT id FROM sync_log WHERE status='running' AND started_at > NOW() - INTERVAL '30 minutes'"
  );
  return rows.length > 0;
}

module.exports = { runSync, getLastSync, isSyncRunning };
