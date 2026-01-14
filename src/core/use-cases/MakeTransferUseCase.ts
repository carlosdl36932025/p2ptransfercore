import { ITransactionRepository } from "../repositories/ITransactionRepository";
import { TransferRequest, TransferResult } from "../entities/TransferRequest";

export class MakeTransferUseCase {
  constructor(private readonly repository: ITransactionRepository) {}

  async execute(request: TransferRequest): Promise<TransferResult> {
    
    if (request.amount <= 0) throw new Error("Amount must be positive");
    if (request.senderId === request.recipientId) throw new Error("Self-transfer forbidden");

    const existingTx = await this.repository.getByIdempotency(request.idempotencyKey);
    if (existingTx) {
      console.log("This idempotency already exists.! Returning previous result.");
      return existingTx;
    }

    return await this.repository.executeAtomicTransfer(request);
  }
}