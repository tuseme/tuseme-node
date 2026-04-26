'use strict';

const https = require('https');
const http = require('http');
const { URL } = require('url');

const DEFAULT_BASE_URL = 'https://api.tuseme.co.ke/api/v1';
const DEFAULT_TIMEOUT = 30000;
const MAX_RETRIES = 3;
const RETRY_BACKOFF = 500;

class TusemeError extends Error {
  constructor(message, statusCode = null, response = null) {
    super(message);
    this.name = 'TusemeError';
    this.statusCode = statusCode;
    this.response = response;
  }
}

class AuthenticationError extends TusemeError {
  constructor(message, statusCode, response) {
    super(message, statusCode, response);
    this.name = 'AuthenticationError';
  }
}

class ValidationError extends TusemeError {
  constructor(message, statusCode, response) {
    super(message, statusCode, response);
    this.name = 'ValidationError';
  }
}

class RateLimitError extends TusemeError {
  constructor(message, retryAfter, statusCode, response) {
    super(message, statusCode, response);
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
  }
}

// ── HTTP Client ─────────────────────────────────────────────

class HttpClient {
  constructor({ apiKey, apiSecret, baseUrl, timeout, maxRetries }) {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.baseUrl = (baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.timeout = timeout || DEFAULT_TIMEOUT;
    this.maxRetries = maxRetries ?? MAX_RETRIES;
    this._accessToken = null;
    this._tokenExpiresAt = 0;
  }

  async _authenticate() {
    const body = JSON.stringify({
      api_key: this.apiKey,
      api_secret: this.apiSecret,
    });

    const data = await this._rawRequest('POST', '/auth/login', body, false);

    if (!data.access_token) {
      throw new AuthenticationError(
        'Invalid API credentials. Check your api_key and api_secret.',
        401,
        data,
      );
    }

    this._accessToken = data.access_token;
    this._tokenExpiresAt = Date.now() + (data.expires_in || 3600) * 1000 - 60000;
  }

  async _ensureAuth() {
    if (!this._accessToken || Date.now() >= this._tokenExpiresAt) {
      await this._authenticate();
    }
  }

  async request(method, path, body = null, params = null) {
    await this._ensureAuth();

    let lastError;
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const jsonBody = body ? JSON.stringify(body) : null;
        let url = path;
        if (params) {
          const qs = new URLSearchParams(params).toString();
          url = `${path}?${qs}`;
        }
        return await this._rawRequest(method, url, jsonBody, true);
      } catch (err) {
        lastError = err;
        if (err instanceof RateLimitError || err.statusCode >= 500) {
          if (attempt < this.maxRetries) {
            const wait = err.retryAfter
              ? err.retryAfter * 1000
              : RETRY_BACKOFF * Math.pow(2, attempt - 1);
            await new Promise((r) => setTimeout(r, wait));
            continue;
          }
        }
        if (err instanceof AuthenticationError && attempt === 1) {
          this._accessToken = null;
          await this._ensureAuth();
          continue;
        }
        throw err;
      }
    }
    throw lastError;
  }

  _rawRequest(method, path, body, withAuth) {
    return new Promise((resolve, reject) => {
      const url = new URL(this.baseUrl + path);
      const isHttps = url.protocol === 'https:';
      const lib = isHttps ? https : http;

      const headers = {
        'Content-Type': 'application/json',
        'User-Agent': 'tuseme-node/1.0.0',
      };
      if (withAuth && this._accessToken) {
        headers['Authorization'] = `Bearer ${this._accessToken}`;
      }
      if (body) {
        headers['Content-Length'] = Buffer.byteLength(body);
      }

      const req = lib.request(
        {
          hostname: url.hostname,
          port: url.port,
          path: url.pathname + url.search,
          method,
          headers,
          timeout: this.timeout,
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => {
            let parsed;
            try {
              parsed = JSON.parse(data);
            } catch {
              parsed = { raw: data };
            }

            if (res.statusCode === 429) {
              const retryAfter = parseInt(res.headers['retry-after'] || '5', 10);
              return reject(
                new RateLimitError('Rate limit exceeded', retryAfter, 429, parsed),
              );
            }
            if (res.statusCode === 401) {
              return reject(
                new AuthenticationError(
                  parsed.detail || 'Authentication failed',
                  401,
                  parsed,
                ),
              );
            }
            if (res.statusCode === 400) {
              return reject(
                new ValidationError(
                  `Validation error: ${parsed.detail || JSON.stringify(parsed)}`,
                  400,
                  parsed,
                ),
              );
            }
            if (res.statusCode >= 500) {
              return reject(
                new TusemeError(`Server error: ${res.statusCode}`, res.statusCode, parsed),
              );
            }
            if (res.statusCode >= 400) {
              return reject(
                new TusemeError(`API error: ${res.statusCode}`, res.statusCode, parsed),
              );
            }
            resolve(parsed);
          });
        },
      );

      req.on('error', (err) =>
        reject(new TusemeError(`Network error: ${err.message}`)),
      );
      req.on('timeout', () => {
        req.destroy();
        reject(new TusemeError('Request timed out'));
      });

      if (body) req.write(body);
      req.end();
    });
  }
}

// ── Messages Resource ───────────────────────────────────────

class Messages {
  constructor(http) {
    this._http = http;
  }

  /**
   * Send an SMS to one or more recipients.
   * @param {Object} opts
   * @param {string} opts.content - Message body
   * @param {Array<{msisdn: string, name?: string}>} opts.recipients - Recipients
   * @param {string} [opts.sender_id='TUSEME-LTD'] - Sender ID
   * @param {string} [opts.type='promotional'] - transactional or promotional
   * @param {string} [opts.priority='MEDIUM'] - HIGH, MEDIUM, or LOW
   * @param {Object} [opts.metadata] - Custom key-value pairs
   * @returns {Promise<Object>}
   */
  async send(opts) {
    const payload = {
      content: opts.content,
      sender_id: opts.sender_id || 'TUSEME-LTD',
      type: opts.type || 'promotional',
      priority: opts.priority || 'MEDIUM',
    };
    if (opts.recipients) payload.recipients = opts.recipients;
    if (opts.group_ids) payload.group_ids = opts.group_ids;
    if (opts.contact_ids) payload.contact_ids = opts.contact_ids;
    if (opts.scheduled_for) {
      payload.scheduled_for = opts.scheduled_for;
      payload.timezone = opts.timezone || 'Africa/Nairobi';
    }
    if (opts.metadata) payload.metadata = opts.metadata;

    return this._http.request('POST', '/messages/send', payload);
  }

  /**
   * Get delivery status for a message.
   * @param {string} messageId
   * @returns {Promise<Object>}
   */
  async get(messageId) {
    return this._http.request('GET', `/messages/${messageId}`);
  }

  /**
   * List sent messages with pagination.
   * @param {Object} [opts]
   * @param {number} [opts.page=1]
   * @param {number} [opts.page_size=20]
   * @param {string} [opts.status]
   * @param {string} [opts.date_from]
   * @param {string} [opts.date_to]
   * @returns {Promise<Object>}
   */
  async list(opts = {}) {
    const params = {
      page: opts.page || 1,
      page_size: opts.page_size || 20,
    };
    if (opts.status) params.status = opts.status;
    if (opts.date_from) params.date_from = opts.date_from;
    if (opts.date_to) params.date_to = opts.date_to;

    return this._http.request('GET', '/messages', null, params);
  }
}

// ── Main Client ─────────────────────────────────────────────

class TusemeClient {
  /**
   * Create a new Tuseme API client.
   * @param {Object} opts
   * @param {string} opts.apiKey - Your API Key
   * @param {string} opts.apiSecret - Your API Secret
   * @param {string} [opts.baseUrl] - API base URL
   * @param {number} [opts.timeout=30000] - Request timeout in ms
   * @param {number} [opts.maxRetries=3] - Max retry attempts
   */
  constructor(opts) {
    if (!opts.apiKey) throw new Error('apiKey is required');
    if (!opts.apiSecret) throw new Error('apiSecret is required');

    this._http = new HttpClient(opts);
    this.messages = new Messages(this._http);
  }

  get isSandbox() {
    return this._http.apiKey.startsWith('tk_test_');
  }

  get isProduction() {
    return this._http.apiKey.startsWith('tk_live_');
  }
}

module.exports = {
  TusemeClient,
  TusemeError,
  AuthenticationError,
  ValidationError,
  RateLimitError,
};
