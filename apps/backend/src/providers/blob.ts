import { BlobServiceClient, type ContainerClient } from "@azure/storage-blob";
import { DefaultAzureCredential } from "@azure/identity";
import { ApiError } from "../errors.js";

export interface DownloadedBlob {
  readonly data: Buffer;
  readonly contentType: string;
}

export interface BlobStorageProvider {
  upload(id: string, data: Buffer, contentType: string): Promise<void>;
  download(id: string): Promise<DownloadedBlob>;
  delete(id: string): Promise<void>;
}

const CONTAINER_NAME = "uploads";

/** Production/local-Azurite blob storage backed by @azure/storage-blob. */
export class AzureBlobStorageProvider implements BlobStorageProvider {
  private readonly container: ContainerClient;

  private constructor(container: ContainerClient) {
    this.container = container;
  }

  public static fromConnectionString(connectionString: string): AzureBlobStorageProvider {
    const service = BlobServiceClient.fromConnectionString(connectionString);
    return new AzureBlobStorageProvider(service.getContainerClient(CONTAINER_NAME));
  }

  public static fromAccount(accountName: string): AzureBlobStorageProvider {
    const url = `https://${accountName}.blob.core.windows.net`;
    const service = new BlobServiceClient(url, new DefaultAzureCredential());
    return new AzureBlobStorageProvider(service.getContainerClient(CONTAINER_NAME));
  }

  public async upload(id: string, data: Buffer, contentType: string): Promise<void> {
    await this.container.createIfNotExists();
    const blob = this.container.getBlockBlobClient(id);
    await blob.uploadData(data, {
      blobHTTPHeaders: { blobContentType: contentType },
    });
  }

  public async download(id: string): Promise<DownloadedBlob> {
    const blob = this.container.getBlockBlobClient(id);
    const exists = await blob.exists();
    if (!exists) {
      throw new ApiError("NOT_FOUND", `Image ${id} not found`);
    }
    const data = await blob.downloadToBuffer();
    const properties = await blob.getProperties();
    return {
      data,
      contentType: properties.contentType ?? "application/octet-stream",
    };
  }

  public async delete(id: string): Promise<void> {
    const blob = this.container.getBlockBlobClient(id);
    await blob.deleteIfExists();
  }
}

/** In-memory blob storage for unit and integration tests. */
export class InMemoryBlobStorageProvider implements BlobStorageProvider {
  private readonly store = new Map<string, DownloadedBlob>();

  public upload(id: string, data: Buffer, contentType: string): Promise<void> {
    this.store.set(id, { data: Buffer.from(data), contentType });
    return Promise.resolve();
  }

  public download(id: string): Promise<DownloadedBlob> {
    const found = this.store.get(id);
    if (found === undefined) {
      throw new ApiError("NOT_FOUND", `Image ${id} not found`);
    }
    return Promise.resolve(found);
  }

  public delete(id: string): Promise<void> {
    this.store.delete(id);
    return Promise.resolve();
  }
}
