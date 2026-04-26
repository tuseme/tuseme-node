export interface TusemeClientOptions {
  apiKey: string;
  apiSecret: string;
  baseUrl?: string;
  timeout?: number;
  maxRetries?: number;
}

export interface Recipient {
  msisdn: string;
  name?: string;
}

export interface SendOptions {
  content: string;
  recipients?: Recipient[];
  sender_id?: string;
  type?: 'transactional' | 'promotional';
  priority?: 'HIGH' | 'MEDIUM' | 'LOW';
  scheduled_for?: string;
  timezone?: string;
  metadata?: Record<string, any>;
  group_ids?: string[];
  contact_ids?: string[];
}

export interface SendResponse {
  success: boolean;
  message_id: string;
  batch_id: string;
  status: string;
  message: string;
  estimated_cost?: number;
  currency: string;
  selected_provider?: string;
  recipient_count: number;
  timestamp: string;
}

export interface MessageStatus {
  message_id: string;
  status: string;
  recipient: string;
  sender_id: string;
  content: string;
  provider?: string;
  cost?: number;
  currency: string;
  created_at: string;
  delivered_at?: string;
}

export interface ListOptions {
  page?: number;
  page_size?: number;
  status?: string;
  date_from?: string;
  date_to?: string;
}

export interface ListResponse {
  data: MessageStatus[];
  total: number;
  page: number;
  page_size: number;
}

export declare class Messages {
  send(opts: SendOptions): Promise<SendResponse>;
  get(messageId: string): Promise<MessageStatus>;
  list(opts?: ListOptions): Promise<ListResponse>;
}

export declare class TusemeClient {
  constructor(opts: TusemeClientOptions);
  messages: Messages;
  readonly isSandbox: boolean;
  readonly isProduction: boolean;
}

export declare class TusemeError extends Error {
  statusCode: number | null;
  response: any;
}

export declare class AuthenticationError extends TusemeError {}
export declare class ValidationError extends TusemeError {}
export declare class RateLimitError extends TusemeError {
  retryAfter: number;
}
