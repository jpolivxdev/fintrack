// Compact end-of-test report: one line per endpoint + totals, also saved as
// JSON in results/<scenario>.json for LOAD_TESTING.md.
const fmt = (v) => (v === undefined ? '-' : `${v.toFixed(1)}ms`);

export function compactSummary(scenario) {
  return (data) => {
    const rows = [];
    for (const [key, metric] of Object.entries(data.metrics)) {
      const match = key.match(/^http_req_duration\{name:(.+)\}$/);
      if (!match) continue;
      const v = metric.values;
      rows.push(
        `${match[1].padEnd(32)} avg=${fmt(v.avg)} med=${fmt(v.med)} p95=${fmt(v['p(95)'])} p99=${fmt(v['p(99)'])} max=${fmt(v.max)}`,
      );
    }
    const reqs = data.metrics.http_reqs.values;
    const failed = data.metrics.http_req_failed.values.rate * 100;
    const all = data.metrics.http_req_duration.values;
    rows.push(
      `${'ALL'.padEnd(32)} avg=${fmt(all.avg)} med=${fmt(all.med)} p95=${fmt(all['p(95)'])} p99=${fmt(all['p(99)'])} max=${fmt(all.max)}`,
      `requests=${reqs.count} throughput=${reqs.rate.toFixed(1)}/s failed=${failed.toFixed(2)}%`,
    );
    const text = rows.join('\n') + '\n';
    return { stdout: text, [`results/${scenario}.json`]: JSON.stringify(data, null, 2) };
  };
}
