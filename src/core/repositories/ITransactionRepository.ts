import { TransferRequest, TransferResult } from "../entities/TransferRequest";

export interface ITransactionRepository {
  getByIdempotency(key: string): Promise<TransferResult | null>;
  executeAtomicTransfer(request: TransferRequest): Promise<TransferResult>;
}