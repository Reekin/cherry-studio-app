import AsyncStorage from '@react-native-async-storage/async-storage'

import { loggerService } from '@/services/LoggerService'
import { uuid } from '@/utils'

const DEVICE_ID_KEY = 'agent_remote.device_id'
const LAST_ACK_SEQ_KEY = 'agent_remote.last_ack_seq'

const logger = loggerService.withContext('Agent Remote Storage')

export interface AgentRemoteStorageSnapshot {
  deviceId: string
  lastAckSeq: number
}

export interface AgentRemoteStorage {
  getDeviceId(): Promise<string>
  getLastAckSeq(): Promise<number>
  setLastAckSeq(seq: number): Promise<void>
  hydrate(): Promise<AgentRemoteStorageSnapshot>
}

export class AsyncStorageAgentRemoteStorage implements AgentRemoteStorage {
  async getDeviceId(): Promise<string> {
    const existingDeviceId = await AsyncStorage.getItem(DEVICE_ID_KEY)

    if (existingDeviceId) {
      return existingDeviceId
    }

    const nextDeviceId = uuid()
    await AsyncStorage.setItem(DEVICE_ID_KEY, nextDeviceId)
    logger.info('Generated new agent remote device id', { deviceId: nextDeviceId })
    return nextDeviceId
  }

  async getLastAckSeq(): Promise<number> {
    const value = await AsyncStorage.getItem(LAST_ACK_SEQ_KEY)
    const seq = value ? Number(value) : 0

    if (!Number.isFinite(seq) || seq < 0) {
      return 0
    }

    return seq
  }

  async setLastAckSeq(seq: number): Promise<void> {
    const normalizedSeq = Math.max(0, Math.floor(seq))
    await AsyncStorage.setItem(LAST_ACK_SEQ_KEY, String(normalizedSeq))
  }

  async hydrate(): Promise<AgentRemoteStorageSnapshot> {
    const [deviceId, lastAckSeq] = await Promise.all([this.getDeviceId(), this.getLastAckSeq()])

    return {
      deviceId,
      lastAckSeq
    }
  }
}
