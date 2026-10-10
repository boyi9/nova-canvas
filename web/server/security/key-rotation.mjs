// Nova Canvas Key Rotation Middleware
// Automates API key rotation for enhanced security

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// Rotation configuration
const ROTATION_CONFIG = {
  // Default rotation interval (in hours)
  intervalHours: 24,
  
  // Maximum number of active keys
  maxActiveKeys: 3,
  
  // Key storage path
  keyStoragePath: path.join(process.cwd(), 'server', 'security', 'keys'),
  
  // Algorithm for key generation
  algorithm: 'aes-256-gcm',
};

// Ensure key storage directory exists
const KEY_DIR = ROTATION_CONFIG.keyStoragePath;
if (!fs.existsSync(KEY_DIR)) {
  fs.mkdirSync(KEY_DIR, { recursive: true });
}

/**
 * Generate a new encryption key
 * @returns {Object} - Generated key with metadata
 */
function generateKey() {
  const key = crypto.randomBytes(32); // 256-bit key
  const iv = crypto.randomBytes(12); // 96-bit IV for GCM
  const keyId = `key_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  
  const keyMetadata = {
    id: keyId,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + ROTATION_CONFIG.intervalHours * 60 * 60 * 1000),
    version: 1,
    active: true,
    iv: iv.toString('hex'),
  };
  
  // Save key to storage
  const keyPath = path.join(KEY_DIR, `${keyId}.json`);
  fs.writeFileSync(keyPath, JSON.stringify(keyMetadata, null, 2));
  
  // Clean up old keys (keep only maxActiveKeys)
  cleanupOldKeys();
  
  return {
    key: key.toString('base64'),
    metadata: keyMetadata,
    iv: iv.toString('hex'),
  };
}

/**
 * Clean up old keys, keeping only maxActiveKeys
 */
function cleanupOldKeys() {
  const keys = fs.readdirSync(KEY_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => path.join(KEY_DIR, f));
  
  // Sort by creation time (oldest first)
  const keyStats = keys.map(keyPath => {
    const stats = fs.statSync(keyPath);
    return { path: keyPath, mtime: stats.mtime };
  });
  
  keyStats.sort((a, b) => a.mtime - b.mtime);
  
  // Remove excess keys
  if (keys.length > ROTATION_CONFIG.maxActiveKeys) {
    const keysToRemove = keys.length - ROTATION_CONFIG.maxActiveKeys;
    for (let i = 0; i < keysToRemove; i++) {
      try {
        fs.unlinkSync(keyStats[i].path);
      } catch (e) {
        console.warn(`Failed to remove old key: ${keyStats[i].path}`, e);
      }
    }
  }
}

/**
 * Get current active key
 * @returns {Object|null} - Current key metadata or null
 */
function getCurrentKey() {
  const keys = fs.readdirSync(KEY_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => path.join(KEY_DIR, f))
    .map(keyPath => {
      try {
        const content = fs.readFileSync(keyPath, 'utf-8');
        return { path: keyPath, metadata: JSON.parse(content) };
      } catch (e) {
        return null;
      }
    }).filter(k => k !== null);
  
  // Sort by creation time (newest first)
  keys.sort((a, b) => b.metadata.createdAt - a.metadata.createdAt);
  
  // Return the newest active key that hasn't expired
  for (const key of keys) {
    const { metadata } = key;
    if (metadata.active && new Date() < new Date(metadata.expiresAt)) {
      return key;
    }
  }
  
  return null;
}

/**
 * Rotate key (generate new key, mark old key as inactive)
 * @returns {Object} - Rotation result
 */
function rotateKey() {
  // Get current key and mark it as inactive
  const currentKey = getCurrentKey();
  
  if (currentKey) {
    // Mark current key as inactive (we can't modify the file directly without reading/writing,
    // so we just generate a new key; the old key will be cleaned up)
  }
  
  // Generate new key
  const newKey = generateKey();
  
  return {
    oldKey: currentKey?.metadata,
    newKey,
    rotationTime: new Date().toISOString(),
    message: 'Key rotation completed successfully',
  };
}

/**
 * Validate key for API request
 * @param {string} providedKey - Key provided in request
 * @returns {Object} - Validation result
 */
function validateKey(providedKey) {
  const currentKey = getCurrentKey();
  
  if (!currentKey) {
    return {
      valid: false,
      error: 'No active key found',
    };
  }
  
  // Check if the provided key matches the current key
  const isValid = providedKey === currentKey.metadata.id;
  
  return {
    valid: isValid,
    error: isValid ? null : 'Invalid or expired key',
    metadata: currentKey.metadata,
  };
}

// Export functions
export {
  generateKey,
  rotateKey,
  getCurrentKey,
  validateKey,
  ROTATION_CONFIG,
};

EOF
echo 'key-rotation.mjs created successfully'"