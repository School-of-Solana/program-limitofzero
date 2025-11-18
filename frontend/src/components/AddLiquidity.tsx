"use client";

import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { getProgram, getPoolPda, getAmmPda, getAuthorityPda, getMintLiquidityPda } from "@/lib/program";
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { BN } from "@coral-xyz/anchor";
import { SystemProgram } from "@solana/web3.js";

export default function AddLiquidity() {
  const { publicKey, signTransaction, signAllTransactions } = useWallet();
  const { connection } = useConnection();
  const [ammIndex, setAmmIndex] = useState<string>("1");
  const [mintA, setMintA] = useState<string>("");
  const [mintB, setMintB] = useState<string>("");
  const [amountA, setAmountA] = useState<string>("");
  const [amountB, setAmountB] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string>("");

  const handleAddLiquidity = async () => {
    if (!publicKey || !signTransaction) {
      setStatus("Please connect your wallet");
      return;
    }

    if (!mintA || !mintB || !amountA || !amountB) {
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
      const amountABN = new BN(parseFloat(amountA) * Math.pow(10, decimals));
      const amountBBN = new BN(parseFloat(amountB) * Math.pow(10, decimals));

      const authorityPda = await getAuthorityPda(ammPda, mintAPubkey, mintBPubkey);
      const mintLiquidityPda = await getMintLiquidityPda(ammPda, mintAPubkey, mintBPubkey);
      
      const depositorAccountA = getAssociatedTokenAddressSync(mintAPubkey, publicKey, false);
      const depositorAccountB = getAssociatedTokenAddressSync(mintBPubkey, publicKey, false);
      const depositorAccountLiquidity = getAssociatedTokenAddressSync(mintLiquidityPda, publicKey, false);
      const poolAccountA = getAssociatedTokenAddressSync(mintAPubkey, authorityPda, true);
      const poolAccountB = getAssociatedTokenAddressSync(mintBPubkey, authorityPda, true);

      const tx = await program.methods
        .addLiquidity(amountABN, amountBBN)
        .accounts({
          pool: poolPda,
          mintA: mintAPubkey,
          mintB: mintBPubkey,
          depositor: publicKey,
          depositorAccountA: depositorAccountA,
          depositorAccountB: depositorAccountB,
          payer: publicKey,
        })
        .rpc();

      setStatus(`Success! Liquidity added. Transaction: ${tx}`);
    } catch (error: any) {
      setStatus(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-gray-50 p-6 rounded-lg">
      <h2 className="text-2xl font-bold mb-4">Add Liquidity</h2>
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
            Amount A
          </label>
          <input
            type="number"
            value={amountA}
            onChange={(e) => setAmountA(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
            placeholder="0.0"
            step="0.000000001"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Amount B
          </label>
          <input
            type="number"
            value={amountB}
            onChange={(e) => setAmountB(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
            placeholder="0.0"
            step="0.000000001"
          />
        </div>
        <button
          onClick={handleAddLiquidity}
          disabled={loading}
          className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "Adding..." : "Add Liquidity"}
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

