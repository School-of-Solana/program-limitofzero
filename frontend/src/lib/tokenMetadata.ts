/**
 * Token metadata utilities for Solana tokens
 * Uses Metaplex Token Metadata Program (for dev tokens) and Jupiter Token List API (for popular tokens)
 */

import { Connection, PublicKey } from "@solana/web3.js";

export interface TokenMetadata {
  address: string;
  name?: string;
  symbol?: string;
  logoURI?: string;
  decimals?: number;
}

// Cache for token metadata
const metadataCache = new Map<string, TokenMetadata>();

// Metaplex Token Metadata Program ID
const METADATA_PROGRAM_ID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");

/**
 * Derive Metaplex Metadata PDA for a mint address
 */
function getMetadataPDA(mintAddress: string): PublicKey {
  const mintPubkey = new PublicKey(mintAddress);
  const [metadataPDA] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("metadata"),
      METADATA_PROGRAM_ID.toBuffer(),
      mintPubkey.toBuffer(),
    ],
    METADATA_PROGRAM_ID
  );
  return metadataPDA;
}

/**
 * Get token metadata from Metaplex Token Metadata Program
 * This works for dev tokens that have metadata created via Metaplex
 */
export async function getTokenMetadataFromMetaplex(
  connection: Connection,
  mintAddress: string
): Promise<TokenMetadata | null> {
  try {
    const metadataPDA = getMetadataPDA(mintAddress);
    const accountInfo = await connection.getAccountInfo(metadataPDA);

    if (!accountInfo) {
      return null;
    }

    // Parse Metaplex metadata account
    // Metaplex metadata structure (simplified):
    // - offset 0: key (1 byte)
    // - offset 1: update_authority (32 bytes)
    // - offset 33: mint (32 bytes)
    // - offset 65: data (name, symbol, uri, etc.)
    
    const data = accountInfo.data;
    
    // Skip key (1 byte) and update_authority (32 bytes) and mint (32 bytes)
    let offset = 65;
    
    // Read data struct
    // - name length (4 bytes) + name (string)
    // - symbol length (4 bytes) + symbol (string)
    // - uri length (4 bytes) + uri (string)
    
    // Read name
    const nameLength = data.readUInt32LE(offset);
    offset += 4;
    const name = data.slice(offset, offset + nameLength).toString("utf8").replace(/\0/g, "");
    offset += nameLength;
    
    // Read symbol
    const symbolLength = data.readUInt32LE(offset);
    offset += 4;
    const symbol = data.slice(offset, offset + symbolLength).toString("utf8").replace(/\0/g, "");
    offset += symbolLength;
    
    // Read URI (logo URI)
    const uriLength = data.readUInt32LE(offset);
    offset += 4;
    const uri = data.slice(offset, offset + uriLength).toString("utf8").replace(/\0/g, "");
    
    // Try to get image from URI (usually IPFS or Arweave)
    let logoURI = uri;
    if (uri && uri.startsWith("ipfs://")) {
      logoURI = `https://ipfs.io/ipfs/${uri.replace("ipfs://", "")}`;
    } else if (uri && uri.startsWith("https://")) {
      logoURI = uri;
    }
    
    const metadata: TokenMetadata = {
      address: mintAddress,
      name: name || undefined,
      symbol: symbol || undefined,
      logoURI: logoURI || undefined,
    };

    // Cache the result
    metadataCache.set(mintAddress, metadata);
    return metadata;
  } catch (error) {
    console.error("Error fetching token metadata from Metaplex:", error);
    return null;
  }
}

/**
 * Get token metadata from Jupiter Token List API
 * This is for popular tokens that are in Jupiter's list
 */
export async function getTokenMetadataFromJupiter(
  mintAddress: string
): Promise<TokenMetadata | null> {
  try {
    // Jupiter Token List API
    const response = await fetch(
      `https://token.jup.ag/strict/${mintAddress}`
    );

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    
    const metadata: TokenMetadata = {
      address: mintAddress,
      name: data.name,
      symbol: data.symbol,
      logoURI: data.logoURI,
      decimals: data.decimals,
    };

    // Cache the result
    metadataCache.set(mintAddress, metadata);
    return metadata;
  } catch (error) {
    console.error("Error fetching token metadata from Jupiter:", error);
    return null;
  }
}

/**
 * Get token metadata from multiple sources
 * Tries Metaplex first (for dev tokens), then Jupiter (for popular tokens)
 */
export async function getTokenMetadata(
  connection: Connection,
  mintAddress: string
): Promise<TokenMetadata> {
  // Check cache first
  if (metadataCache.has(mintAddress)) {
    return metadataCache.get(mintAddress)!;
  }

  // Default metadata
  const defaultMetadata: TokenMetadata = {
    address: mintAddress,
    name: undefined,
    symbol: undefined,
    logoURI: undefined,
  };

  // Try Metaplex first (for dev tokens that you created)
  const metaplexMetadata = await getTokenMetadataFromMetaplex(connection, mintAddress);
  if (metaplexMetadata && (metaplexMetadata.name || metaplexMetadata.symbol)) {
    return metaplexMetadata;
  }

  // Fallback to Jupiter API (for popular tokens)
  const jupiterMetadata = await getTokenMetadataFromJupiter(mintAddress);
  if (jupiterMetadata) {
    return jupiterMetadata;
  }

  // Cache default metadata to avoid repeated requests
  metadataCache.set(mintAddress, defaultMetadata);
  return defaultMetadata;
}

/**
 * Get metadata for multiple tokens at once
 */
export async function getMultipleTokenMetadata(
  connection: Connection,
  mintAddresses: string[]
): Promise<Map<string, TokenMetadata>> {
  const results = new Map<string, TokenMetadata>();

  // Fetch all in parallel
  const promises = mintAddresses.map(async (address) => {
    const metadata = await getTokenMetadata(connection, address);
    return { address, metadata };
  });

  const fetched = await Promise.all(promises);
  fetched.forEach(({ address, metadata }) => {
    results.set(address, metadata);
  });

  return results;
}

/**
 * Clear metadata cache
 */
export function clearMetadataCache() {
  metadataCache.clear();
}

