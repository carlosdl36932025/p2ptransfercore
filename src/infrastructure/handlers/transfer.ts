import { APIGatewayProxyHandler } from "aws-lambda";
import { DynamoTransactionRepository } from "../adapters/DynamoTransactionRepository";
import { MakeTransferUseCase } from "../../core/use-cases/MakeTransferUseCase";
import { parseTransferRequestBody } from "../http/parsers/parseTransferRequestBody";
import { CognitoAuthorizer } from "../http/auth/CognitoAuthorizer";

const repository = new DynamoTransactionRepository();
const useCase = new MakeTransferUseCase(repository);

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const senderId =
      (event.requestContext.authorizer as CognitoAuthorizer)?.claims?.sub;

    if (!senderId) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: "Unauthorized" }),
      };
    }

    const parseResult = parseTransferRequestBody(event.body);
    if (!parseResult.success) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: parseResult.error }),
      };
    }

    const result = await useCase.execute({
      senderId,
      recipientId: parseResult.data.recipient_id,
      amount: parseResult.data.amount,
      currency: parseResult.data.currency,
      idempotencyKey: parseResult.data.idempotency_key,
    });

    return {
      statusCode: 200,
      body: JSON.stringify(result),
    };

  } catch (error: unknown) {
    console.error("Transfer Handler Error:", error);

    let statusCode = 500;
    let message = "Internal Server Error";

    if (error instanceof Error) {
      message = error.message;
      if (message === "Insufficient Funds") statusCode = 400;
      else if (message === "Recipient Not Found") statusCode = 404;
      else if (message === "Idempotency Conflict") statusCode = 409;
    }

    return {
      statusCode,
      body: JSON.stringify({ error: message }),
    };
  }
};
