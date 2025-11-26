import { Connection, PublicKey } from "@solana/web3.js";
import { getMint, Mint } from "@solana/spl-token";

const mintCache = new Map<string, Mint>();

export async function getCachedMint(
  connection: Connection,
  mintAddress: PublicKey | string
): Promise<Mint> {
  if (!mintAddress) {
    throw new Error("Mint address is required");
  }
  
  const address = typeof mintAddress === "string" ? mintAddress : mintAddress.toString();
  
  if (!address || address === "undefined" || address === "null") {
    throw new Error(`Invalid mint address: ${address}`);
  }
  
  if (mintCache.has(address)) {
    const cached = mintCache.get(address);
    if (cached) {
      return cached;
    }
  }

  try {
    const mint = await getMint(connection, new PublicKey(address));
    mintCache.set(address, mint);
    return mint;
  } catch (error) {
    console.error(`Error fetching mint ${address}:`, error);
    throw error;
  }
}

export function clearMintCache() {
  mintCache.clear();
}

export function removeMintFromCache(address: string | PublicKey) {
  const addr = typeof address === "string" ? address : address.toString();
  mintCache.delete(addr);
}

