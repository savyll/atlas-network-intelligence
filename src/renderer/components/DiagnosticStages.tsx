import { Check } from 'lucide-react'
import type { DiagnosticStage } from '../../shared/services'
export function DiagnosticStages({ stage, service = false }: { stage: DiagnosticStage; service?: boolean }) {
  const stages: DiagnosticStage[] = service ? ['Local Network', 'Internet', 'DNS', 'Service Endpoint', 'Official Status', 'ATLAS Conclusion'] : ['Local Network', 'Internet', 'DNS', 'ATLAS Conclusion']
  const index = stages.indexOf(stage)
  return <ol className="diagnostic-stages" aria-label="Diagnostic progress">{stages.map((name, i) => <li key={name} className={i < index ? 'complete' : i === index ? 'current' : ''} aria-current={i === index ? 'step' : undefined}><span>{i < index ? <Check size={11} /> : i + 1}</span>{name}</li>)}</ol>
}
