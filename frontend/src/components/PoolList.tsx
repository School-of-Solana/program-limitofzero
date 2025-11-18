"use client";

import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { useEffect, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { getProgram, getAllPools, AmmPool } from "@/lib/program";
import { getAccount, getMint } from "@solana/spl-token";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { getAuthorityPda, getAmmPda } from "@/lib/program";

export default function PoolList() {
  const { publicKey, signTransaction, signAllTransactions } = useWallet();
  const { connection } = useConnection();
  const [pools, setPools] = useState<(AmmPool & { reserveA: string; reserveB: string; fee: number })[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPools = async () => {
    if (!publicKey || !signTransaction) {
      setLoading(false);
      return;
    }

    try {
      const program = getProgram(connection, { publicKey, signTransaction, signAllTransactions } as any);
      const allPools = await getAllPools(program);
      
      const poolsWithReserves = await Promise.all(
        allPools.map(async (pool) => {
          try {
            // Get AMM to fetch fee
            const accountNamespace = program.account as unknown as {
              amm: {
                fetch: (address: PublicKey) => Promise<{ fee: number }>;
              };
            };
            const ammData = await accountNamespace.amm.fetch(pool.amm);
            const fee = ammData.fee;

            // Get authority PDA
            const authorityPda = await getAuthorityPda(pool.amm, pool.mintA, pool.mintB);
            
            // Get pool token accounts
            const poolAccountA = getAssociatedTokenAddressSync(pool.mintA, authorityPda, true);
            const poolAccountB = getAssociatedTokenAddressSync(pool.mintB, authorityPda, true);

            // Get reserves
            const accountA = await getAccount(connection, poolAccountA);
            const accountB = await getAccount(connection, poolAccountB);
            
            // Get mint decimals
            const mintA = await getMint(connection, pool.mintA);
            const mintB = await getMint(connection, pool.mintB);

            const reserveA = (Number(accountA.amount) / Math.pow(10, mintA.decimals)).toFixed(6);
            const reserveB = (Number(accountB.amount) / Math.pow(10, mintB.decimals)).toFixed(6);

            return {
              ...pool,
              reserveA,
              reserveB,
              fee,
            };
          } catch (error) {
            console.error("Error fetching pool reserves:", error);
            return {
              ...pool,
              reserveA: "N/A",
              reserveB: "N/A",
              fee: 0,
            };
          }
        })
      );

      setPools(poolsWithReserves);
    } catch (error) {
      console.error("Error fetching pools:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPools();
    const interval = setInterval(fetchPools, 10000); // Refresh every 10 seconds
    return () => clearInterval(interval);
  }, [publicKey, connection]);

  if (loading) {
    return (
      <div className="bg-gray-50 p-6 rounded-lg">
        <h2 className="text-2xl font-bold mb-4">All Pools</h2>
        <p className="text-gray-600">Loading pools...</p>
      </div>
    );
  }

  return (
    <div className="bg-gray-50 p-6 rounded-lg">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold">All Pools</h2>
        <button
          onClick={fetchPools}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          Refresh
        </button>
      </div>
      {pools.length === 0 ? (
        <p className="text-gray-600">No pools found. Create a pool to get started!</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full bg-white rounded-lg shadow">
            <thead className="bg-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  Mint A
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  Mint B
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  Reserve A
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  Reserve B
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  Fee
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {pools.map((pool, index) => (
                <tr key={index} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {pool.mintA.toString().slice(0, 8)}...
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {pool.mintB.toString().slice(0, 8)}...
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {pool.reserveA}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {pool.reserveB}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {(pool.fee / 100).toFixed(2)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

