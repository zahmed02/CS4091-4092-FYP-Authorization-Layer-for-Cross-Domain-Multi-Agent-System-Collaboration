import { DomainCard } from '../components/DomainCard'
import { EventFeed } from '../components/EventFeed'
import { PeerLink } from '../components/PeerLink'

export function Overview() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch">
        <div className="min-w-0 flex-1">
          <DomainCard d="a" />
        </div>
        <PeerLink />
        <div className="min-w-0 flex-1">
          <DomainCard d="b" />
        </div>
      </div>
      <EventFeed />
    </div>
  )
}
