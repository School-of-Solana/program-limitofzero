/**
 * Token metadata utilities for Solana tokens
 */

import { Connection, PublicKey } from "@solana/web3.js";

export interface TokenMetadata {
  address: string;
  name?: string;
  symbol?: string;
  logoURI?: string;
  decimals?: number;
}

const metadataCache = new Map<string, TokenMetadata>();
const METADATA_PROGRAM_ID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");

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

    const data = accountInfo.data;
    let offset = 65;
    
    const nameLength = data.readUInt32LE(offset);
    offset += 4;
    const name = data.slice(offset, offset + nameLength).toString("utf8").replace(/\0/g, "");
    offset += nameLength;
    
    const symbolLength = data.readUInt32LE(offset);
    offset += 4;
    const symbol = data.slice(offset, offset + symbolLength).toString("utf8").replace(/\0/g, "");
    offset += symbolLength;
    
    const uriLength = data.readUInt32LE(offset);
    offset += 4;
    const uri = data.slice(offset, offset + uriLength).toString("utf8").replace(/\0/g, "");
    
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

    metadataCache.set(mintAddress, metadata);
    return metadata;
  } catch (error) {
    console.error("Error fetching token metadata from Metaplex:", error);
    return null;
  }
}

export async function getTokenMetadataFromJupiter(
  mintAddress: string
): Promise<TokenMetadata | null> {
  try {
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

    metadataCache.set(mintAddress, metadata);
    return metadata;
  } catch (error) {
    console.error("Error fetching token metadata from Jupiter:", error);
    return null;
  }
}

export async function getTokenMetadata(
  connection: Connection,
  mintAddress: string
): Promise<TokenMetadata> {
  if (metadataCache.has(mintAddress)) {
    return metadataCache.get(mintAddress)!;
  }

  const defaultMetadata: TokenMetadata = {
    address: mintAddress,
    name: undefined,
    symbol: undefined,
    logoURI: undefined,
  };

  const metaplexMetadata = await getTokenMetadataFromMetaplex(connection, mintAddress);
  if (metaplexMetadata && (metaplexMetadata.name || metaplexMetadata.symbol)) {
    return metaplexMetadata;
  }

  const jupiterMetadata = await getTokenMetadataFromJupiter(mintAddress);
  if (jupiterMetadata) {
    return jupiterMetadata;
  }

  metadataCache.set(mintAddress, defaultMetadata);
  return defaultMetadata;
}

export async function getMultipleTokenMetadata(
  connection: Connection,
  mintAddresses: string[]
): Promise<Map<string, TokenMetadata>> {
  const results = new Map<string, TokenMetadata>();
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

export function clearMetadataCache() {
  metadataCache.clear();
}

