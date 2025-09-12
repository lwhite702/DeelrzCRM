import { randomBytes, createCipheriv, createDecipheriv } from "crypto";

// Encryption format version for future compatibility
const ENCRYPTION_VERSION = "2.0";
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 12 bytes for AES GCM (recommended)
const KEY_LENGTH = 32; // 32 bytes for AES-256
const AUTH_TAG_LENGTH = 16; // 16 bytes for GCM auth tag

export interface EncryptedBlob {
  version: string;
  algorithm: string;
  keyId: string;
  iv: string; // Base64 encoded
  ciphertext: string; // Base64 encoded
  authTag: string; // Base64 encoded authentication tag
}

/**
 * Encrypts data for a specific tenant using their current active key
 * @param tenantId The tenant ID to encrypt data for
 * @param data The plaintext data to encrypt (will be JSON.stringify'd)
 * @returns Encrypted blob structure
 */
export async function encrypt(tenantId: string, data: any): Promise<EncryptedBlob> {
  try {
    // Import keyStore dynamically to avoid circular dependency
    const { keyStore } = await import("./keyStore");
    
    // Get the active encryption key for this tenant
    const { key, keyId } = await keyStore.getActiveKey(tenantId);
    
    // Convert data to JSON string if not already a string
    const plaintext = typeof data === "string" ? data : JSON.stringify(data);
    
    // Generate random IV for this encryption
    const iv = randomBytes(IV_LENGTH);
    
    // Use key as Buffer directly (no hex conversion needed)
    const keyBuffer = Buffer.isBuffer(key) ? key : Buffer.from(key, 'hex');
    
    // Create cipher with GCM mode
    const cipher = createCipheriv(ALGORITHM, keyBuffer, iv);
    
    // Set Additional Authenticated Data (AAD) to bind to tenant
    const aad = Buffer.from(tenantId, 'utf8');
    cipher.setAAD(aad);
    
    // Encrypt the data
    let ciphertext = cipher.update(plaintext, "utf8", "base64");
    ciphertext += cipher.final("base64");
    
    // Get the authentication tag
    const authTag = cipher.getAuthTag();
    
    return {
      version: ENCRYPTION_VERSION,
      algorithm: ALGORITHM,
      keyId,
      iv: iv.toString("base64"),
      ciphertext,
      authTag: authTag.toString("base64")
    };
  } catch (error) {
    // Don't log the actual data being encrypted for security
    console.error(`Encryption failed for tenant ${tenantId}:`, error);
    throw new Error("Encryption failed");
  }
}

/**
 * Decrypts an encrypted blob for a specific tenant
 * @param tenantId The tenant ID that owns this encrypted data
 * @param blob The encrypted blob to decrypt
 * @returns The decrypted plaintext data
 */
export async function decrypt(tenantId: string, blob: EncryptedBlob): Promise<string> {
  try {
    // Handle both old (CBC) and new (GCM) formats for backward compatibility
    const isLegacyFormat = blob.version === "1.0" || !blob.authTag;
    
    if (isLegacyFormat) {
      return decryptLegacy(tenantId, blob);
    }
    
    // Validate blob structure for GCM format
    if (!blob.version || !blob.algorithm || !blob.keyId || !blob.iv || !blob.ciphertext || !blob.authTag) {
      throw new Error("Invalid encrypted blob structure");
    }
    
    // Check version compatibility
    if (blob.version !== ENCRYPTION_VERSION) {
      throw new Error(`Unsupported encryption version: ${blob.version}`);
    }
    
    // Check algorithm compatibility
    if (blob.algorithm !== ALGORITHM) {
      throw new Error(`Unsupported encryption algorithm: ${blob.algorithm}`);
    }
    
    // Import keyStore dynamically to avoid circular dependency
    const { keyStore } = await import("./keyStore");
    
    // Get the key for this specific keyId and tenant
    const key = await keyStore.getKey(tenantId, blob.keyId);
    
    // Use key as Buffer directly (no hex conversion needed)
    const keyBuffer = Buffer.isBuffer(key) ? key : Buffer.from(key, 'hex');
    const iv = Buffer.from(blob.iv, 'base64');
    const authTag = Buffer.from(blob.authTag, 'base64');
    
    // Create decipher with GCM mode
    const decipher = createDecipheriv(ALGORITHM, keyBuffer, iv);
    
    // Set the authentication tag
    decipher.setAuthTag(authTag);
    
    // Set Additional Authenticated Data (AAD) to verify tenant binding
    const aad = Buffer.from(tenantId, 'utf8');
    decipher.setAAD(aad);
    
    // Decrypt the data
    let plaintext = decipher.update(blob.ciphertext, "base64", "utf8");
    plaintext += decipher.final("utf8");
    
    return plaintext;
  } catch (error) {
    // Don't log the actual encrypted data for security
    console.error(`Decryption failed for tenant ${tenantId}, keyId ${blob.keyId}:`, error);
    throw new Error("Decryption failed");
  }
}

/**
 * Utility function to encrypt JSON data and return the blob
 * @param tenantId The tenant ID
 * @param data The data to encrypt (will be JSON stringified)
 * @returns Encrypted blob
 */
export async function encryptJson(tenantId: string, data: any): Promise<EncryptedBlob> {
  return encrypt(tenantId, JSON.stringify(data));
}

/**
 * Utility function to decrypt a blob and parse as JSON
 * @param tenantId The tenant ID
 * @param blob The encrypted blob
 * @returns Parsed JSON data
 */
export async function decryptJson(tenantId: string, blob: EncryptedBlob): Promise<any> {
  const plaintext = await decrypt(tenantId, blob);
  return JSON.parse(plaintext);
}

/**
 * Utility function to safely encrypt data that might be null/undefined
 * @param tenantId The tenant ID
 * @param data The data to encrypt (can be null/undefined)
 * @returns Encrypted blob or null if input was null/undefined
 */
export async function encryptOptional(tenantId: string, data: any): Promise<EncryptedBlob | null> {
  if (data === null || data === undefined) {
    return null;
  }
  return encrypt(tenantId, data);
}

/**
 * Legacy decryption function for backward compatibility with CBC format
 * @param tenantId The tenant ID
 * @param blob The encrypted blob in legacy format
 * @returns Decrypted plaintext
 */
async function decryptLegacy(tenantId: string, blob: EncryptedBlob): Promise<string> {
  try {
    console.warn(`Using legacy decryption for tenant ${tenantId}, consider re-encrypting data`);
    
    // Import keyStore dynamically to avoid circular dependency
    const { keyStore } = await import("./keyStore");
    
    // Get the key for this specific keyId and tenant
    const key = await keyStore.getKey(tenantId, blob.keyId);
    
    // Create decipher with legacy CBC mode
    const keyBuffer = Buffer.isBuffer(key) ? key : Buffer.from(key, 'hex');
    const iv = Buffer.from(blob.iv, 'base64');
    const decipher = createDecipheriv("aes-256-cbc", keyBuffer, iv);
    
    // Decrypt the data
    let plaintext = decipher.update(blob.ciphertext, "base64", "utf8");
    plaintext += decipher.final("utf8");
    
    return plaintext;
  } catch (error) {
    console.error(`Legacy decryption failed for tenant ${tenantId}, keyId ${blob.keyId}:`, error);
    throw new Error("Legacy decryption failed");
  }
}

/**
 * Utility function to safely decrypt data that might be null
 * @param tenantId The tenant ID
 * @param blob The encrypted blob (can be null)
 * @returns Decrypted data or null if input was null
 */
export async function decryptOptional(tenantId: string, blob: EncryptedBlob | null): Promise<string | null> {
  if (!blob) {
    return null;
  }
  return decrypt(tenantId, blob);
}