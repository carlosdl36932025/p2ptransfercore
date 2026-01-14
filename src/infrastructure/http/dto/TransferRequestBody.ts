export type TransferRequestBody = {
  recipient_id: string;
  amount: number;
  currency: string;
  idempotency_key: string;
};