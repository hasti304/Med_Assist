/**
 * Maps raw SSE agent step payloads to AgentStatusPanel display rows.
 */
export function formatAgentStep(step) {
  const tool = step.tool || 'agent';

  if (tool === '_ensemble') {
    return {
      type: 'thinking',
      label: 'Running multi-provider analysis…',
      detail: step.result?.message || '',
    };
  }
  if (tool === '_tools_skipped') {
    return {
      type: 'throttled',
      label: 'Reference lookup skipped',
      detail: step.result?.message || 'Continuing with analysis.',
    };
  }

  const argHint =
    step.args?.parameter_name ||
    (Array.isArray(step.args?.drug_names) ? step.args.drug_names.join(', ') : null) ||
    (step.args && Object.keys(step.args).length ? JSON.stringify(step.args).slice(0, 60) : null);

  const resultHint =
    typeof step.result?.message === 'string'
      ? step.result.message
      : step.result?.error
        ? String(step.result.error)
        : step.result
          ? JSON.stringify(step.result).slice(0, 100)
          : '';

  return {
    type: 'tool_result',
    label: `Tool: ${tool.replace(/_/g, ' ')}`,
    detail: [argHint, resultHint].filter(Boolean).join(' — '),
  };
}
