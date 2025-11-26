/**
 * Utilities for creating and updating Metaplex Token Metadata
 * Note: For production use, consider using @metaplex-foundation/js or external services
 */

import { Connection, PublicKey, Transaction, SystemProgram, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";

// Metaplex Token Metadata Program ID
export const METADATA_PROGRAM_ID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");

/**
 * Derive Metadata PDA for a mint address
 */
export function getMetadataPDA(mintAddress: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("metadata"),
      METADATA_PROGRAM_ID.toBuffer(),
      mintAddress.toBuffer(),
    ],
    METADATA_PROGRAM_ID
  );
}

/**
 * Serialize metadata data according to Metaplex format
 */
function serializeMetadataData(name: string, symbol: string, uri: string): Buffer {
  const nameBuffer = Buffer.from(name, "utf8");
  const symbolBuffer = Buffer.from(symbol, "utf8");
  const uriBuffer = Buffer.from(uri, "utf8");
  
  const dataSize = 4 + nameBuffer.length + 4 + symbolBuffer.length + 4 + uriBuffer.length + 2 + 1 + 4;
  const buffer = Buffer.alloc(dataSize);
  let offset = 0;
  
  buffer.writeUInt32LE(nameBuffer.length, offset);
  offset += 4;
  nameBuffer.copy(buffer, offset);
  offset += nameBuffer.length;
  
  buffer.writeUInt32LE(symbolBuffer.length, offset);
  offset += 4;
  symbolBuffer.copy(buffer, offset);
  offset += symbolBuffer.length;
  
  buffer.writeUInt32LE(uriBuffer.length, offset);
  offset += 4;
  uriBuffer.copy(buffer, offset);
  offset += uriBuffer.length;
  
  buffer.writeUInt16LE(0, offset);
  offset += 2;
  
  buffer.writeUInt8(0, offset);
  offset += 1;
  
  buffer.writeUInt32LE(0, offset);
  
  return buffer;
}

/**
 * Create instruction to create metadata account for existing mint
 * Note: For production, use Metaplex SDK or external services
 */
export async function createCreateMetadataInstruction(
  connection: Connection,
  mintAddress: PublicKey,
  updateAuthority: PublicKey,
  name: string,
  symbol: string,
  uri: string
) {
  const [metadataPDA] = getMetadataPDA(mintAddress);
  const dataBuffer = serializeMetadataData(name, symbol, uri);
  const accountSize = 1 + 32 + 32 + dataBuffer.length;
  const rentExemption = await connection.getMinimumBalanceForRentExemption(accountSize);
  const instructionData = Buffer.alloc(1 + 8 + accountSize);
  instructionData[0] = 33;
  
  throw new Error(
    "Direct metadata creation is complex. Please use external services like:\n" +
    "- HoneyChain: https://docs.honeychain.online/ru/solana/update-token\n" +
    "- CoinFactory: https://coinfactory.app/ru/solana/update-metadata\n" +
    "Or install @metaplex-foundation/js for programmatic creation."
  );
}

/**
 * Create instruction to update existing metadata
 */
export async function createUpdateMetadataInstruction(
  connection: Connection,
  mintAddress: PublicKey,
  updateAuthority: PublicKey,
  name: string,
  symbol: string,
  uri: string
) {
  throw new Error(
    "Direct metadata update is complex. Please use external services or Metaplex SDK."
  );
}

/**
 * Check if metadata already exists for a mint
 */
export async function metadataExists(
  connection: Connection,
  mintAddress: PublicKey
): Promise<boolean> {
  try {
    const [metadataPDA] = getMetadataPDA(mintAddress);
    const accountInfo = await connection.getAccountInfo(metadataPDA);
    return accountInfo !== null;
  } catch (error) {
    return false;
  }
}

