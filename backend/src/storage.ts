import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

const s3Config: any = {
  region: process.env.AWS_REGION || "us-east-1",
};

if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
  s3Config.credentials = {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  };
}

const s3Client = new S3Client(s3Config);
const BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME || "";

export async function putFile(key: string, bytes: Buffer): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    Body: bytes,
  });
  await s3Client.send(command);
  return key;
}

export async function getFile(key: string): Promise<Buffer> {
  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });
  const response = await s3Client.send(command);
  if (!response.Body) {
    throw new Error("Empty body returned from S3");
  }
  const byteArray = await response.Body.transformToByteArray();
  return Buffer.from(byteArray);
}

export async function deleteFile(key: string): Promise<void> {
  const command = new DeleteObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });
  try {
    await s3Client.send(command);
  } catch (err) {
    console.error("Error deleting file from S3:", err);
  }
}
