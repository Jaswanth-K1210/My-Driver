import { env } from '../../config/env.js'
import { S3StorageProvider } from './s3.js'

export interface StorageProvider {
  put(key: string, body: Buffer, contentType: string): Promise<string>
  signedUrl(key: string, ttlSeconds?: number): Promise<string>
}

export class MemoryStorageProvider implements StorageProvider {
  readonly objects = new Map<string, { body: Buffer; contentType: string }>()

  async put(key: string, body: Buffer, contentType: string): Promise<string> {
    this.objects.set(key, { body, contentType })
    return key
  }

  async signedUrl(key: string): Promise<string> {
    return `memory://${key}`
  }
}

let instance: StorageProvider | undefined

export function getStorageProvider(): StorageProvider {
  if (!instance) {
    instance = env.NODE_ENV === 'test' ? new MemoryStorageProvider() : new S3StorageProvider()
  }
  return instance
}

export function setStorageProvider(provider: StorageProvider | undefined): void {
  instance = provider
}
