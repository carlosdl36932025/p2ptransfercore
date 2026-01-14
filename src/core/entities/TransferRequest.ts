export interface TransferRequest {
  senderId: string;
  recipientId: string;
  amount: number; // Centavos
  currency: string;
  idempotencyKey: string;
}

export interface TransferResult {
  txId: string;
  status: string;
}