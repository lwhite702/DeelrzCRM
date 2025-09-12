import { createCipheriv, createDecipheriv, randomBytes, hkdfSync } from "crypto";
import { db } from "./db";
import { tenantKeys, type TenantKey, type InsertTenantKey } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";

// Key cache configuration
const KEY_CACHE_TTL = 5 * 60 * 1000; // 5 minutes in milliseconds
const DATA_KEY_LENGTH = 32; // 32 bytes for AES-256

interface CacheEntry {
  key: Buffer;
  keyId: string;
  expiresAt: number;
}

interface KeyCache {
  [tenantId: string]: CacheEntry;
}

class KeyStore {
  private cache: KeyCache = {};
  private masterKey: Buffer;

  constructor() {
    // Initialize master key from environment variable
    const masterKeyHex = process.env.ENCRYPTION_MASTER_KEY;
    if (!masterKeyHex) {
      throw new Error("ENCRYPTION_MASTER_KEY environment variable is required for encryption functionality");
    }
    
    if (masterKeyHex.length < 64) {
      throw new Error("ENCRYPTION_MASTER_KEY must be at least 32 bytes (64 hex characters)");
    }
    
    this.masterKey = Buffer.from(masterKeyHex, "hex");
    console.log("KeyStore initialized with master key");
  }

  /**
   * Get the active encryption key for a tenant (with caching)
   * @param tenantId The tenant ID
   * @returns Object containing the key buffer and key ID
   */
  async getActiveKey(tenantId: string): Promise<{ key: Buffer; keyId: string }> {
    try {
      // Check cache first
      const cached = this.cache[tenantId];
      if (cached && cached.expiresAt > Date.now()) {
        return { key: cached.key, keyId: cached.keyId };
      }

      // Get active key from database
      const [activeKey] = await db
        .select()
        .from(tenantKeys)
        .where(and(
          eq(tenantKeys.tenantId, tenantId),
          eq(tenantKeys.status, "active")
        ))
        .orderBy(desc(tenantKeys.keyVersion))
        .limit(1);

      if (!activeKey) {
        // No active key exists, generate a new one
        const newKey = await this.generateNewKey(tenantId);
        return { key: newKey.key, keyId: newKey.keyId };
      }

      // Unwrap the key
      const key = this.unwrapKey(activeKey.wrappedKey);
      
      // Cache the key
      this.cache[tenantId] = {
        key,
        keyId: activeKey.id,
        expiresAt: Date.now() + KEY_CACHE_TTL
      };

      return { key, keyId: activeKey.id };
    } catch (error) {
      console.error(`Failed to get active key for tenant ${tenantId}:`, error);
      throw new Error("Key retrieval failed");
    }
  }

  /**
   * Get a specific key by tenant and key ID (for decryption of old data)
   * @param tenantId The tenant ID
   * @param keyId The specific key ID to retrieve
   * @returns The unwrapped key buffer
   */
  async getKey(tenantId: string, keyId: string): Promise<Buffer> {
    try {
      // Check cache first (current active key only)
      const cached = this.cache[tenantId];
      if (cached && cached.keyId === keyId && cached.expiresAt > Date.now()) {
        return cached.key;
      }

      // Get specific key from database
      const [keyRecord] = await db
        .select()
        .from(tenantKeys)
        .where(and(
          eq(tenantKeys.tenantId, tenantId),
          eq(tenantKeys.id, keyId)
        ));

      if (!keyRecord) {
        throw new Error(`Key ${keyId} not found for tenant ${tenantId}`);
      }

      // Unwrap the key
      const key = this.unwrapKey(keyRecord.wrappedKey);

      // Cache only if this is the active key
      if (keyRecord.status === "active") {
        this.cache[tenantId] = {
          key,
          keyId: keyRecord.id,
          expiresAt: Date.now() + KEY_CACHE_TTL
        };
      }

      return key;
    } catch (error) {
      console.error(`Failed to get key ${keyId} for tenant ${tenantId}:`, error);
      throw new Error("Key retrieval failed");
    }
  }

  /**
   * Generate a new encryption key for a tenant
   * @param tenantId The tenant ID
   * @param keyVersion Optional version number (auto-incremented if not provided)
   * @returns Object with the new key and key ID
   */
  async generateNewKey(tenantId: string, keyVersion?: number): Promise<{ key: Buffer; keyId: string }> {
    try {
      // Get the next version number if not provided
      if (keyVersion === undefined) {
        const [latestKey] = await db
          .select({ keyVersion: tenantKeys.keyVersion })
          .from(tenantKeys)
          .where(eq(tenantKeys.tenantId, tenantId))
          .orderBy(desc(tenantKeys.keyVersion))
          .limit(1);
        
        keyVersion = latestKey ? latestKey.keyVersion + 1 : 1;
      }

      // Generate new random data key
      const dataKey = randomBytes(DATA_KEY_LENGTH);
      
      // Wrap the key with master key
      const wrappedKey = this.wrapKey(dataKey);

      // Store in database
      const keyData: InsertTenantKey = {
        tenantId,
        keyVersion,
        wrappedKey,
        status: "active"
      };

      const [newKeyRecord] = await db.insert(tenantKeys).values(keyData).returning();

      // Cache the new key
      this.cache[tenantId] = {
        key: dataKey,
        keyId: newKeyRecord.id,
        expiresAt: Date.now() + KEY_CACHE_TTL
      };

      console.log(`Generated new key for tenant ${tenantId}, version ${keyVersion}`);
      return { key: dataKey, keyId: newKeyRecord.id };
    } catch (error) {
      console.error(`Failed to generate new key for tenant ${tenantId}:`, error);
      throw new Error("Key generation failed");
    }
  }

  /**
   * Rotate keys for a tenant (revoke old, create new)
   * @param tenantId The tenant ID
   * @returns Object with the new key and key ID
   */
  async rotateKey(tenantId: string): Promise<{ key: Buffer; keyId: string }> {
    try {
      // Revoke all existing active keys for this tenant
      await db
        .update(tenantKeys)
        .set({ 
          status: "revoked",
          revokedAt: new Date()
        })
        .where(and(
          eq(tenantKeys.tenantId, tenantId),
          eq(tenantKeys.status, "active")
        ));

      // Clear cache for this tenant
      delete this.cache[tenantId];

      // Generate new key
      const newKey = await this.generateNewKey(tenantId);
      
      console.log(`Rotated keys for tenant ${tenantId}`);
      return newKey;
    } catch (error) {
      console.error(`Failed to rotate keys for tenant ${tenantId}:`, error);
      throw new Error("Key rotation failed");
    }
  }

  /**
   * Wrap a data key with the master key using envelope encryption
   * @param dataKey The data key to wrap
   * @returns JSON string with wrapped key components
   */
  private wrapKey(dataKey: Buffer): string {
    try {
      // Generate random salt and IV for this key wrapping
      const salt = randomBytes(32);
      const iv = randomBytes(12); // 12 bytes for GCM
      
      // Use HKDF to derive a wrapping key from master key + salt
      const wrappingKey = hkdfSync("sha256", this.masterKey, salt, Buffer.from("DeelRxCRM-KEK", "utf8"), 32);
      
      // Encrypt the data key using AES-256-GCM
      const cipher = createCipheriv("aes-256-gcm", wrappingKey, iv);
      
      // Add Additional Authenticated Data
      const aad = Buffer.from("data-key-wrap", "utf8");
      cipher.setAAD(aad);
      
      // Encrypt the data key
      const ciphertext = Buffer.concat([
        cipher.update(dataKey),
        cipher.final()
      ]);
      
      // Get the authentication tag
      const authTag = cipher.getAuthTag();
      
      // Create wrapped key structure
      const wrappedKeyData = {
        version: "2.0",
        algorithm: "aes-256-gcm",
        salt: salt.toString("base64"),
        iv: iv.toString("base64"),
        ciphertext: ciphertext.toString("base64"),
        authTag: authTag.toString("base64")
      };
      
      return JSON.stringify(wrappedKeyData);
    } catch (error) {
      console.error("Key wrapping failed:", error);
      throw new Error("Key wrapping failed");
    }
  }

  /**
   * Unwrap a data key using the master key
   * @param wrappedKey JSON string or legacy base64 encoded wrapped key
   * @returns The unwrapped data key
   */
  private unwrapKey(wrappedKey: string): Buffer {
    try {
      // Try to parse as JSON (new format)
      let wrappedKeyData;
      try {
        wrappedKeyData = JSON.parse(wrappedKey);
      } catch {
        // Fall back to legacy format
        return this.unwrapKeyLegacy(wrappedKey);
      }
      
      // Validate wrapped key structure
      if (!wrappedKeyData.version || !wrappedKeyData.salt || !wrappedKeyData.iv || 
          !wrappedKeyData.ciphertext || !wrappedKeyData.authTag) {
        throw new Error("Invalid wrapped key structure");
      }
      
      // Check version
      if (wrappedKeyData.version !== "2.0") {
        throw new Error(`Unsupported wrapped key version: ${wrappedKeyData.version}`);
      }
      
      // Decode components
      const salt = Buffer.from(wrappedKeyData.salt, "base64");
      const iv = Buffer.from(wrappedKeyData.iv, "base64");
      const ciphertext = Buffer.from(wrappedKeyData.ciphertext, "base64");
      const authTag = Buffer.from(wrappedKeyData.authTag, "base64");
      
      // Use HKDF to derive the same wrapping key
      const wrappingKey = hkdfSync("sha256", this.masterKey, salt, Buffer.from("DeelRxCRM-KEK", "utf8"), 32);
      
      // Create decipher with GCM mode
      const decipher = createDecipheriv("aes-256-gcm", wrappingKey, iv);
      
      // Set authentication tag
      decipher.setAuthTag(authTag);
      
      // Set Additional Authenticated Data
      const aad = Buffer.from("data-key-wrap", "utf8");
      decipher.setAAD(aad);
      
      // Decrypt the data key
      const unwrapped = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final()
      ]);
      
      return unwrapped;
    } catch (error) {
      console.error("Key unwrapping failed:", error);
      throw new Error("Key unwrapping failed");
    }
  }

  /**
   * Legacy unwrap function for backward compatibility
   * @param wrappedKey Base64 encoded legacy wrapped key
   * @returns The unwrapped data key
   */
  private unwrapKeyLegacy(wrappedKey: string): Buffer {
    try {
      console.warn("Using legacy key unwrapping, consider rotating keys for better security");
      
      // Decode from base64
      const combined = Buffer.from(wrappedKey, "base64");
      
      // Split IV and wrapped key (legacy format)
      const iv = combined.slice(0, 16);
      const wrapped = combined.slice(16);
      
      // Use PBKDF2 to derive the same wrapping key (legacy method)
      const { pbkdf2Sync } = require("crypto");
      const wrappingKey = pbkdf2Sync(this.masterKey, iv, 10000, 32, "sha256");
      
      // Decrypt the data key using legacy CBC mode
      const decipher = createDecipheriv("aes-256-cbc", wrappingKey, iv);
      let unwrapped = decipher.update(wrapped);
      unwrapped = Buffer.concat([unwrapped, decipher.final()]);
      
      return unwrapped;
    } catch (error) {
      console.error("Legacy key unwrapping failed:", error);
      throw new Error("Legacy key unwrapping failed");
    }
  }

  /**
   * Clear cache entry for a specific tenant (useful for testing or force refresh)
   * @param tenantId The tenant ID to clear from cache
   */
  clearCache(tenantId?: string): void {
    if (tenantId) {
      delete this.cache[tenantId];
    } else {
      this.cache = {};
    }
  }

  /**
   * Get cache stats for monitoring
   */
  getCacheStats(): { totalEntries: number; tenants: string[] } {
    return {
      totalEntries: Object.keys(this.cache).length,
      tenants: Object.keys(this.cache)
    };
  }
}

// Export singleton instance
export const keyStore = new KeyStore();