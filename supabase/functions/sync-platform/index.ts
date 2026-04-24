// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
}

function getCorsHeaders(_req?: Request) {
  return corsHeaders;
}

// ─── ReZen API Base URLs ──────────────────────────────────────────────────────
const ARRAKIS = 'https://arrakis.therealbrokerage.com/api/v1'
const YENTA   = 'https://yenta.therealbrokerage.com/api/v1'

// Convert ReZen timestamps (epoch ms, epoch s, or ISO string) to ISO date string
function toISODate(val: any): string | null {
  if (!val) return null
  if (typeof val === 'number') {
    const ms = val > 1e12 ? val : val * 1000
    const d = new Date(ms)
    return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0]
  }
  if (typeof val === 'string') {
    const d = new Date(val)
    return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0]
  }
  return null
}

async function rezenGet(baseUrl: string, path: string, apiKey: string, params?: Record<string, string>) {
  const url = new URL(`${baseUrl}/${path}`)
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))

  console.log(`[ReZen] GET ${url.pathname}${url.search}`)
  const res = await fetch(url.toString(), {
    headers: { 'X-API-KEY': apiKey, 'Accept': 'application/json' },
  })
  if (!res.ok) {
    const text = await res.text()
    console.error(`[ReZen] Error ${res.status}: ${text.slice(0, 500)}`)
    throw new Error(`ReZen API [${res.status}]: ${text.slice(0, 300)}`)
  }
  return res.json()
}

/**
 * Extract all enriched fields from a ReZen transaction object.
 * Returns a flat object with the new column values.
 */
function extractTransactionFields(tx: any, yentaId: string) {
  // Firm date
  const firmDate = toISODate(tx.firmDate)

  // Journey ID (groups presale Part 1/2 + Part 2/2)
  const journeyId = tx.journeyId || null

  // MLS number
  const mlsNumber = tx.mlsNum || tx.mlsNumber || null

  // Listing flag — tx.listing flag OR user's participantRole is SELLERS_AGENT
  let isListing = tx.listing === true
  if (!isListing && tx.participants && Array.isArray(tx.participants)) {
    const myParticipant = tx.participants.find((p: any) => p.yentaUserId === yentaId)
    if (myParticipant?.participantRole === 'SELLERS_AGENT') {
      isListing = true
    }
  }

  // Lifecycle state (detailed ReZen state)
  const lifecycleState = tx.lifecycleState?.state || (typeof tx.lifecycleState === 'string' ? tx.lifecycleState : null)

  // Compliance status
  const complianceStatus = tx.complianceStatus || null

  // Lead source
  const leadSource = tx.leadSource || null

  // Transaction code
  const transactionCode = tx.code || null

  // Currency
  const currency = tx.currency || 'CAD'

  // My net payout (actual take-home)
  let myNetPayout: number | null = null
  if (tx.myNetPayout?.amount !== null && tx.myNetPayout?.amount !== undefined) {
    myNetPayout = Number(tx.myNetPayout.amount)
  }

  // My split percent — find the participant matching the user's yentaId
  let mySplitPercent: number | null = null
  if (tx.participants && Array.isArray(tx.participants)) {
    const myParticipant = tx.participants.find((p: any) => p.yentaUserId === yentaId)
    if (myParticipant?.payment?.percent !== null && myParticipant?.payment?.percent !== undefined) {
      mySplitPercent = Number(myParticipant.payment.percent)
    }
  }

  // Client contact info — prioritize the actual client based on deal side
  // For buyer deals: BUYER is the client; for listings: SELLER is the client
  let clientEmail: string | null = null
  let clientPhone: string | null = null
  if (tx.participants && Array.isArray(tx.participants)) {
    const primaryRole = isListing ? 'SELLER' : 'BUYER'
    const fallbackRole = isListing ? 'BUYER' : 'SELLER'
    const clientParticipant = tx.participants.find((p: any) =>
      p.participantRole === primaryRole
    ) || tx.participants.find((p: any) =>
      p.participantRole === fallbackRole
    ) || tx.participants.find((p: any) =>
      p.participantRole === 'CLIENT'
    )
    if (clientParticipant) {
      clientEmail = clientParticipant.emailAddress || null
      clientPhone = clientParticipant.phoneNumber || null
    }
  }

  return {
    firm_date: firmDate,
    journey_id: journeyId,
    mls_number: mlsNumber,
    is_listing: isListing,
    lifecycle_state: lifecycleState,
    compliance_status: complianceStatus,
    lead_source: leadSource,
    transaction_code: transactionCode,
    currency,
    my_net_payout: myNetPayout,
    my_split_percent: mySplitPercent,
    client_email: clientEmail,
    client_phone: clientPhone,
  }
}

/**
 * Build a full synced_transaction upsert record from a ReZen transaction.
 */
function buildTransactionRecord(tx: any, userId: string, agentName: string, yentaId: string) {
  const externalId = String(tx.id || tx.transactionId || tx.code || '')
  if (!externalId) return null

  const address = tx.address || {}
  const streetParts = [address.street, address.street2].filter(Boolean).join(', ')
  const fullAddress = [streetParts, address.city, address.state, address.zip || address.zipCode].filter(Boolean).join(', ')

  // Commission
  let commission: number | null = null
  if (tx.grossCommission?.amount) commission = tx.grossCommission.amount
  else if (tx.totalGci) commission = tx.totalGci
  else if (tx.grossCommission && typeof tx.grossCommission === 'number') commission = tx.grossCommission
  else if (tx.commission && typeof tx.commission === 'number') commission = tx.commission

  // Sale price
  let salePrice: number | null = null
  if (tx.price?.amount) salePrice = tx.price.amount
  else if (tx.salePrice) salePrice = tx.salePrice
  else if (tx.purchasePrice) salePrice = tx.purchasePrice
  else if (tx.price && typeof tx.price === 'number') salePrice = tx.price

  // Status
  const lifecycleStateVal = tx.lifecycleState?.state || tx.lifecycleState || ''
  const rawStatus = String(tx.status || lifecycleStateVal || '').toLowerCase()
  let status = rawStatus
  if (rawStatus.includes('closed') || rawStatus.includes('settled') || tx.closedAt || tx.rezenClosedAt) status = 'closed'
  else if (rawStatus.includes('terminat') || rawStatus.includes('cancel')) status = 'terminated'
  else if (rawStatus.includes('active') || rawStatus.includes('approved') || rawStatus.includes('commission') || rawStatus.includes('ready')) status = 'active'
  else status = 'pending'

  // Dates
  const closeDate = toISODate(tx.closedAt || tx.rezenClosedAt || tx.closingDateActual || tx.closingDateEstimated || tx.closingDate)
  const listingDate = toISODate(tx.listingDate || tx.contractAcceptanceDate)

  // Client name from participants
  let clientName = ''
  if (tx.participants && Array.isArray(tx.participants)) {
    const clients = tx.participants.filter((p: any) =>
      p.role === 'BUYER' || p.role === 'SELLER' || p.role === 'CLIENT'
    )
    clientName = clients.map((p: any) => `${p.firstName || ''} ${p.lastName || ''}`.trim()).join(', ')
  }
  if (!clientName) clientName = tx.representedParty || tx.clientName || ''

  // Extract new enriched fields
  const enriched = extractTransactionFields(tx, yentaId)
  // Only include lead_source and buyer_type from ReZen if they have actual values.
  // This prevents overwriting user-edited values with null on re-sync.
  const userEditableFields: Record<string, string> = {}
  if (enriched.lead_source) userEditableFields.lead_source = enriched.lead_source
  // ReZen doesn't provide buyer_type, so never overwrite it
  // city: only overwrite if ReZen provides a non-empty value
  const cityValue = address.city || ''

  // Remove lead_source from enriched since we handle it separately
  const { lead_source: _ls, ...enrichedSafe } = enriched

  const record: Record<string, any> = {
    user_id: userId,
    platform: 'real_broker',
    external_id: externalId,
    transaction_type: tx.transactionType || tx.dealType || tx.type || 'unknown',
    client_name: clientName,
    property_address: fullAddress || '',
    sale_price: salePrice,
    commission_amount: commission,
    close_date: closeDate,
    listing_date: listingDate,
    status,
    agent_name: agentName,
    raw_data: tx,
    synced_at: new Date().toISOString(),
    ...enrichedSafe,
    ...userEditableFields,
  }

  // Only include city if ReZen provides a non-empty value
  if (cityValue) record.city = cityValue

  return record
}

// ─── Sync Real Broker ─────────────────────────────────────────────────────────

// Helper: write current sync step into sync_error as a JSON marker (overwritten on real error)
async function setSyncStep(supabase: any, connectionId: string, step: string, label: string) {
  await supabase.from('platform_connections').update({
    sync_error: JSON.stringify({ __step: step, label }),
    updated_at: new Date().toISOString(),
  }).eq('id', connectionId)
}

async function syncRealBroker(supabase: any, userId: string, apiKey: string, connectionId: string, prefs = { transactions: true, revshare: true, network: true }) {
  // Reset any stale state from a previous run before starting fresh
  await supabase.from('platform_connections').update({
    sync_status: 'syncing', sync_error: JSON.stringify({ __step: 'identity', label: 'Connecting to ReZen…' }), last_synced_at: null,
  }).eq('id', connectionId)

  const { data: syncLog } = await supabase.from('sync_logs').insert({
    user_id: userId, platform: 'real_broker', sync_type: 'manual', status: 'started',
  }).select().single()

  try {
    // 1. Get current user identity
    console.log('[ReZen] Fetching current user...')
    const me = await rezenGet(YENTA, 'users/me', apiKey)
    const yentaId = me.id || me.agentId
    if (!yentaId) throw new Error('Could not determine your ReZen agent ID')
    const agentName = me.firstName ? `${me.firstName} ${me.lastName || ''}`.trim() : ''
    console.log(`[ReZen] User: ${agentName} (${yentaId})`)

    let recordsSynced = 0

    // 2. Sync transactions - multiple lifecycle groups
    if (!prefs.transactions) {
      console.log('[ReZen] Skipping transactions (disabled by user preferences)')
    } else {
      await setSyncStep(supabase, connectionId, 'transactions', 'Fetching transactions…')
    }
    for (const group of ['OPEN', 'CLOSED'].filter(() => prefs.transactions)) {
      try {
        console.log(`[ReZen] Fetching ${group} transactions...`)
        const txData = await rezenGet(ARRAKIS,
          `transactions/participant/${yentaId}/transactions/${group}`,
          apiKey,
          { pageNumber: '0', pageSize: '200' }
        )

        const transactions = txData?.data || txData?.transactions || txData?.content || (Array.isArray(txData) ? txData : [])
        console.log(`[ReZen] Found ${Array.isArray(transactions) ? transactions.length : 0} ${group} transactions`)

        if (Array.isArray(transactions)) {
          for (const tx of transactions) {
            const record = buildTransactionRecord(tx, userId, agentName, yentaId)
            if (!record) continue

            await supabase.from('synced_transactions').upsert(record, { onConflict: 'user_id,platform,external_id' })
            recordsSynced++
          }
        }
      } catch (txErr) {
        console.warn(`[ReZen] ${group} transaction sync error:`, txErr)
      }
    }

    // Also try the /current endpoint as a fallback
    try {
      console.log('[ReZen] Fetching current transactions...')
      const currentData = await rezenGet(ARRAKIS,
        `transactions/participant/${yentaId}/current`,
        apiKey
      )
      const currentTxs = Array.isArray(currentData) ? currentData : (currentData?.data || currentData?.transactions || [])
      console.log(`[ReZen] Found ${Array.isArray(currentTxs) ? currentTxs.length : 0} current transactions`)

      if (Array.isArray(currentTxs)) {
        for (const tx of currentTxs) {
          const record = buildTransactionRecord(tx, userId, agentName, yentaId)
          if (!record) continue

          await supabase.from('synced_transactions').upsert(record, { onConflict: 'user_id,platform,external_id' })
          recordsSynced++
        }
      }
    } catch (err) {
      console.warn('[ReZen] Current transactions fallback error:', err)
    }

    // 2b. Sync Listings (separate endpoint in ReZen)
    // ReZen listings are separate resources - try multiple possible API endpoints
    let listingsFound = 0
    console.log(`[ReZen] === LISTING SYNC START for agent ${yentaId} ===`)

    // ReZen listings endpoint — uses agentId (yentaId) with pageNumber/pageSize
    // Try the known patterns: /listings with agentId query param, and /agents/{id}/listings
    const listingCandidates = [
      // Pattern 1: filter by agentId query param
      { base: ARRAKIS, url: `listings`, params: { agentId: yentaId, pageNumber: '0', pageSize: '200' } },
      // Pattern 2: filter by listingAgentId
      { base: ARRAKIS, url: `listings`, params: { listingAgentId: yentaId, pageNumber: '0', pageSize: '200' } },
      // Pattern 3: agent sub-resource (different base path)
      { base: ARRAKIS, url: `agents/${yentaId}/listings`, params: { pageNumber: '0', pageSize: '200' } },
      // Pattern 4: YENTA agent listings
      { base: YENTA, url: `agents/${yentaId}/listings`, params: { pageNumber: '0', pageSize: '200' } },
      // Pattern 5: ARRAKIS transactions with listing type filter
      { base: ARRAKIS, url: `transactions`, params: { agentId: yentaId, transactionType: 'LISTING', pageNumber: '0', pageSize: '200' } },
      // Pattern 6: search endpoint
      { base: ARRAKIS, url: `transactions/search`, params: { agentId: yentaId, listing: 'true', pageNumber: '0', pageSize: '200' } },
    ]

    for (const candidate of listingCandidates) {
      try {
        const label = `${candidate.base === ARRAKIS ? 'ARRAKIS' : 'YENTA'} ${candidate.url} params:${JSON.stringify(candidate.params)}`
        console.log(`[ReZen] Trying listing endpoint: ${label}`)
        const data = await rezenGet(candidate.base, candidate.url, apiKey, candidate.params)
        const keys = Object.keys(data || {})
        console.log(`[ReZen] Response keys: ${JSON.stringify(keys)}, totalPages: ${data?.totalPages}, totalElements: ${data?.totalElements}`)

        const items = data?.data || data?.listings || data?.content || data?.results || (Array.isArray(data) ? data : [])
        console.log(`[ReZen] Items found: ${Array.isArray(items) ? items.length : 'not-array'}`)

        if (Array.isArray(items) && items.length > 0) {
          for (const tx of items) {
            const record = buildTransactionRecord(tx, userId, agentName, yentaId)
            if (!record) continue
            record.is_listing = true
            await supabase.from('synced_transactions').upsert(record, { onConflict: 'user_id,platform,external_id' })
            recordsSynced++
            listingsFound++
          }
          console.log(`[ReZen] SUCCESS: synced ${listingsFound} listings from ${label}`)
          break // found working endpoint, stop trying
        }
      } catch (err) {
        const msg = (err as Error).message?.slice(0, 200)
        console.log(`[ReZen] FAIL ${candidate.url}: ${msg}`)
      }
    }

    console.log(`[ReZen] === LISTING SYNC END: ${listingsFound} total listings ===`)

    // 3. Sync revenue share payments (AFTER listings - don't block listings with slow revshare calls)
    if (prefs.revshare) {
    await setSyncStep(supabase, connectionId, 'revshare', 'Fetching revenue share…')
    try {
      console.log('[ReZen] Fetching revshare payments...')
      const rsData = await rezenGet(ARRAKIS,
        `revshares/${yentaId}/payments`,
        apiKey,
        { pageSize: '200' }
      )
      const payments = rsData?.data || rsData?.results || rsData?.content || rsData?.payments || (Array.isArray(rsData) ? rsData : [])
      console.log(`[ReZen] Found ${Array.isArray(payments) ? payments.length : 0} revshare payments`)

      if (Array.isArray(payments)) {
        for (const payment of payments) {
          const paymentId = String(payment.id || payment.outgoingPaymentId || '')
          if (!paymentId) continue

          const paidAt = payment.paidAt || payment.createdAt || payment.paymentDate || ''
          let period = ''
          if (paidAt) {
            const d = new Date(typeof paidAt === 'number' ? (paidAt > 1e12 ? paidAt : paidAt * 1000) : paidAt)
            if (!isNaN(d.getTime())) period = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
          }

          const amount = payment.amount?.amount
            ? payment.amount.amount
            : (typeof payment.amount === 'number' ? payment.amount : 0)

          await supabase.from('revenue_share').upsert({
            user_id: userId,
            platform: 'real_broker',
            agent_name: payment.agentName || payment.contributorName || agentName,
            tier: payment.tier || 1,
            amount,
            period: period || 'unknown',
            cap_contribution: payment.capContribution || null,
            status: payment.status || 'paid',
            notes: `ReZen Payment ID: ${paymentId}`,
            raw_data: payment,
          }, { onConflict: 'user_id,platform,agent_name,period' })

          recordsSynced++
        }
      }
    } catch (rsErr) {
      console.warn('[ReZen] RevShare sync error:', rsErr)
    }

    // 3b. Try the direct contributions endpoint (per-payment 404s removed — endpoint doesn't exist)
    try {
      // Also try the direct contributions endpoint
      try {
        const allContribs = await rezenGet(ARRAKIS,
          `revshares/${yentaId}/contributions`,
          apiKey,
          { pageSize: '500', pageNumber: '0' }
        )
        
        const contribs = allContribs?.data || allContribs?.contributions || allContribs?.content || (Array.isArray(allContribs) ? allContribs : [])
        console.log(`[ReZen] Direct contributions endpoint: ${Array.isArray(contribs) ? contribs.length : 0} results`)
        console.log(`[ReZen] Contributions response keys: ${JSON.stringify(Object.keys(allContribs || {})).slice(0, 300)}`)
        
        if (Array.isArray(contribs)) {
          for (const contrib of contribs) {
            const contributorName = contrib.contributorName || contrib.agentName ||
              (contrib.firstName ? `${contrib.firstName} ${contrib.lastName || ''}`.trim() : '') || 'Unknown'
            
            const contribAmount = contrib.amount?.amount
              ? contrib.amount.amount
              : (typeof contrib.amount === 'number' ? contrib.amount : 0)
            
            if (contribAmount <= 0) continue
            
            const paidAt = contrib.paidAt || contrib.createdAt || contrib.transactionClosedAt || ''
            let period = ''
            if (paidAt) {
              const d = new Date(typeof paidAt === 'number' ? (paidAt > 1e12 ? paidAt : paidAt * 1000) : paidAt)
              if (!isNaN(d.getTime())) period = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
            }
            
            const contribTier = contrib.tier || contrib.revShareTier || 1
            
            await supabase.from('revenue_share').upsert({
              user_id: userId,
              platform: 'real_broker',
              agent_name: contributorName,
              tier: contribTier,
              amount: contribAmount,
              period: period || 'unknown',
              cap_contribution: contrib.capContribution || contrib.capAmount || null,
              status: contrib.status || 'paid',
              notes: `Contribution from ${contributorName}`,
              raw_data: contrib,
            }, { onConflict: 'user_id,platform,agent_name,period' })
            
            recordsSynced++
          }
        }
      } catch (directErr) {
        console.warn('[ReZen] Direct contributions endpoint error:', directErr)
      }
    } catch (contribErr) {
      console.warn('[ReZen] Per-agent contribution sync error:', contribErr)
    }
    } // end if (prefs.revshare)

    // 4. Sync revshare performance & by-tier data + network summary
    if (prefs.revshare || prefs.network) {
    try {
      console.log('[ReZen] Fetching revshare performance...')
      const [perfData, byTierData] = await Promise.allSettled([
        rezenGet(ARRAKIS, `revshares/performance/${yentaId}/revenue-share/current`, apiKey),
        rezenGet(ARRAKIS, `revshares/${yentaId}/by-tier`, apiKey),
      ])

      const performance = perfData.status === 'fulfilled' ? perfData.value : null
      const byTier = byTierData.status === 'fulfilled' ? byTierData.value : null

      if (performance || byTier) {
        console.log('[ReZen] Got revshare performance/by-tier data')
      }

      // 5. Agent cap info + network size
      console.log('[ReZen] Fetching agent details...')
      const [capData, networkSizeData] = await Promise.allSettled([
        rezenGet(YENTA, `agents/${yentaId}/cap-info`, apiKey),
        rezenGet(YENTA, `agents/${yentaId}/network-size-by-tier`, apiKey),
      ])

      const capInfo = capData.status === 'fulfilled' ? capData.value : null
      const networkSize = networkSizeData.status === 'fulfilled' ? networkSizeData.value : null

      let totalAgents = 0
      if (networkSize && typeof networkSize === 'object') {
        if (Array.isArray(networkSize)) {
          totalAgents = networkSize.reduce((sum: number, t: any) => sum + (t.count || t.size || 0), 0)
        } else {
          Object.values(networkSize).forEach((v: any) => {
            if (typeof v === 'number') totalAgents += v
          })
        }
      }

      console.log(`[ReZen] Network size: ${totalAgents} agents`)

      await supabase.from('network_summary').upsert({
        user_id: userId,
        platform: 'real_broker',
        total_network_agents: totalAgents,
        network_size_by_tier: networkSize,
        revshare_by_tier: byTier,
        revshare_performance: performance,
        agent_cap_info: capInfo,
        synced_at: new Date().toISOString(),
      }, { onConflict: 'user_id,platform' })

      recordsSynced++
    } catch (err) {
      console.warn('[ReZen] Performance/network sync error:', err)
    }
    } // end if (prefs.revshare || prefs.network)

    // 6. Sync front-line agents (Tier 1 network) — now with avatar + network_size
    if (prefs.network) {
    await setSyncStep(supabase, connectionId, 'network', 'Fetching network & downline…')
    try {
      console.log('[ReZen] Fetching frontline agents...')
      const frontLine = await rezenGet(YENTA, `agents/${yentaId}/front-line-agents-info`, apiKey)
      console.log(`[ReZen] Frontline response keys: ${JSON.stringify(Object.keys(frontLine || {})).slice(0, 200)}`)
      const agents = Array.isArray(frontLine) ? frontLine : (frontLine?.frontLineAgentInfos || frontLine?.agents || frontLine?.data || frontLine?.content || [])
      console.log(`[ReZen] Found ${Array.isArray(agents) ? agents.length : 0} frontline agents`)

      if (Array.isArray(agents)) {
        for (const agent of agents) {
          const agentId = String(agent.id || agent.agentId || agent.yentaId || '')
          if (!agentId) continue
          const agentFullName = agent.firstName ? `${agent.firstName} ${agent.lastName || ''}`.trim() : (agent.name || agent.fullName || '')

          const joinDateRaw = agent.createdAt || agent.anniversaryDate || agent.joinDate || null
          const joinDate = toISODate(joinDateRaw)
          
          let daysWithBrokerage: number | null = null
          if (joinDateRaw) {
            const ms = typeof joinDateRaw === 'number' ? (joinDateRaw > 1e12 ? joinDateRaw : joinDateRaw * 1000) : new Date(joinDateRaw).getTime()
            if (!isNaN(ms)) {
              daysWithBrokerage = Math.floor((Date.now() - ms) / (1000 * 60 * 60 * 24))
            }
          }

          // Extract avatar URL
          const avatarUrl = agent.avatar || agent.avatarUrl || agent.profileImageUrl || null

          // Extract network size
          const networkSizeVal = agent.sizeOfNetwork || agent.networkSize || 0

          await supabase.from('network_agents').upsert({
            user_id: userId,
            platform: 'real_broker',
            agent_yenta_id: agentId,
            agent_name: agentFullName,
            email: agent.emailAddress || agent.email || null,
            phone: agent.phoneNumber || agent.phone || null,
            tier: agent.tier || 1,
            status: agent.status || 'ACTIVE',
            sponsor_name: agent.sponsorName || null,
            join_date: joinDate,
            days_with_brokerage: daysWithBrokerage,
            avatar_url: avatarUrl,
            network_size: networkSizeVal,
            raw_data: agent,
            synced_at: new Date().toISOString(),
          }, { onConflict: 'user_id,platform,agent_yenta_id' })

          recordsSynced++
        }
      }
    } catch (err) {
      console.warn('[ReZen] Frontline agents sync error:', err)
    }

    // 7. Sync downline agents (Tiers 1-5) — now with avatar + network_size
    for (let tier = 1; tier <= 5; tier++) {
      try {
        const downline = await rezenGet(YENTA,
          `agents/${yentaId}/down-line/${tier}`,
          apiKey,
          { pageSize: '100', pageNumber: '0' }
        )
        const dlAgents = downline?.downLineAgents || downline?.data || downline?.content || downline?.agents || (Array.isArray(downline) ? downline : [])
        console.log(`[ReZen] Tier ${tier} downline response keys: ${JSON.stringify(Object.keys(downline || {})).slice(0, 200)}`)
        console.log(`[ReZen] Tier ${tier} dlAgents count: ${Array.isArray(dlAgents) ? dlAgents.length : 'not array'}`)

        if (Array.isArray(dlAgents) && dlAgents.length > 0) {
          for (const agent of dlAgents) {
            const agentId = String(agent.id || agent.agentId || agent.yentaId || '')
            if (!agentId) continue
            const dlAgentName = agent.firstName ? `${agent.firstName} ${agent.lastName || ''}`.trim() : (agent.name || agent.fullName || '')

            const joinDateRaw = agent.createdAt || agent.anniversaryDate || agent.joinDate || null
            const joinDate = toISODate(joinDateRaw)

            let daysWithBrokerage: number | null = null
            if (joinDateRaw) {
              const ms = typeof joinDateRaw === 'number' ? (joinDateRaw > 1e12 ? joinDateRaw : joinDateRaw * 1000) : new Date(joinDateRaw).getTime()
              if (!isNaN(ms)) {
                daysWithBrokerage = Math.floor((Date.now() - ms) / (1000 * 60 * 60 * 24))
              }
            }

            const avatarUrl = agent.avatar || agent.avatarUrl || agent.profileImageUrl || null
            const networkSizeVal = agent.sizeOfNetwork || agent.networkSize || 0

            await supabase.from('network_agents').upsert({
              user_id: userId,
              platform: 'real_broker',
              agent_yenta_id: agentId,
              agent_name: dlAgentName,
              email: agent.emailAddress || agent.email || null,
              phone: agent.phoneNumber || agent.phone || null,
              tier,
              status: agent.status || 'ACTIVE',
              sponsor_name: agent.sponsorName || null,
              join_date: joinDate,
              days_with_brokerage: daysWithBrokerage,
              avatar_url: avatarUrl,
              network_size: networkSizeVal,
              raw_data: agent,
              synced_at: new Date().toISOString(),
            }, { onConflict: 'user_id,platform,agent_yenta_id' })

            recordsSynced++
          }
        }
      } catch (err) {
        console.log(`[ReZen] Tier ${tier} downline: no data or error`)
      }
    }
    } // end if (prefs.network)

    // Update connection status — clear step marker on success
    await supabase.from('platform_connections').update({
      sync_status: 'success',
      last_synced_at: new Date().toISOString(),
      sync_error: null,
    }).eq('id', connectionId)

    if (syncLog) {
      await supabase.from('sync_logs').update({
        status: 'success',
        records_synced: recordsSynced,
        completed_at: new Date().toISOString(),
      }).eq('id', syncLog.id)
    }

    console.log(`[ReZen] Sync complete: ${recordsSynced} records`)
    return { success: true, records_synced: recordsSynced }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('[ReZen] Sync failed:', errorMessage)

    await supabase.from('platform_connections').update({
      sync_status: 'error', sync_error: errorMessage,
    }).eq('id', connectionId)

    if (syncLog) {
      await supabase.from('sync_logs').update({
        status: 'error', error_message: errorMessage, completed_at: new Date().toISOString(),
      }).eq('id', syncLog.id)
    }

    throw error
  }
}

// ─── Lofty helpers ────────────────────────────────────────────────────────────

async function syncLofty(supabase: any, userId: string, apiKey: string, connectionId: string) {
  const baseUrl = 'https://api.lofty.com'

  await supabase.from('platform_connections').update({
    sync_status: 'syncing', sync_error: null,
  }).eq('id', connectionId)

  const { data: syncLog } = await supabase.from('sync_logs').insert({
    user_id: userId, platform: 'lofty', sync_type: 'manual', status: 'started',
  }).select().single()

  try {
    const response = await fetch(`${baseUrl}/transactions`, {
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Lofty API error [${response.status}]: ${errorText}`)
    }

    const data = await response.json()
    const transactions = data.data || data.results || data || []
    let recordsSynced = 0

    if (Array.isArray(transactions)) {
      for (const tx of transactions) {
        const externalId = tx.id || tx._id || String(tx.transactionId)
        await supabase.from('synced_transactions').upsert({
          user_id: userId,
          platform: 'lofty',
          external_id: externalId,
          transaction_type: tx.type || tx.status || 'unknown',
          client_name: tx.buyerName || tx.sellerName || tx.clientName || tx.contact_name || '',
          property_address: tx.address || tx.propertyAddress || '',
          city: tx.city || '',
          sale_price: tx.price || tx.salePrice || null,
          commission_amount: tx.commission || tx.commissionAmount || null,
          close_date: tx.closeDate || tx.closingDate || null,
          listing_date: tx.listingDate || null,
          status: tx.status || '',
          agent_name: tx.agentName || tx.agent || '',
          raw_data: tx,
          synced_at: new Date().toISOString(),
        }, { onConflict: 'user_id,platform,external_id' })
        recordsSynced++
      }
    }

    await supabase.from('platform_connections').update({
      sync_status: 'success', last_synced_at: new Date().toISOString(), sync_error: null,
    }).eq('id', connectionId)

    if (syncLog) {
      await supabase.from('sync_logs').update({
        status: 'success', records_synced: recordsSynced, completed_at: new Date().toISOString(),
      }).eq('id', syncLog.id)
    }

    return { success: true, records_synced: recordsSynced }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    await supabase.from('platform_connections').update({
      sync_status: 'error', sync_error: errorMessage,
    }).eq('id', connectionId)

    if (syncLog) {
      await supabase.from('sync_logs').update({
        status: 'error', error_message: errorMessage, completed_at: new Date().toISOString(),
      }).eq('id', syncLog.id)
    }
    throw error
  }
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Read body ONCE — prevents "body already consumed" errors
    const body = await req.json()
    const { platform, connection_id, preferences, scheduled_user_id } = body

    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const isServiceRole = authHeader === `Bearer ${serviceRoleKey}`

    // Service-role client — always needed for decryption
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      serviceRoleKey,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )

    let userId: string

    if (isServiceRole) {
      // Called from scheduled-sync — trust the scheduled_user_id in the body
      if (!scheduled_user_id) {
        return new Response(JSON.stringify({ error: 'scheduled_user_id required for service-role calls' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      userId = scheduled_user_id
      return await handleSync(supabaseAdmin, userId, platform, connection_id, preferences, corsHeaders)
    }

    // Regular user JWT validation
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    userId = userData.user.id;
    return await handleSync(supabaseAdmin, userId, platform, connection_id, preferences, corsHeaders)
  } catch (error) {
    console.error('Sync error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Failed to sync'
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

// ── Core sync handler (shared by user JWT calls and scheduled service-role calls) ──

async function handleSync(
  supabaseAdmin: any,
  userId: string,
  platform: string,
  connection_id: string,
  preferences: any,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  const syncPrefs = {
    transactions: preferences?.transactions !== false,
    revshare: preferences?.revshare !== false,
    network: preferences?.network !== false,
  }

  if (!platform || !connection_id) {
    return new Response(JSON.stringify({ error: 'platform and connection_id required' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Fetch the connection using service role so we can decrypt
  const { data: connection, error: connError } = await supabaseAdmin
    .from('platform_connections')
    .select('*')
    .eq('id', connection_id)
    .eq('user_id', userId)
    .single()

  if (connError || !connection) {
    return new Response(JSON.stringify({ error: 'Connection not found' }), {
      status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  if (!connection.api_key) {
    return new Response(JSON.stringify({ error: 'API key missing. Please reconnect by re-entering your API key in Settings → Integrations.' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Decrypt the api_key server-side — never passes through the client
  const passphrase = Deno.env.get('ENCRYPTION_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const { data: decryptedKey, error: decryptError } = await supabaseAdmin
    .rpc('decrypt_api_credential', { ciphertext: connection.api_key, passphrase })
  if (decryptError) {
    console.error('[sync-platform] Failed to decrypt api_key:', decryptError)
    return new Response(JSON.stringify({ error: 'Failed to decrypt API key' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  const apiKey = decryptedKey as string

  let syncPromise: Promise<any>
  switch (platform) {
    case 'lofty':
      syncPromise = syncLofty(supabaseAdmin, userId, apiKey, connection_id)
      break
    case 'real_broker':
      syncPromise = syncRealBroker(supabaseAdmin, userId, apiKey, connection_id, syncPrefs)
      break
    default:
      return new Response(JSON.stringify({ error: `Platform '${platform}' sync not yet supported` }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
  }

  // Run sync — try background mode first, fall back to awaiting directly
  // @ts-ignore
  if (typeof EdgeRuntime !== 'undefined' && typeof EdgeRuntime.waitUntil === 'function') {
    // @ts-ignore
    EdgeRuntime.waitUntil(syncPromise.catch((err) => console.error('Background sync error:', err)))
    return new Response(JSON.stringify({ success: true, message: 'Sync started in background' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Fallback: await directly (sync completes before response)
  try {
    const result = await syncPromise
    return new Response(JSON.stringify({ success: true, ...result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Sync failed'
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
}
