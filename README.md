# Tuseme Node.js SDK

Official Node.js client for the [Tuseme SMS API](https://docs.tuseme.co.ke).

[![npm version](https://badge.fury.io/js/tuseme-sdk.svg)](https://www.npmjs.com/package/tuseme-sdk)
[![Node 14+](https://img.shields.io/badge/node-14+-green.svg)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

## Installation

```bash
npm install tuseme-sdk
```

## Quick Start

```javascript
const { TusemeClient } = require('tuseme-sdk');

const client = new TusemeClient({
  apiKey: 'tk_test_your_api_key',
  apiSecret: 'sk_test_your_api_secret',
});

// Send an SMS
const response = await client.messages.send({
  content: 'Hello from Tuseme! Your OTP is 482910.',
  sender_id: 'TUSEME-LTD',
  recipients: [{ msisdn: '+254712345678', name: 'John Doe' }],
  type: 'transactional',
  priority: 'HIGH',
});

console.log('Message ID:', response.message_id);
```

## Features

- **Zero dependencies** — uses built-in `http`/`https` modules
- **TypeScript definitions** included
- **Automatic authentication** — tokens are obtained and refreshed automatically
- **Built-in retries** — exponential backoff for transient failures
- **Node.js 14+** compatible

## Usage

### Send SMS

```javascript
// Single recipient
const response = await client.messages.send({
  content: 'Your verification code is 123456',
  sender_id: 'TUSEME-LTD',
  recipients: [{ msisdn: '+254712345678' }],
  type: 'transactional',
});

// Multiple recipients with metadata
const response = await client.messages.send({
  content: 'Flash sale! 50% off today only.',
  sender_id: 'TUSEME-LTD',
  recipients: [
    { msisdn: '+254712345678', name: 'Alice' },
    { msisdn: '+254798765432', name: 'Bob' },
  ],
  type: 'promotional',
  metadata: { campaign: 'flash_sale_q2' },
});
```

### Check Delivery Status

```javascript
const status = await client.messages.get('msg_a1b2c3d4...');
console.log(status.status); // "delivered"
```

### List Messages

```javascript
const result = await client.messages.list({ page: 1, page_size: 20 });
result.data.forEach((msg) => console.log(msg.recipient, msg.status));
```

## Error Handling

```javascript
const { TusemeClient, AuthenticationError, ValidationError } = require('tuseme-sdk');

try {
  await client.messages.send({ content: 'Hello!', recipients: [...] });
} catch (err) {
  if (err instanceof AuthenticationError) {
    console.error('Invalid credentials');
  } else if (err instanceof ValidationError) {
    console.error('Bad request:', err.message);
  }
}
```

## License

MIT — see [LICENSE](LICENSE).
