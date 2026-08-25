import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { env } from '../../config/env.js'
import type { StorageProvider } from './index.js'

/** Works unchanged against MinIO locally and real S3 in production. */
export class S3StorageProvider implements StorageProvider {
  private readonly client = new S3Client({
    endpoint: env.STORAGE_ENDPOINT,
    region: env.STORAGE_REGION,
    forcePathStyle: env.STORAGE_FORCE_PATH_STYLE,
    credentials: {
      accessKeyId: env.STORAGE_ACCESS_KEY,
      secretAccessKey: env.STORAGE_SECRET_KEY,
    },
  })

  private ensured: Promise<void> | undefined

  /**
   * MinIO starts with no buckets, so the first upload would fail with
   * NoSuchBucket. Create it once, lazily, and remember that we did.
   *
   * Against real S3 a missing bucket means misconfiguration; the create will
   * fail loudly on IAM rather than silently papering over it.
   */
  private ensureBucket(): Promise<void> {
    if (this.ensured) return this.ensured

    this.ensured = (async () => {
      try {
        await this.client.send(new HeadBucketCommand({ Bucket: env.STORAGE_BUCKET }))
        return
      } catch {
        // Falls through to create.
      }
      try {
        await this.client.send(new CreateBucketCommand({ Bucket: env.STORAGE_BUCKET }))
      } catch (err) {
        const name = (err as { name?: string }).name
        // Another instance won the race — that is success, not failure.
        if (name !== 'BucketAlreadyOwnedByYou' && name !== 'BucketAlreadyExists') throw err
      }
    })()

    // A failed attempt must not be cached, or the process never recovers.
    this.ensured.catch(() => {
      this.ensured = undefined
    })

    return this.ensured
  }

  async put(key: string, body: Buffer, contentType: string): Promise<string> {
    await this.ensureBucket()
    await this.client.send(
      new PutObjectCommand({
        Bucket: env.STORAGE_BUCKET,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    )
    return key
  }

  async signedUrl(key: string, ttlSeconds = 300): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: env.STORAGE_BUCKET, Key: key }),
      { expiresIn: ttlSeconds },
    )
  }
}
