import { loggerService } from '@/services/LoggerService'
import type { AgentRemoteConnectOptions, AgentRemoteEnvelope } from '@/types/agentRemote'
import { parseAgentRemoteEnvelope } from '@/types/agentRemote'

const DEFAULT_INITIAL_DELAY_MS = 1_000
const DEFAULT_MAX_DELAY_MS = 10_000

const logger = loggerService.withContext('Agent Remote WS Client')

export interface AgentRemoteWebSocketClientListener {
  onConnecting?: () => void
  onConnected?: () => void
  onDisconnected?: (event?: CloseEvent) => void
  onEnvelope?: (envelope: AgentRemoteEnvelope) => void
  onError?: (error: Error) => void
  onReconnectScheduled?: (delayMs: number, attempt: number) => void
}

function resolveReconnectDelay(options: AgentRemoteConnectOptions, attempt: number): number {
  const initialDelayMs = options.reconnect?.initialDelayMs ?? DEFAULT_INITIAL_DELAY_MS
  const maxDelayMs = options.reconnect?.maxDelayMs ?? DEFAULT_MAX_DELAY_MS

  return Math.min(maxDelayMs, initialDelayMs * 2 ** Math.max(0, attempt - 1))
}

function withQueryParams(url: string, params: Record<string, string | number | undefined>): string {
  const query = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&')

  if (!query) {
    return url
  }

  return `${url}${url.includes('?') ? '&' : '?'}${query}`
}

export class AgentRemoteWebSocketClient {
  private socket: WebSocket | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectAttempt = 0
  private shouldReconnect = true

  constructor(
    private readonly listeners: AgentRemoteWebSocketClientListener,
    private readonly getRecoveryQuery: () => { deviceId?: string; lastAckSeq?: number }
  ) {}

  connect(options: AgentRemoteConnectOptions): Promise<void> {
    this.shouldReconnect = true
    this.clearReconnectTimer()
    this.listeners.onConnecting?.()

    return new Promise((resolve, reject) => {
      const recovery = this.getRecoveryQuery()
      const url = withQueryParams(options.url, {
        deviceId: recovery.deviceId,
        lastAckSeq: recovery.lastAckSeq
      })

      const headers = {
        ...(options.headers ?? {}),
        ...(options.sharedKey ? { Authorization: `Bearer ${options.sharedKey}` } : {})
      }

      try {
        const WebSocketCtor = WebSocket as unknown as new (
          url: string,
          protocols?: string | string[],
          options?: unknown
        ) => WebSocket
        const socket = new WebSocketCtor(url, options.protocols ?? [], { headers })
        this.socket = socket

        socket.onopen = () => {
          this.reconnectAttempt = 0
          this.listeners.onConnected?.()
          resolve()
        }

        socket.onmessage = event => {
          try {
            const raw = typeof event.data === 'string' ? event.data : String(event.data)
            const parsed = parseAgentRemoteEnvelope(JSON.parse(raw))
            this.listeners.onEnvelope?.(parsed)
          } catch (error) {
            const normalizedError =
              error instanceof Error ? error : new Error('Failed to parse agent remote websocket message')
            this.listeners.onError?.(normalizedError)
          }
        }

        socket.onerror = () => {
          this.listeners.onError?.(new Error('Agent remote websocket transport error'))
        }

        socket.onclose = event => {
          this.socket = null
          this.listeners.onDisconnected?.(event)
          this.scheduleReconnectIfNeeded(options)
        }
      } catch (error) {
        const normalizedError =
          error instanceof Error ? error : new Error('Failed to create agent remote websocket')
        reject(normalizedError)
        this.listeners.onError?.(normalizedError)
      }
    })
  }

  disconnect(code?: number, reason?: string): void {
    this.shouldReconnect = false
    this.clearReconnectTimer()
    this.socket?.close(code, reason)
    this.socket = null
  }

  isConnected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN
  }

  send(envelope: AgentRemoteEnvelope): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error('Agent remote websocket is not connected')
    }

    this.socket.send(JSON.stringify(envelope))
  }

  private scheduleReconnectIfNeeded(options: AgentRemoteConnectOptions): void {
    if (!this.shouldReconnect || options.reconnect?.enabled === false) {
      return
    }

    this.reconnectAttempt += 1
    const delayMs = resolveReconnectDelay(options, this.reconnectAttempt)
    this.listeners.onReconnectScheduled?.(delayMs, this.reconnectAttempt)
    this.clearReconnectTimer()

    this.reconnectTimer = setTimeout(() => {
      this.connect(options).catch(error => {
        logger.warn('Reconnect attempt failed', error)
      })
    }, delayMs)
  }

  private clearReconnectTimer(): void {
    if (!this.reconnectTimer) {
      return
    }

    clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
  }
}
