import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { 
  DynamoDBDocumentClient, 
  TransactWriteCommand, 
  GetCommand 
} from "@aws-sdk/lib-dynamodb";
import { v4 as uuidv4 } from 'uuid';
import { ITransactionRepository } from "../../core/repositories/ITransactionRepository";
import { TransferRequest, TransferResult } from "../../core/entities/TransferRequest";

export class DynamoTransactionRepository implements ITransactionRepository {
  private docClient: DynamoDBDocumentClient;
  private tableName: string;

  constructor() {
    const client = new DynamoDBClient({});
    this.docClient = DynamoDBDocumentClient.from(client);
    this.tableName = process.env.TABLE_NAME || "P2PWalletCore";
  }

  async getByIdempotency(key: string): Promise<TransferResult | null> {
    const response = await this.docClient.send(new GetCommand({
      TableName: this.tableName,
      Key: { PK: `IDEM#${key}`, SK: 'META' }
    }));

    if (!response.Item) return null;
    return { txId: response.Item.txId, status: "COMPLETED_PREVIOUSLY" };
  }

  async executeAtomicTransfer(req: TransferRequest): Promise<TransferResult> {
    const txId = uuidv4();
    const timestamp = new Date().toISOString();
    const ttl = Math.floor(Date.now() / 1000) + 86400;

    const params = {
      TransactItems: [
        {
          Put: {
            TableName: this.tableName,
            Item: {
              PK: `IDEM#${req.idempotencyKey}`, SK: 'META',
              txId: txId, senderId: req.senderId, ttl: ttl
            },
            ConditionExpression: "attribute_not_exists(PK)"
          }
        },
        {
          Update: {
            TableName: this.tableName,
            Key: { PK: `USER#${req.senderId}`, SK: 'PROFILE' },
            UpdateExpression: "SET balance = balance - :amount, updated_at = :ts",
            ConditionExpression: "balance >= :amount AND currency = :curr",
            ExpressionAttributeValues: { ":amount": req.amount, ":curr": req.currency, ":ts": timestamp }
          }
        },
        {
          Update: {
            TableName: this.tableName,
            Key: { PK: `USER#${req.recipientId}`, SK: 'PROFILE' },
            UpdateExpression: "SET balance = balance + :amount, updated_at = :ts",
            ConditionExpression: "attribute_exists(PK)",
            ExpressionAttributeValues: { ":amount": req.amount, ":ts": timestamp }
          }
        },
        {
          Put: {
            TableName: this.tableName,
            Item: {
              PK: `USER#${req.senderId}`, SK: `TX#${timestamp}#${txId}`,
              type: 'SENT', amount: -req.amount, currency: req.currency,
              counterparty: req.recipientId, txId: txId
            }
          }
        },
        {
          Put: {
            TableName: this.tableName,
            Item: {
              PK: `USER#${req.recipientId}`, SK: `TX#${timestamp}#${txId}`,
              type: 'RECEIVED', amount: req.amount, currency: req.currency,
              counterparty: req.senderId, txId: txId
            }
          }
        }
      ]
    };

    try {
      await this.docClient.send(new TransactWriteCommand(params));
      return { txId, status: "COMPLETED" };
    } catch (error: any) {
      if (error.name === 'TransactionCanceledException') {
        const reasons = error.CancellationReasons;
        if (reasons[0].Code === 'ConditionalCheckFailed') throw new Error("Idempotency Conflict");
        if (reasons[1].Code === 'ConditionalCheckFailed') throw new Error("Insufficient Funds");
        if (reasons[2].Code === 'ConditionalCheckFailed') throw new Error("Recipient Not Found");
      }
      throw error;
    }
  }
}