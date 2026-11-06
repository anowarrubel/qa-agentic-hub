const ORDER = ['critical', 'high', 'medium', 'low', 'info'];

/** Markdown summary of one run. */
export function renderReport({ project, sha, env, runs, findings }) {
  const lines = [
    `# QA run: ${project}`,
    '',
    `- commit: \`${sha.slice(0, 7)}\``,
    `- environment: \`${env}\``,
    '',
    '| Capability | Passed | Total |',
    '|---|---|---|',
    ...runs.map((r) => `| ${r.capability} | ${r.passed} | ${r.total} |`),
    '',
  ];

  const actionable = findings.filter((f) => f.status === 'failed' || f.status === 'flaky');
  const noted = findings.filter((f) => !actionable.includes(f));

  const section = (heading, list) => {
    if (!list.length) return;
    lines.push(`## ${heading}`, '');
    for (const f of [...list].sort((a, b) => ORDER.indexOf(a.severity) - ORDER.indexOf(b.severity))) {
      lines.push(`- **[${f.severity}] ${f.title}** (${f.capability}, ${f.status}, ${f.verdict})`);
      lines.push(`  - ${f.location}`);
      lines.push(`  - ${f.evidence}`);
      if (f.suggestedFix) lines.push(`  - fix: ${f.suggestedFix}`);
    }
    lines.push('');
  };

  section('Needs attention', actionable);
  section('Known issues and notes', noted);
  if (!findings.length) lines.push('No findings.', '');
  return lines.join('\n');
}
