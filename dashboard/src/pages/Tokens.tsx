import { useState } from 'react'
import { IssueForm } from '../components/tokens/IssueForm'
import type { IssuedHere } from '../components/tokens/IssueForm'
import { Ledger } from '../components/tokens/Ledger'
import { RevocationLab } from '../components/tokens/RevocationLab'
import { TrustPanel } from '../components/tokens/TrustPanel'

export function Tokens() {
  const [issued, setIssued] = useState<IssuedHere | null>(null)
  return (
    <div className="space-y-6">
      <TrustPanel />
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <IssueForm onIssued={setIssued} />
        <RevocationLab issued={issued} />
      </div>
      <Ledger />
    </div>
  )
}
