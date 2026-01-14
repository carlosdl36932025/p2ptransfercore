import { TransferRequestBody } from "../dto/TransferRequestBody";
import { ParseResult } from "./parseResult";

export function parseTransferRequestBody(
  body: string | null
): ParseResult<TransferRequestBody> {
  if (!body) {
    return { success: false, error: "Request body is required" };
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(body);
  } catch {
    return { success: false, error: "Invalid JSON body" };
  }

  if (typeof parsed !== "object" || parsed === null) {
    return { success: false, error: "Invalid request body format" };
  }

  const data = parsed as Record<string, unknown>;

  if (typeof data.recipient_id !== "string" || data.recipient_id.trim() === "") {
    return { success: false, error: "recipient_id is required" };
  }

  if (
    typeof data.amount !== "number" ||
    !Number.isFinite(data.amount) ||
    data.amount <= 0
  ) {
    return { success: false, error: "amount must be a positive number" };
  }

  if (typeof data.currency !== "string" || data.currency.trim() === "") {
    return { success: false, error: "currency is required" };
  }

  if (
    typeof data.idempotency_key !== "string" ||
    data.idempotency_key.trim() === ""
  ) {
    return { success: false, error: "idempotency_key is required" };
  }

  return {
    success: true,
    data: {
      recipient_id: data.recipient_id.trim(),
      amount: data.amount,
      currency: data.currency.trim(),
      idempotency_key: data.idempotency_key.trim(),
    },
  };
}