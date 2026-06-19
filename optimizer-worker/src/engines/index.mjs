import { analyzeWithPob, getPobDiagnostics } from './pob.mjs'

export function getEngineDiagnostics() {
  return {
    optimizer_engine: 'pob',
    ...getPobDiagnostics(),
  }
}

export async function analyzeRecommendations(context) {
  return analyzeWithPob(context)
}
