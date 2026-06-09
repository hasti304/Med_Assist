/** Client-side mirror of server analysis completeness check */
export function isAnalysisComplete(analysis) {
  if (!analysis || typeof analysis !== 'object') return false;
  const assessment = analysis.summary?.overall_assessment || '';
  if (/temporarily overloaded|rate-limited|analysis incomplete|please retry/i.test(assessment)) {
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
