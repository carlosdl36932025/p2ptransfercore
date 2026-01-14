
# Secure P2P Transfer Core

Transferencia de dinero entre dos usuarios de la Wallet.


## Arquitectura
- **Compute:** AWS Lambda (Node.js 20.x).
- **Database:** Amazon DynamoDB (Single Table Design).
- **Patrón de diseño:** Arquitectura Hexagonal minificada
- **Security:** AWS Cognito 

## Decisiones Técnicas Clave
1. **Manejo de Dinero:** Todos los montos se almacenan como `Integers` (centavos) para evitar errores de punto flotante.
2. **ACID:** Uso estricto de `TransactWriteItems` dentro de TransactWriteCommand . Si falla el crédito al destino, se revierte el débito al origen automáticamente.
3. **Escalabilidad:** Single Table Design permite consultas O(1) para saldos y O(k) para historiales, sin JOINs costosos.


## Parte 1: Modelado de Datos , Esquema de Tabla. : Single Table Design (en AWS como P2PWalletCore)

Entidad perfil de usuario
```
{ 
  "PK": "USER#u123",             
  "SK": "PROFILE",
  "balance": 50000,              // Entero (centavos): $500.00
  "currency": "USD",
  "status": "ACTIVE",            // ACTIVE, LOCKED, SUSPENDED
  "email": "juan@example.com",
  "updated_at": "2023-10-27T10:00:00Z"
}

```

Entidad para el historial de transacciones
```
{ //Entidad transaccion
  "PK": "USER#u123",                         
  "SK": "TX#2023-10-27T10:05:00Z#tx-uuid-99", 
  "amount": -2000,                           // Negativo porque envió dinero
  "currency": "USD",
  "counterparty_id": "u456",                 // A quién se lo envió
  "tx_id": "tx-uuid-99",                     // ID único de la transferencia global
  "type": "SENT",
  "status": "COMPLETED"
}

```

Entidad de idempotencia
```
{ 
  "PK": "IDEM#550e8400-e29b-41d4-a716-446655440000",  // UUID enviado por el cliente (frontend)
  "SK": "META",
  "tx_id": "tx-uuid-99",         // Referencia a la transacción que se creó (si fue exitosa)
  "sender_id": "u123",           // Quién la intentó ejecutar
  "status": "COMPLETED",         // Estado final de ese intento
  "ttl": 1698422400              // EPOCH Timestamp para borrado automático
}
```

Query: "Transacciones del Usuario X en el último mes"
No necesitamos un GSI extra si al modelar la SK correctamente.

Query: PK = USER#X AND SK between TX#2023-10-01 AND TX#2023-11-01.

Esto es extremadamente eficiente y barato (Read Capacity Units).

## Requisitos:
AWS SAM (sam build y sam deploy guided), instalar dependencias de package.json , y npm install -g esbuild 
Para un correcto despliegue editar el archivo template.yaml en la linea UserPoolArn: arn:aws:cognito-idp:REGION:ACCOUNT_ID:userpool/USER_POOL_ID  (reemplazarla por el arn del Cognito de su cuenta)

## Pregunta 1: Autenticación: Asume que usamos Amazon Cognito. ¿Cómo validarías dentro de la Lambda que el usuario que invoca la API es realmente el dueño de la billetera desde la que sale el dinero? (Evitar Insecure Direct Object References - IDOR)

Respuesta: El error número seria confiar en el body para identificar al usuario ({ "sender_id": "yo", ... }).

Solución implementada: Jamás leo el remitente del body. Lo extraigo del contexto de seguridad de AWS Cognito. 

Código: const senderId =
      (event.requestContext.authorizer as CognitoAuthorizer)?.claims?.sub;

event.requestContext es información que inyecta AWS API Gateway después de haber validado criptográficamente el token JWT contra AWS Cognito.

Por qué: Un atacante NO puede modificar esto. Si intenta cambiar un solo caracter del token JWT para poner otro ID, la firma criptográfica se rompe y API Gateway rechaza la petición antes de que el Lambda despierte.


## Pregunta 2: Defensa: Describe brevemente 2 vectores de ataque probables contra este endpoint (ej. Race Conditions, Replay Attacks) y cómo tu código los mitiga.

### Vector A: Race Condition (Double Spending)

Ataque: El usuario envía 10 peticiones simultáneas para transferir todo su saldo a diferentes cuentas antes de que el servidor actualice el saldo.

Mitigación: Uso de DynamoDB TransactWriteItems (este esta dentro de TransactWriteCommand usando el AWS SDK V3) con ConditionExpression.

La base de datos bloquea el ítem durante la escritura.

La condición balance >= :amount se evalúa en el mismo instante de la escritura. Si llegan 10 peticiones, la primera pasa y decrementa el saldo. Las siguientes 9 fallarán con ConditionalCheckFailed porque el saldo ya no es suficiente.

### Vector B: Replay Attacks

Ataque: Un hacker intercepta una petición válida (transferir $100 a Jose) y la reenvía 50 veces para vaciar la cuenta.

Mitigación: Implementación de Idempotency Key.

El cliente genera un UUID único (idempotency_key) por cada intento de operación.

En DynamoDB, creamos un registro IDEM#{key}. Si intentan re-enviar la misma petición, la base de datos detecta que la clave ya existe (o el código la lee primero) y devuelve el resultado exitoso anterior sin volver a ejecutar el movimiento de dinero.
