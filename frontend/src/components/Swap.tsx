"use client";

import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { getProgram, getPoolPda, getAmmPda, getAuthorityPda } from "@/lib/program";
import { BN } from "@coral-xyz/anchor";
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { SystemProgram } from "@solana/web3.js";

export default function Swap() {
  const { publicKey, signTransaction, signAllTransactions } = useWallet();
  const { connection } = useConnection();
  const [ammIndex, setAmmIndex] = useState<string>("1");
  const [mintA, setMintA] = useState<string>("");
  const [mintB, setMintB] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [isSwapA, setIsSwapA] = useState<boolean>(true);
  const [minOut, setMinOut] = useState<string>("0");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string>("");

  const handleSwap = async () => {
    if (!publicKey || !signTransaction) {
      setStatus("Please connect your wallet");
      return;
    }

    if (!mintA || !mintB || !amount) {
      setStatus("Please fill all fields");
      return;
    }

    setLoading(true);
    setStatus("");

    try {
      const program = getProgram(connection, { publicKey, signTransaction, signAllTransactions } as any);
      const ammPda = await getAmmPda(parseInt(ammIndex));
      const mintAPubkey = new PublicKey(mintA);
      const mintBPubkey = new PublicKey(mintB);
      const poolPda = await getPoolPda(ammPda, mintAPubkey, mintBPubkey);

      const decimals = 9; // Assuming 9 decimals
      const amountBN = new BN(parseFloat(amount) * Math.pow(10, decimals));
      const minOutBN = new BN(parseFloat(minOut) * Math.pow(10, decimals));

      const authorityPda = await getAuthorityPda(ammPda, mintAPubkey, mintBPubkey);
      const poolAccountA = getAssociatedTokenAddressSync(mintAPubkey, authorityPda, true);
      const poolAccountB = getAssociatedTokenAddressSync(mintBPubkey, authorityPda, true);
      const traderAccountA = getAssociatedTokenAddressSync(mintAPubkey, publicKey, false);
      const traderAccountB = getAssociatedTokenAddressSync(mintBPubkey, publicKey, false);

      const tx = await program.methods
        .swap(isSwapA, amountBN, minOutBN)
        .accounts({
          amm: ammPda,
          pool: poolPda,
          authority: authorityPda,
          trader: publicKey,
          mintA: mintAPubkey,
          mintB: mintBPubkey,
          poolAccountA: poolAccountA,
          poolAccountB: poolAccountB,
          traderAccountA: traderAccountA,
          traderAccountB: traderAccountB,
          payer: publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      setStatus(`Success! Swap completed. Transaction: ${tx}`);
    } catch (error: any) {
      setStatus(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-gray-50 p-6 rounded-lg">
      <h2 className="text-2xl font-bold mb-4">Swap Tokens</h2>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            AMM Index
          </label>
          <input
            type="number"
            value={ammIndex}
            onChange={(e) => setAmmIndex(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
            placeholder="1"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Mint A Address
          </label>
          <input
            type="text"
            value={mintA}
            onChange={(e) => setMintA(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
            placeholder="Enter mint A public key"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Mint B Address
          </label>
          <input
            type="text"
            value={mintB}
            onChange={(e) => setMintB(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
            placeholder="Enter mint B public key"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Swap Direction
          </label>
          <select
            value={isSwapA ? "A to B" : "B to A"}
            onChange={(e) => setIsSwapA(e.target.value === "A to B")}
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
          >
            <option value="A to B">A to B</option>
            <option value="B to A">B to A</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Amount
          </label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
            placeholder="0.0"
            step="0.000000001"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Minimum Output (optional)
          </label>
          <input
            type="number"
            value={minOut}
            onChange={(e) => setMinOut(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
            placeholder="0.0"
            step="0.000000001"
          />
        </div>
        <button
          onClick={handleSwap}
          disabled={loading}
          className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "Swapping..." : "Swap"}
        </button>
        {status && (
          <div className={`p-3 rounded ${status.includes("Error") ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}>
            {status}
          </div>
        )}
      </div>
    </div>
  );
}

