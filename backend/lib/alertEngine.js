// backend/lib/alertEngine.js
const nodemailer = require("nodemailer");
const { pool }   = require("./db");
const { cloudwatch } = require("./awsClient");
const { GetMetricStatisticsCommand } = require("@aws-sdk/client-cloudwatch");

const CW_METRICS = {
  cpu: { Namespace: "AWS/EC2", MetricName: "CPUUtilization", Stat: "Average", toVal: v => v },
  ram: { Namespace: "CWAgent", MetricName: "mem_used_percent", Stat: "Average", toVal: v => v },
  bandwidth: { Namespace: "AWS/EC2", MetricName: "NetworkOut", Stat: "Sum", toVal: v => v / 1e9 },
};

async function getLatestValue(instanceId, metric) {
  const meta = CW_METRICS[metric];
  if (!meta) return null;
  const now   = new Date();
  const start = new Date(now - 3600_000);
  const resp  = await cloudwatch().send(new GetMetricStatisticsCommand({
    Namespace:  meta.Namespace,
    MetricName: meta.MetricName,
    Dimensions: [{ Name: "InstanceId", Value: instanceId }],
    StartTime:  start, EndTime: now, Period: 3600,
    Statistics: [meta.Stat],
  }));
  const dps = (resp.Datapoints || []).sort((a, b) => new Date(b.Timestamp) - new Date(a.Timestamp));
  if (!dps.length) return null;
  const raw = meta.Stat === "Average" ? dps[0].Average : dps[0].Sum;
  return meta.toVal(raw);
}

function evaluate(value, condition, threshold) {
  const t = parseFloat(threshold);
  switch (condition) {
    case ">":  return value > t;
    case "<":  return value < t;
    case ">=": return value >= t;
    case "<=": return value <= t;
    default:   return false;
  }
}

async function sendEmail(alert, value) {
  if (!process.env.SMTP_HOST) {
    console.log(`[alerts] SMTP not configured. Would email ${alert.email}: "${alert.name}" fired (${value?.toFixed(2)})`);
    return;
  }
  const t = nodemailer.createTransport({
    host: process.env.SMTP_HOST, port: parseInt(process.env.SMTP_PORT || "587"),
    secure: process.env.SMTP_SECURE === "true",
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  await t.sendMail({
    from:    process.env.SMTP_FROM || "AWS Dashboard <noreply@example.com>",
    to:      alert.email,
    subject: `[AWS Dashboard] Alert: ${alert.name}`,
    html: `
      <h2 style="color:#EF4444">⚠️ Alert Triggered</h2>
      <table style="font-family:monospace;font-size:14px;border-collapse:collapse">
        <tr><td style="padding:4px 16px 4px 0;color:#6B7280">Alert</td><td><strong>${alert.name}</strong></td></tr>
        <tr><td style="padding:4px 16px 4px 0;color:#6B7280">Instance</td><td>${alert.instance_id}</td></tr>
        <tr><td style="padding:4px 16px 4px 0;color:#6B7280">Metric</td><td>${alert.metric}</td></tr>
        <tr><td style="padding:4px 16px 4px 0;color:#6B7280">Condition</td><td>${alert.condition} ${alert.threshold}</td></tr>
        <tr><td style="padding:4px 16px 4px 0;color:#6B7280">Current value</td><td><strong style="color:#EF4444">${value?.toFixed(2)}</strong></td></tr>
        <tr><td style="padding:4px 16px 4px 0;color:#6B7280">Time</td><td>${new Date().toISOString()}</td></tr>
      </table>`,
  });
}

async function checkAlerts() {
  const { rows } = await pool.query("SELECT * FROM alerts WHERE active = TRUE");
  for (const alert of rows) {
    try {
      const value = await getLatestValue(alert.instance_id, alert.metric);
      if (value === null) continue;
      if (!evaluate(value, alert.condition, alert.threshold)) continue;
      // Throttle: skip if fired within last 30 min
      if (alert.last_fired_at && (Date.now() - new Date(alert.last_fired_at)) < 1_800_000) continue;
      await sendEmail(alert, value);
      await pool.query("UPDATE alerts SET last_fired_at = NOW() WHERE id = $1", [alert.id]);
    } catch (e) {
      console.warn(`[alerts] Error checking alert ${alert.id}:`, e.message);
    }
  }
}

module.exports = { checkAlerts };
