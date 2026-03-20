/**
 * StorageAdapter — pluggable file/object storage interface.
 * Default: Cloudflare R2
 * Swappable to: S3, MinIO, GCS
 */

export interface StorageObject {
  key: string;
  size: number;
  contentType: string;
  lastModified: Date;
  etag?: string;
}

export interface UploadOptions {
  contentType?: string;
  metadata?: Record<string, string>;
  expiresIn?: number; // seconds for presigned URLs
}

export interface StorageAdapter {
  /** Upload an object */
  put(bucket: string, key: string, data: ReadableStream | ArrayBuffer | string, options?: UploadOptions): Promise<StorageObject>;

  /** Get an object */
  get(bucket: string, key: string): Promise<{ data: ReadableStream; metadata: StorageObject } | null>;

  /** Delete an object */
  delete(bucket: string, key: string): Promise<void>;

  /** List objects with prefix */
  list(bucket: string, prefix?: string, limit?: number): Promise<StorageObject[]>;

  /** Generate a presigned URL for upload */
  getUploadUrl(bucket: string, key: string, options?: UploadOptions): Promise<string>;

  /** Generate a presigned URL for download */
  getDownloadUrl(bucket: string, key: string, expiresIn?: number): Promise<string>;
}

/**
 * Default implementation using Cloudflare R2.
 * R2 bucket bindings are configured in wrangler.toml.
 */
export class R2StorageAdapter implements StorageAdapter {
  constructor(private readonly bucket: R2Bucket) {}

  async put(
    _bucket: string,
    key: string,
    data: ReadableStream | ArrayBuffer | string,
    options?: UploadOptions,
  ): Promise<StorageObject> {
    const obj = await this.bucket.put(key, data, {
      httpMetadata: options?.contentType ? { contentType: options.contentType } : undefined,
      customMetadata: options?.metadata,
    });
    return {
      key: obj?.key ?? key,
      size: obj?.size ?? 0,
      contentType: options?.contentType ?? 'application/octet-stream',
      lastModified: obj?.uploaded ?? new Date(),
      etag: obj?.etag,
    };
  }

  async get(_bucket: string, key: string) {
    const obj = await this.bucket.get(key);
    if (!obj) return null;
    return {
      data: obj.body,
      metadata: {
        key: obj.key,
        size: obj.size,
        contentType: obj.httpMetadata?.contentType ?? 'application/octet-stream',
        lastModified: obj.uploaded,
        etag: obj.etag,
      },
    };
  }

  async delete(_bucket: string, key: string): Promise<void> {
    await this.bucket.delete(key);
  }

  async list(_bucket: string, prefix?: string, limit = 100): Promise<StorageObject[]> {
    const result = await this.bucket.list({ prefix, limit });
    return result.objects.map((obj) => ({
      key: obj.key,
      size: obj.size,
      contentType: obj.httpMetadata?.contentType ?? 'application/octet-stream',
      lastModified: obj.uploaded,
      etag: obj.etag,
    }));
  }

  async getUploadUrl(_bucket: string, _key: string, _options?: UploadOptions): Promise<string> {
    // R2 presigned URLs require the S3 API compatibility layer
    throw new Error('Use R2 S3 API for presigned URLs');
  }

  async getDownloadUrl(_bucket: string, _key: string, _expiresIn?: number): Promise<string> {
    throw new Error('Use R2 S3 API for presigned URLs');
  }
}
