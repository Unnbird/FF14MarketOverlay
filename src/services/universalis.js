import { fetchWithTimeout } from './request'

const UNIVERSALIS_BASE_URL = 'https://universalis.app/api/v2'
const UNIVERSALIS_TIMEOUT_MS = 12_000

async function fetchJson(url, options = {}) {
  const response = await fetchWithTimeout(url, {
    signal: options.signal,
    timeoutMs: options.timeoutMs ?? UNIVERSALIS_TIMEOUT_MS,
    timeoutMessage: 'Universalis 查詢逾時，請稍後再試',
  })

  if (response.status === 404) return null
  if (!response.ok) {
    throw new Error(`Universalis 查詢失敗 (${response.status})`)
  }

  return response.json()
}

export async function loadServerOptions(signal = null) {
  const [datacenters, worlds] = await Promise.all([
    fetchJson(`${UNIVERSALIS_BASE_URL}/data-centers`, { signal }),
    fetchJson(`${UNIVERSALIS_BASE_URL}/worlds`, { signal }),
  ])

  const worldNames = new Map()
  worlds.forEach((world) => worldNames.set(String(world.id), world.name))

  const options = []
  datacenters.forEach((dc) => {
    options.push({
      value: `dc:${dc.name}`,
      apiTarget: dc.name,
      label: `${dc.name} / DC`,
      name: dc.name,
      region: dc.region ?? '',
      kind: 'dc',
    })

    dc.worlds?.forEach((worldId) => {
      const worldName = worldNames.get(String(worldId)) ?? `World ${worldId}`
      options.push({
        value: `world:${worldId}`,
        apiTarget: String(worldId),
        label: `${worldName} / ${dc.name}`,
        name: worldName,
        region: dc.region ?? '',
        kind: 'world',
      })
    })
  })

  return { datacenters, worlds, options }
}

export function getDefaultTargetOption(options) {
  return (
    options.find((option) => option.kind === 'dc' && option.region.startsWith('繁中服')) ??
    options.find((option) => option.kind === 'dc') ??
    options[0] ??
    null
  )
}

export async function getMarketData(target, itemId, options = {}) {
  const params = new URLSearchParams({
    listings: String(options.listings ?? 20),
    entries: String(options.entries ?? 0),
  })

  if (options.hq) params.set('hq', 'true')

  const url = `${UNIVERSALIS_BASE_URL}/${encodeURIComponent(target)}/${itemId}?${params}`
  return fetchJson(url, { signal: options.signal })
}

export function normalizeMarketListings(data, itemName, targetLabel, limit) {
  const fallbackWorldName = data?.worldName ?? data?.dcName ?? targetLabel

  return (data?.listings ?? [])
    .map((listing, index) => {
      const pricePerUnit = Number(listing.pricePerUnit ?? 0)
      const quantity = Number(listing.quantity ?? 0)
      const total = Number(listing.total ?? pricePerUnit * quantity)

      return {
        key: `${index}-${listing.retainerID ?? listing.retainerName ?? 'listing'}-${pricePerUnit}-${quantity}-${listing.hq ? 'hq' : 'nq'}`,
        itemName,
        pricePerUnit,
        quantity,
        total,
        retainerName: listing.retainerName ?? '-',
        worldName: listing.worldName ?? fallbackWorldName,
        hq: Boolean(listing.hq),
        lastReviewTime: listing.lastReviewTime ?? null,
      }
    })
    .filter((listing) => listing.pricePerUnit > 0 && listing.quantity > 0)
    .sort((left, right) => left.pricePerUnit - right.pricePerUnit)
    .slice(0, limit)
}