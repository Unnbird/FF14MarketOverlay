import { Activity, LoaderCircle, Maximize2, Minimize2, RefreshCw, Wifi, WifiOff } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import './App.css'
import { findTwItemByName } from './services/itemsDatabase'
import { subscribeToItemLog } from './services/overlayLog'
import {
  getDefaultTargetOption,
  getMarketData,
  loadServerOptions,
  normalizeMarketListings,
} from './services/universalis'

const TARGET_STORAGE_KEY = 'act-market-overlay-target'
const HQ_ONLY_STORAGE_KEY = 'act-market-overlay-hq-only'
const LIST_SIZE = 20

const FALLBACK_TARGET = {
  value: 'dc:陸行鳥',
  apiTarget: '陸行鳥',
  label: '陸行鳥 / DC',
  kind: 'dc',
}

function formatGil(value) {
  return Number(value ?? 0).toLocaleString('zh-TW')
}

function getDateFromUniversalisTime(value) {
  if (!value) return null
  const numericValue = Number(value)
  if (!Number.isFinite(numericValue)) return null
  const milliseconds = numericValue < 10_000_000_000 ? numericValue * 1000 : numericValue
  return new Date(milliseconds)
}

function formatMarketTime(value) {
  const date = getDateFromUniversalisTime(value)
  if (!date) return '-'
  return date.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })
}

function getInitialHqOnly() {
  return localStorage.getItem(HQ_ONLY_STORAGE_KEY) === 'true'
}

function App() {
  const [overlayStatus, setOverlayStatus] = useState({
    connected: false,
    seen: 0,
    matched: 0,
    message: '等待 OverlayPlugin API',
  })
  const [detectedItem, setDetectedItem] = useState(null)
  const [targetOptions, setTargetOptions] = useState([])
  const [targetValue, setTargetValue] = useState(
    () => localStorage.getItem(TARGET_STORAGE_KEY) || FALLBACK_TARGET.value,
  )
  const [isLoadingServers, setIsLoadingServers] = useState(true)
  const [serverError, setServerError] = useState(null)
  const [hqOnly, setHqOnly] = useState(getInitialHqOnly)
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [marketInfo, setMarketInfo] = useState(null)
  const [listings, setListings] = useState([])
  const [queryState, setQueryState] = useState('idle')
  const [queryError, setQueryError] = useState(null)

  const selectedTarget = useMemo(() => {
    return (
      targetOptions.find((option) => option.value === targetValue) ??
      (targetValue === FALLBACK_TARGET.value ? FALLBACK_TARGET : null) ??
      targetOptions[0] ??
      FALLBACK_TARGET
    )
  }, [targetOptions, targetValue])

  const pushDetectedItem = useCallback((name, source = 'manual', rawLine = '') => {
    const trimmedName = name.trim()
    if (!trimmedName) return

    setDetectedItem({
      name: trimmedName,
      rawLine,
      source,
      detectedAt: new Date().toISOString(),
      sequence: Date.now(),
    })
  }, [])

  useEffect(() => {
    const unsubscribe = subscribeToItemLog({
      onItem: (item) => pushDetectedItem(item.name, item.source, item.rawLine),
      onStatus: setOverlayStatus,
      onError: (error) => console.error(error),
    })

    return unsubscribe
  }, [pushDetectedItem])

  useEffect(() => {
    const controller = new AbortController()

    async function loadTargets() {
      setIsLoadingServers(true)
      setServerError(null)

      try {
        const result = await loadServerOptions(controller.signal)
        if (controller.signal.aborted) return

        setTargetOptions(result.options)
        const savedTarget = localStorage.getItem(TARGET_STORAGE_KEY)
        const savedOption = result.options.find((option) => option.value === savedTarget)
        const defaultOption = savedOption ?? getDefaultTargetOption(result.options)
        if (defaultOption) setTargetValue(defaultOption.value)
      } catch (error) {
        if (controller.signal.aborted) return
        console.error(error)
        setServerError(error.message || '伺服器資料載入失敗')
      } finally {
        if (!controller.signal.aborted) setIsLoadingServers(false)
      }
    }

    loadTargets()
    return () => controller.abort()
  }, [])

  useEffect(() => {
    localStorage.setItem(TARGET_STORAGE_KEY, targetValue)
  }, [targetValue])

  useEffect(() => {
    localStorage.setItem(HQ_ONLY_STORAGE_KEY, String(hqOnly))
  }, [hqOnly])

  useEffect(() => {
    if (!detectedItem?.name || !selectedTarget?.apiTarget) return

    const controller = new AbortController()

    async function loadMarketListings() {
      setQueryState('loading')
      setQueryError(null)

      try {
        const item = await findTwItemByName(detectedItem.name, controller.signal)
        if (controller.signal.aborted) return

        if (!item) {
          setMarketInfo(null)
          setListings([])
          setQueryError(`找不到物品：${detectedItem.name}`)
          setQueryState('error')
          return
        }

        setIsCollapsed(false)

        const data = await getMarketData(selectedTarget.apiTarget, item.id, {
          listings: LIST_SIZE,
          entries: 0,
          hq: hqOnly,
          signal: controller.signal,
        })
        if (controller.signal.aborted) return

        const nextListings = normalizeMarketListings(data, item.name, selectedTarget.label, LIST_SIZE)
        setMarketInfo(data)
        setListings(nextListings)

        if (!data || nextListings.length === 0) {
          setQueryError('目前沒有在售列表')
          setQueryState('empty')
          return
        }

        setQueryState('ready')
      } catch (error) {
        if (controller.signal.aborted || error.name === 'AbortError') return
        console.error(error)
        setListings([])
        setMarketInfo(null)
        setQueryError(error.message || '市場資料查詢失敗')
        setQueryState('error')
      }
    }

    loadMarketListings()
    return () => controller.abort()
  }, [detectedItem, hqOnly, selectedTarget])

  const refreshListings = () => {
    if (!detectedItem) return
    setDetectedItem((current) => ({
      ...current,
      detectedAt: new Date().toISOString(),
      sequence: Date.now(),
    }))
  }

  const statusClass = overlayStatus.connected ? 'connected' : 'waiting'
  const isLoading = queryState === 'loading'
  const lastUploadTime = formatMarketTime(marketInfo?.lastUploadTime)
  const cheapestListing = listings[0]

  return (
    <main className={`overlay-shell${isCollapsed ? ' collapsed' : ''}`}>
      <header className="overlay-header">
        <div className="title-block">
          <div className="eyebrow">ACT Market Overlay</div>
          {isCollapsed && <h1>ACT Market Overlay</h1>}
          <p className={detectedItem ? 'detected-item' : 'detected-item empty'}>
            {detectedItem?.name ?? '尚未偵測到物品'}
          </p>
        </div>
        <div className="header-actions">
          <div className={`connection ${statusClass}`} title={overlayStatus.message}>
            {overlayStatus.connected ? <Wifi size={18} /> : <WifiOff size={18} />}
            <span>{overlayStatus.connected ? 'OverlayPlugin' : '等待中'}</span>
          </div>
          <button
            type="button"
            className="icon-button collapse-button"
            onClick={() => setIsCollapsed((current) => !current)}
            aria-label={isCollapsed ? '展開' : '縮小'}
            title={isCollapsed ? '展開' : '縮小'}
          >
            {isCollapsed ? <Maximize2 size={17} /> : <Minimize2 size={17} />}
          </button>
        </div>
      </header>

      <section className="toolbar" aria-label="查詢設定">
        <label className="toggle-field">
          <input
            type="checkbox"
            checked={hqOnly}
            onChange={(event) => setHqOnly(event.target.checked)}
          />
          <span>HQ</span>
        </label>

        <button
          type="button"
          className="icon-button"
          onClick={refreshListings}
          disabled={!detectedItem || isLoading}
          aria-label="重新查詢"
          title="重新查詢"
        >
          <RefreshCw size={18} className={isLoading ? 'spin' : ''} />
        </button>
      </section>

      {(serverError || queryError || isLoadingServers) && (
        <div className={`notice ${queryState === 'error' || serverError ? 'error' : ''}`}>
          {isLoadingServers && <LoaderCircle size={16} className="spin" />}
          {!isLoadingServers && (queryState === 'error' || serverError) && <Activity size={16} />}
          <span>{serverError ?? queryError ?? '載入伺服器資料'}</span>
        </div>
      )}

      <section className="summary-grid" aria-label="目前物品摘要">
        <div className="metric">
          <span>最低單價</span>
          <strong>{cheapestListing ? `${formatGil(cheapestListing.pricePerUnit)} gil` : '-'}</strong>
        </div>
        <div className="metric">
          <span>更新</span>
          <strong>{lastUploadTime}</strong>
        </div>
      </section>

      <section className="market-panel" aria-label="在售列表">
        {isLoading ? (
          <div className="state-panel loading">
            <LoaderCircle size={24} className="spin" />
            <span>查詢中</span>
          </div>
        ) : listings.length > 0 ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>品質</th>
                  <th>單價</th>
                  <th>數量</th>
                  <th>總價</th>
                  <th>伺服器</th>
                </tr>
              </thead>
              <tbody>
                {listings.map((listing) => (
                  <tr key={listing.key}>
                    <td>
                      <span className={listing.hq ? 'quality hq' : 'quality'}>
                        {listing.hq ? 'HQ' : 'NQ'}
                      </span>
                    </td>
                    <td className="price">{formatGil(listing.pricePerUnit)}</td>
                    <td>{formatGil(listing.quantity)}</td>
                    <td className="total">{formatGil(listing.total)}</td>
                    <td className="truncate" title={listing.worldName}>{listing.worldName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="state-panel">
            <Activity size={24} />
            <span>{queryError ?? '等待物品'}</span>
          </div>
        )}
      </section>

    </main>
  )
}

export default App