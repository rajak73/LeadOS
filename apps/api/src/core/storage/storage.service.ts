// Storage service — presigned URL generation for direct client→storage uploads.
//
// Provider routing (Sprint 4 M5 — S3 only):
//   All file types → S3 (via PutObject presigned URL, 15-min expiry).
//   Cloudinary routing (for images) is deferred to Sprint 6 when media uploads land.
//
// Test/dev bypass:
//   When isTest() is true, returns a mock presigned URL without calling AWS. This allows
//   the integration test suite to exercise the presigned-url endpoint without real credentials.
//
// Production requirements (env.ts): S3_BUCKET, S3_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY.

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { isTest } from '../config/env.js';
import { env } from '../config/env.js';

const PRESIGNED_URL_EXPIRY_SECONDS = 900; // 15 minutes

export interface PresignedUrlResult {
  presignedUrl: string;
  storageKey: string;
  storageProvider: 'S3';
}

let s3Client: S3Client | null = null;

function getS3Client(): S3Client {
  if (s3Client === null) {
    // exactOptionalPropertyTypes: build client with or without credentials to avoid
    // inferred `credentials?: ... | undefined` which S3ClientConfig rejects.
    if (env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY) {
      s3Client = new S3Client({
        region: env.S3_REGION ?? 'us-east-1',
        credentials: { accessKeyId: env.AWS_ACCESS_KEY_ID, secretAccessKey: env.AWS_SECRET_ACCESS_KEY },
      });
    } else {
      s3Client = new S3Client({ region: env.S3_REGION ?? 'us-east-1' });
    }
  }
  return s3Client;
}

export class StorageService {
  async generatePresignedUrl(params: {
    organizationId: string;
    fileId: string;
    fileName: string;
    mimeType: string;
  }): Promise<PresignedUrlResult> {
    const storageKey = `orgs/${params.organizationId}/files/${params.fileId}/${params.fileName}`;

    if (isTest()) {
      return {
        presignedUrl: `http://mock-storage.test/${storageKey}`,
        storageKey,
        storageProvider: 'S3',
      };
    }

    const bucket = env.S3_BUCKET;
    if (!bucket) {
      throw new Error('S3_BUCKET is not configured');
    }

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: storageKey,
      ContentType: params.mimeType,
    });

    const presignedUrl = await getSignedUrl(getS3Client(), command, {
      expiresIn: PRESIGNED_URL_EXPIRY_SECONDS,
    });

    return { presignedUrl, storageKey, storageProvider: 'S3' };
  }
}
