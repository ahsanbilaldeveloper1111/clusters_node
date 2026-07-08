import { randomUUID } from 'node:crypto';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
} from 'aws-lambda';

const s3 = new S3Client({});
const BUCKET = process.env.DOCUMENTS_BUCKET_NAME!;
const PRESIGN_EXPIRES = Number(process.env.PRESIGN_EXPIRES_SECONDS ?? '900');
const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_BYTES ?? String(10 * 1024 * 1024));
const ALLOWED_PREFIX = process.env.UPLOAD_KEY_PREFIX ?? 'documents/';

const ALLOWED_CONTENT_TYPES = new Set(
  (process.env.ALLOWED_CONTENT_TYPES ?? 'application/pdf,image/png,image/jpeg,text/plain,application/json')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean),
);

function json(statusCode: number, body: unknown): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'content-type,authorization',
      'access-control-allow-methods': 'GET,POST,DELETE,OPTIONS',
    },
    body: JSON.stringify(body),
  };
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200);
}

function buildObjectKey(filename: string, folder?: string): string {
  const safeName = sanitizeFilename(filename || 'upload.bin');
  const folderPart = folder ? `${sanitizeFilename(folder)}/` : '';
  return `${ALLOWED_PREFIX}${folderPart}${randomUUID()}-${safeName}`;
}

function parseBody(event: APIGatewayProxyEventV2): Record<string, unknown> {
  if (!event.body) return {};
  const raw = event.isBase64Encoded
    ? Buffer.from(event.body, 'base64').toString('utf8')
    : event.body;
  return JSON.parse(raw) as Record<string, unknown>;
}

/** POST /presign — client uploads directly to S3 using returned URL */
async function handlePresign(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const body = parseBody(event);
  const filename = String(body.filename ?? 'document.bin');
  const contentType = String(body.contentType ?? 'application/octet-stream');
  const folder = body.folder ? String(body.folder) : undefined;

  if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
    return json(400, { error: 'Content type not allowed', allowed: [...ALLOWED_CONTENT_TYPES] });
  }

  const key = buildObjectKey(filename, folder);
  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: contentType,
  });

  const uploadUrl = await getSignedUrl(s3, command, { expiresIn: PRESIGN_EXPIRES });

  return json(200, {
    uploadUrl,
    key,
    bucket: BUCKET,
    expiresIn: PRESIGN_EXPIRES,
    method: 'PUT',
    headers: { 'Content-Type': contentType },
  });
}

/** POST /upload — small files via API (base64 body field) */
async function handleDirectUpload(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const body = parseBody(event);
  const filename = String(body.filename ?? 'document.bin');
  const contentType = String(body.contentType ?? 'application/octet-stream');
  const dataBase64 = String(body.dataBase64 ?? '');

  if (!dataBase64) {
    return json(400, { error: 'dataBase64 is required for direct upload' });
  }

  if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
    return json(400, { error: 'Content type not allowed', allowed: [...ALLOWED_CONTENT_TYPES] });
  }

  const buffer = Buffer.from(dataBase64, 'base64');
  if (buffer.length > MAX_UPLOAD_BYTES) {
    return json(413, { error: 'File too large', maxBytes: MAX_UPLOAD_BYTES });
  }

  const key = buildObjectKey(filename);
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    }),
  );

  return json(201, { key, bucket: BUCKET, size: buffer.length });
}

/** GET /documents — list objects */
async function handleList(): Promise<APIGatewayProxyResultV2> {
  const result = await s3.send(
    new ListObjectsV2Command({
      Bucket: BUCKET,
      Prefix: ALLOWED_PREFIX,
      MaxKeys: 100,
    }),
  );

  const documents = (result.Contents ?? []).map((o) => ({
    key: o.Key,
    size: o.Size,
    lastModified: o.LastModified,
  }));

  return json(200, { documents, count: documents.length });
}

/** GET /documents/{key+} — presigned download URL */
async function handleDownload(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const key = event.pathParameters?.proxy;
  if (!key || !key.startsWith(ALLOWED_PREFIX)) {
    return json(400, { error: 'Invalid document key' });
  }

  const downloadUrl = await getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: BUCKET, Key: key }),
    { expiresIn: PRESIGN_EXPIRES },
  );

  return json(200, { downloadUrl, key, expiresIn: PRESIGN_EXPIRES });
}

/** DELETE /documents/{key+} */
async function handleDelete(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const key = event.pathParameters?.proxy;
  if (!key || !key.startsWith(ALLOWED_PREFIX)) {
    return json(400, { error: 'Invalid document key' });
  }

  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
  return json(200, { deleted: true, key });
}

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  try {
    const method = event.requestContext.http.method;
    const path = event.rawPath;

    if (method === 'OPTIONS') {
      return json(204, {});
    }

    if (method === 'POST' && path === '/presign') {
      return handlePresign(event);
    }

    if (method === 'POST' && path === '/upload') {
      return handleDirectUpload(event);
    }

    if (method === 'GET' && path === '/documents') {
      return handleList();
    }

    if (method === 'GET' && path.startsWith('/documents/')) {
      return handleDownload(event);
    }

    if (method === 'DELETE' && path.startsWith('/documents/')) {
      return handleDelete(event);
    }

    return json(404, { error: 'Not found', path, method });
  } catch (err) {
    console.error(err);
    return json(500, { error: 'Internal server error' });
  }
}
