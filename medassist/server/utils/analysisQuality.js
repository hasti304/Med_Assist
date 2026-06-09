/**
 * Detect complete vs partial/failed blood report analysis (for cache + re-run UI).
 */
function isAnalysisComplete(analysis) {
  if (!analysis || typeof analysis !== 'object') return false;

  const assessment = analysis.summary?.overall_assessment || '';
  const overloadMarkers = [
    'temporarily overloaded',
    'rate-limited',
    'Analysis incomplete',
    'please retry',
  ];
  if (overloadMarkers.some((m) => assessment.toLowerCase().includes(m.toLowerCase()))) {
    return false;
  }

  const hasSummary = assessment.length > 20;
  const hasFindings = (analysis.abnormal_findings?.length ?? 0) > 0;
  const hasDiet =
    !!analysis.diet_plan?.overview ||
    (analysis.diet_plan?.foods_to_eat?.length ?? 0) > 0;
  const hasRecovery = (analysis.recovery_ingredients?.length ?? 0) > 0;

  return hasSummary && (hasFindings || hasDiet || hasRecovery);
}

module.exports = { isAnalysisComplete };
