/**
 * Secret 生成器模块
 * 
 * 用于生成和格式化 Happy Coder API Secret
 * 
 * 创建时间: 2026-01-13
 */
const crypto = require('crypto');
const CryptoUtils = require('./CryptoUtils');

// Base32 字母表 (RFC 4648) - 排除容易混淆的字符
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * 字节转 Base32
 * @param {Buffer|Uint8Array} bytes - 字节数组
 * @returns {string} Base32 编码字符串
 */
function bytesToBase32(bytes) {
  let result = '';
  let buffer = 0;
  let bufferLength = 0;

  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bufferLength += 8;

    while (bufferLength >= 5) {
      bufferLength -= 5;
      result += BASE32_ALPHABET[(buffer >> bufferLength) & 0x1f];
    }
  }

  // 处理剩余的位
  if (bufferLength > 0) {
    result += BASE32_ALPHABET[(buffer << (5 - bufferLength)) & 0x1f];
  }

  return result;
}

/**
 * 生成新的 Secret
 * @returns {Buffer} 32 字节的安全随机数
 */
function generateSecret() {
  return crypto.randomBytes(32);
}

/**
 * 格式化 Secret 为用户可读的备份格式
 * @param {Buffer|Uint8Array} secretBytes - 32 字节的 Secret
 * @returns {string} 格式化的字符串 (XXXXX-XXXXX-XXXXX-...)
 */
function formatSecretForBackup(secretBytes) {
  if (secretBytes.length !== 32) {
    throw new Error(`Invalid secret length: expected 32 bytes, got ${secretBytes.length}`);
  }

  // 转换为 Base32
  const base32 = bytesToBase32(secretBytes);

  // 分割为 5 个字符一组
  const groups = [];
  for (let i = 0; i < base32.length; i += 5) {
    groups.push(base32.slice(i, i + 5));
  }

  // 用连字符连接
  return groups.join('-');
}

/**
 * 将 Secret 转换为 Base64URL 格式（用于存储和 API 调用）
 * @param {Buffer|Uint8Array} secretBytes - 32 字节的 Secret
 * @returns {string} Base64URL 编码字符串
 */
function secretToBase64Url(secretBytes) {
  return CryptoUtils.encodeBase64(Buffer.from(secretBytes), 'base64url');
}

/**
 * 从 Base64URL 恢复 Secret 字节
 * @param {string} base64url - Base64URL 编码字符串
 * @returns {Buffer} Secret 字节
 */
function base64UrlToSecret(base64url) {
  return Buffer.from(CryptoUtils.decodeBase64(base64url, 'base64url'));
}

/**
 * 生成新 Secret 并返回所有格式
 * @returns {{raw: Buffer, base64url: string, formatted: string}} 各种格式的 Secret
 */
function generateSecretWithFormats() {
  const raw = generateSecret();
  return {
    raw,
    base64url: secretToBase64Url(raw),
    formatted: formatSecretForBackup(raw)
  };
}

/**
 * 验证 Secret 格式是否有效
 * @param {string} input - 用户输入的 Secret（任意格式）
 * @returns {{valid: boolean, normalized: string|null, error: string|null}}
 */
function validateSecretFormat(input) {
  if (!input || typeof input !== 'string') {
    return { valid: false, normalized: null, error: '请输入 Secret' };
  }

  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return { valid: false, normalized: null, error: '请输入 Secret' };
  }

  try {
    const KeyUtils = require('./KeyUtils');
    const normalized = KeyUtils.normalizeSecretKey(trimmed);
    
    // 验证标准化后的长度
    const bytes = CryptoUtils.decodeBase64(normalized, 'base64url');
    if (bytes.length !== 32) {
      return { valid: false, normalized: null, error: 'Secret 长度无效' };
    }

    return { valid: true, normalized, error: null };
  } catch (error) {
    return { valid: false, normalized: null, error: error.message || 'Secret 格式无效' };
  }
}

module.exports = {
  generateSecret,
  formatSecretForBackup,
  secretToBase64Url,
  base64UrlToSecret,
  generateSecretWithFormats,
  validateSecretFormat,
  bytesToBase32
};
