import * as anchor from "@coral-xyz/anchor";
import {Program} from "@coral-xyz/anchor";
import {Amm} from "../target/types/amm";
import {Keypair, PublicKey, Connection} from "@solana/web3.js";
import {assert} from "chai";
import {
    createAssociatedTokenAccount,
    getAccount,
    getAssociatedTokenAddressSync,
    getMint,
    mintTo
} from "@solana/spl-token";
import {airdrop, createAmm, createMintSafe, createPool, addLiquidity, getPoolReserves, withdrawLiquidity} from "./helper";

describe("swap", () => {
    anchor.setProvider(anchor.AnchorProvider.env());
    let connection: Connection = anchor.getProvider().connection;

    const program = anchor.workspace.amm as Program<Amm>;
    const DECIMALS = new anchor.BN(10).pow(new anchor.BN(9));

    // Helper function to perform swap
    async function performSwap(
        program: Program<Amm>,
        connection: Connection,
        trader: Keypair,
        poolPda: PublicKey,
        mintA: PublicKey,
        mintB: PublicKey,
        ammPda: PublicKey,
        isSwapA: boolean,
        amount: anchor.BN,
        minOutAmount: anchor.BN
    ): Promise<{outputAmount: anchor.BN}> {
        const traderAccountA = getAssociatedTokenAddressSync(mintA, trader.publicKey, false);
        const traderAccountB = getAssociatedTokenAddressSync(mintB, trader.publicKey, false);

        try {
            await createAssociatedTokenAccount(connection, trader, mintA, trader.publicKey);
        } catch (err) {
        }
        try {
            await createAssociatedTokenAccount(connection, trader, mintB, trader.publicKey);
        } catch (err) {
        }

        const [authorityPda] = PublicKey.findProgramAddressSync(
            [
                Buffer.from("AMM_POOL_AUTHORITY"),
                ammPda.toBuffer(),
                mintA.toBuffer(),
                mintB.toBuffer(),
            ],
            program.programId
        );

        const traderOutputBefore = isSwapA 
            ? (await getAccount(connection, traderAccountB)).amount
            : (await getAccount(connection, traderAccountA)).amount;

        await program.methods.swap(isSwapA, amount, minOutAmount).accounts({
            amm: ammPda,
            pool: poolPda,
            trader: trader.publicKey,
            mintA: mintA,
            mintB: mintB,
            payer: trader.publicKey,
        }).signers([trader]).rpc({commitment: "confirmed"});

        const traderOutputAfter = isSwapA 
            ? (await getAccount(connection, traderAccountB)).amount
            : (await getAccount(connection, traderAccountA)).amount;

        const outputAmount = new anchor.BN(traderOutputAfter.toString()).sub(new anchor.BN(traderOutputBefore.toString()));

        return {outputAmount};
    }

    it("Pool A/B with 10% fee: 3 providers, multiple swaps, then withdraw with fee calculation", async () => {
        const provider1 = Keypair.generate();
        const provider2 = Keypair.generate();
        const provider3 = Keypair.generate();
        const trader1 = Keypair.generate();
        const trader2 = Keypair.generate();
        const trader3 = Keypair.generate();
        const trader4 = Keypair.generate();
        const admin = Keypair.generate();
        const mintA = Keypair.generate();
        const mintB = Keypair.generate();
        const ammIndex = 400;
        const fee = 1000; // 10% fee

        await airdrop(connection, provider1.publicKey);
        await airdrop(connection, provider2.publicKey);
        await airdrop(connection, provider3.publicKey);
        await airdrop(connection, trader1.publicKey);
        await airdrop(connection, trader2.publicKey);
        await airdrop(connection, trader3.publicKey);
        await airdrop(connection, trader4.publicKey);
        await airdrop(connection, admin.publicKey);
        await createMintSafe(connection, provider1, provider1.publicKey, 9, mintA);
        await createMintSafe(connection, provider1, provider1.publicKey, 9, mintB);

        const {ammPda} = await createAmm(program, provider1, admin.publicKey, fee, ammIndex);
        const {poolPda, mintLiquidityPda, authorityPda} = await createPool(program, provider1, ammPda, mintA.publicKey, mintB.publicKey);

        // 3 providers add liquidity 1:1
        const liquidityAmount = new anchor.BN(1000).mul(DECIMALS);
        const {lpAmount: lp1} = await addLiquidity(program, connection, provider1, provider1, poolPda, mintA.publicKey, mintB.publicKey, mintLiquidityPda, liquidityAmount, liquidityAmount);
        const {lpAmount: lp2} = await addLiquidity(program, connection, provider2, provider1, poolPda, mintA.publicKey, mintB.publicKey, mintLiquidityPda, liquidityAmount, liquidityAmount);
        const {lpAmount: lp3} = await addLiquidity(program, connection, provider3, provider1, poolPda, mintA.publicKey, mintB.publicKey, mintLiquidityPda, liquidityAmount, liquidityAmount);

        const totalLiquidity = liquidityAmount.mul(new anchor.BN(3));
        const {reserveA: reserveABefore, reserveB: reserveBBefore} = await getPoolReserves(connection, mintA.publicKey, mintB.publicKey, authorityPda);
        assert.isTrue(reserveABefore.eq(totalLiquidity), `Pool A should be ${totalLiquidity.toString()}, got ${reserveABefore.toString()}`);
        assert.isTrue(reserveBBefore.eq(totalLiquidity), `Pool B should be ${totalLiquidity.toString()}, got ${reserveBBefore.toString()}`);

        // Trader1 swaps A to B, buying 1/3 of pool
        const swapAmount1 = totalLiquidity.div(new anchor.BN(3));
        const trader1AccountA = getAssociatedTokenAddressSync(mintA.publicKey, trader1.publicKey, false);
        try {
            await createAssociatedTokenAccount(connection, trader1, mintA.publicKey, trader1.publicKey);
        } catch (err) {
        }
        await mintTo(connection, provider1, mintA.publicKey, trader1AccountA, provider1, swapAmount1.toNumber());
        await performSwap(program, connection, trader1, poolPda, mintA.publicKey, mintB.publicKey, ammPda, true, swapAmount1, new anchor.BN(0));

        // Trader2 swaps B to A, buying 1/3 of pool after trader1
        const {reserveA: reserveAAfter1, reserveB: reserveBAfter1} = await getPoolReserves(connection, mintA.publicKey, mintB.publicKey, authorityPda);
        const swapAmount2 = reserveBAfter1.div(new anchor.BN(3));
        const trader2AccountB = getAssociatedTokenAddressSync(mintB.publicKey, trader2.publicKey, false);
        try {
            await createAssociatedTokenAccount(connection, trader2, mintB.publicKey, trader2.publicKey);
        } catch (err) {
        }
        await mintTo(connection, provider1, mintB.publicKey, trader2AccountB, provider1, swapAmount2.toNumber());
        await performSwap(program, connection, trader2, poolPda, mintA.publicKey, mintB.publicKey, ammPda, false, swapAmount2, new anchor.BN(0));

        // Trader3 swaps A to B, buying half of remaining A
        const {reserveA: reserveAAfter2} = await getPoolReserves(connection, mintA.publicKey, mintB.publicKey, authorityPda);
        const swapAmount3 = reserveAAfter2.div(new anchor.BN(2));
        const trader3AccountA = getAssociatedTokenAddressSync(mintA.publicKey, trader3.publicKey, false);
        try {
            await createAssociatedTokenAccount(connection, trader3, mintA.publicKey, trader3.publicKey);
        } catch (err) {
        }
        await mintTo(connection, provider1, mintA.publicKey, trader3AccountA, provider1, swapAmount3.toNumber());
        await performSwap(program, connection, trader3, poolPda, mintA.publicKey, mintB.publicKey, ammPda, true, swapAmount3, new anchor.BN(0));

        // Trader4 swaps A to B, buying half of remaining A
        const {reserveA: reserveAAfter3} = await getPoolReserves(connection, mintA.publicKey, mintB.publicKey, authorityPda);
        const swapAmount4 = reserveAAfter3.div(new anchor.BN(2));
        const trader4AccountA = getAssociatedTokenAddressSync(mintA.publicKey, trader4.publicKey, false);
        try {
            await createAssociatedTokenAccount(connection, trader4, mintA.publicKey, trader4.publicKey);
        } catch (err) {
        }
        await mintTo(connection, provider1, mintA.publicKey, trader4AccountA, provider1, swapAmount4.toNumber());
        await performSwap(program, connection, trader4, poolPda, mintA.publicKey, mintB.publicKey, ammPda, true, swapAmount4, new anchor.BN(0));

        // Providers withdraw liquidity
        const {reserveA: finalReserveA, reserveB: finalReserveB} = await getPoolReserves(connection, mintA.publicKey, mintB.publicKey, authorityPda);
        const mintLiquidity = await getMint(connection, mintLiquidityPda);
        const totalLp = new anchor.BN(mintLiquidity.supply.toString());

        // Calculate expected amounts for each provider
        const provider1AmountA = lp1.mul(finalReserveA).div(totalLp);
        const provider1AmountB = lp1.mul(finalReserveB).div(totalLp);
        const provider2AmountA = lp2.mul(finalReserveA).div(totalLp);
        const provider2AmountB = lp2.mul(finalReserveB).div(totalLp);
        const provider3AmountA = lp3.mul(finalReserveA).div(totalLp);
        const provider3AmountB = lp3.mul(finalReserveB).div(totalLp);

        // Withdraw
        await withdrawLiquidity(program, connection, provider1, poolPda, mintA.publicKey, mintB.publicKey, mintLiquidityPda, authorityPda, lp1);
        await withdrawLiquidity(program, connection, provider2, poolPda, mintA.publicKey, mintB.publicKey, mintLiquidityPda, authorityPda, lp2);
        await withdrawLiquidity(program, connection, provider3, poolPda, mintA.publicKey, mintB.publicKey, mintLiquidityPda, authorityPda, lp3);

        // Check final balances (with tolerance for rounding)
        const provider1AccountA = getAssociatedTokenAddressSync(mintA.publicKey, provider1.publicKey, false);
        const provider1AccountB = getAssociatedTokenAddressSync(mintB.publicKey, provider1.publicKey, false);
        const provider1BalanceA = new anchor.BN((await getAccount(connection, provider1AccountA)).amount.toString());
        const provider1BalanceB = new anchor.BN((await getAccount(connection, provider1AccountB)).amount.toString());

        // Allow 1% tolerance for rounding
        assert.isTrue(provider1BalanceA.gte(provider1AmountA.mul(new anchor.BN(99)).div(new anchor.BN(100))), 
            `Provider1 should get at least ${provider1AmountA.mul(new anchor.BN(99)).div(new anchor.BN(100)).toString()} A, got ${provider1BalanceA.toString()}`);
        assert.isTrue(provider1BalanceB.gte(provider1AmountB.mul(new anchor.BN(99)).div(new anchor.BN(100))), 
            `Provider1 should get at least ${provider1AmountB.mul(new anchor.BN(99)).div(new anchor.BN(100)).toString()} B, got ${provider1BalanceB.toString()}`);
    });

    it("Pool A/B without fee: 3 providers, multiple swaps, then withdraw", async () => {
        const provider1 = Keypair.generate();
        const provider2 = Keypair.generate();
        const provider3 = Keypair.generate();
        const trader1 = Keypair.generate();
        const trader2 = Keypair.generate();
        const trader3 = Keypair.generate();
        const trader4 = Keypair.generate();
        const admin = Keypair.generate();
        const mintA = Keypair.generate();
        const mintB = Keypair.generate();
        const ammIndex = 401;
        const fee = 0; // No fee

        await airdrop(connection, provider1.publicKey);
        await airdrop(connection, provider2.publicKey);
        await airdrop(connection, provider3.publicKey);
        await airdrop(connection, trader1.publicKey);
        await airdrop(connection, trader2.publicKey);
        await airdrop(connection, trader3.publicKey);
        await airdrop(connection, trader4.publicKey);
        await airdrop(connection, admin.publicKey);
        await createMintSafe(connection, provider1, provider1.publicKey, 9, mintA);
        await createMintSafe(connection, provider1, provider1.publicKey, 9, mintB);

        const {ammPda} = await createAmm(program, provider1, admin.publicKey, fee, ammIndex);
        const {poolPda, mintLiquidityPda, authorityPda} = await createPool(program, provider1, ammPda, mintA.publicKey, mintB.publicKey);

        // 3 providers add liquidity 1:1
        const liquidityAmount = new anchor.BN(1000).mul(DECIMALS);
        await addLiquidity(program, connection, provider1, provider1, poolPda, mintA.publicKey, mintB.publicKey, mintLiquidityPda, liquidityAmount, liquidityAmount);
        await addLiquidity(program, connection, provider2, provider1, poolPda, mintA.publicKey, mintB.publicKey, mintLiquidityPda, liquidityAmount, liquidityAmount);
        await addLiquidity(program, connection, provider3, provider1, poolPda, mintA.publicKey, mintB.publicKey, mintLiquidityPda, liquidityAmount, liquidityAmount);

        const totalLiquidity = liquidityAmount.mul(new anchor.BN(3));

        // Trader1 swaps A to B
        const swapAmount1 = totalLiquidity.div(new anchor.BN(3));
        const trader1AccountA = getAssociatedTokenAddressSync(mintA.publicKey, trader1.publicKey, false);
        try {
            await createAssociatedTokenAccount(connection, trader1, mintA.publicKey, trader1.publicKey);
        } catch (err) {
        }
        await mintTo(connection, provider1, mintA.publicKey, trader1AccountA, provider1, swapAmount1.toNumber());
        await performSwap(program, connection, trader1, poolPda, mintA.publicKey, mintB.publicKey, ammPda, true, swapAmount1, new anchor.BN(0));

        // Trader2 swaps B to A
        const {reserveB: reserveBAfter1} = await getPoolReserves(connection, mintA.publicKey, mintB.publicKey, authorityPda);
        const swapAmount2 = reserveBAfter1.div(new anchor.BN(3));
        const trader2AccountB = getAssociatedTokenAddressSync(mintB.publicKey, trader2.publicKey, false);
        try {
            await createAssociatedTokenAccount(connection, trader2, mintB.publicKey, trader2.publicKey);
        } catch (err) {
        }
        await mintTo(connection, provider1, mintB.publicKey, trader2AccountB, provider1, swapAmount2.toNumber());
        await performSwap(program, connection, trader2, poolPda, mintA.publicKey, mintB.publicKey, ammPda, false, swapAmount2, new anchor.BN(0));

        // Trader3 swaps A to B
        const {reserveA: reserveAAfter2} = await getPoolReserves(connection, mintA.publicKey, mintB.publicKey, authorityPda);
        const swapAmount3 = reserveAAfter2.div(new anchor.BN(2));
        const trader3AccountA = getAssociatedTokenAddressSync(mintA.publicKey, trader3.publicKey, false);
        try {
            await createAssociatedTokenAccount(connection, trader3, mintA.publicKey, trader3.publicKey);
        } catch (err) {
        }
        await mintTo(connection, provider1, mintA.publicKey, trader3AccountA, provider1, swapAmount3.toNumber());
        await performSwap(program, connection, trader3, poolPda, mintA.publicKey, mintB.publicKey, ammPda, true, swapAmount3, new anchor.BN(0));

        // Trader4 swaps A to B
        const {reserveA: reserveAAfter3} = await getPoolReserves(connection, mintA.publicKey, mintB.publicKey, authorityPda);
        const swapAmount4 = reserveAAfter3.div(new anchor.BN(2));
        const trader4AccountA = getAssociatedTokenAddressSync(mintA.publicKey, trader4.publicKey, false);
        try {
            await createAssociatedTokenAccount(connection, trader4, mintA.publicKey, trader4.publicKey);
        } catch (err) {
        }
        await mintTo(connection, provider1, mintA.publicKey, trader4AccountA, provider1, swapAmount4.toNumber());
        await performSwap(program, connection, trader4, poolPda, mintA.publicKey, mintB.publicKey, ammPda, true, swapAmount4, new anchor.BN(0));

        // Providers withdraw - check that pool is empty after all withdrawals
        const mintLiquidity = await getMint(connection, mintLiquidityPda);
        const totalLp = new anchor.BN(mintLiquidity.supply.toString());
        const lpPerProvider = totalLp.div(new anchor.BN(3));

        await withdrawLiquidity(program, connection, provider1, poolPda, mintA.publicKey, mintB.publicKey, mintLiquidityPda, authorityPda, lpPerProvider);
        await withdrawLiquidity(program, connection, provider2, poolPda, mintA.publicKey, mintB.publicKey, mintLiquidityPda, authorityPda, lpPerProvider);
        await withdrawLiquidity(program, connection, provider3, poolPda, mintA.publicKey, mintB.publicKey, mintLiquidityPda, authorityPda, lpPerProvider);

        const {reserveA: finalReserveA, reserveB: finalReserveB} = await getPoolReserves(connection, mintA.publicKey, mintB.publicKey, authorityPda);
        assert.isTrue(finalReserveA.eq(new anchor.BN(0)), `Pool A should be empty, got ${finalReserveA.toString()}`);
        assert.isTrue(finalReserveB.eq(new anchor.BN(0)), `Pool B should be empty, got ${finalReserveB.toString()}`);
    });

    it("Pool A/B with 5% fee: error cases (zero amount, insufficient balance, min_out too high)", async () => {
        const provider = Keypair.generate();
        const trader1 = Keypair.generate();
        const trader2 = Keypair.generate();
        const trader3 = Keypair.generate();
        const admin = Keypair.generate();
        const mintA = Keypair.generate();
        const mintB = Keypair.generate();
        const ammIndex = 402;
        const fee = 500; // 5% fee

        await airdrop(connection, provider.publicKey);
        await airdrop(connection, trader1.publicKey);
        await airdrop(connection, trader2.publicKey);
        await airdrop(connection, trader3.publicKey);
        await airdrop(connection, admin.publicKey);
        await createMintSafe(connection, provider, provider.publicKey, 9, mintA);
        await createMintSafe(connection, provider, provider.publicKey, 9, mintB);

        const {ammPda} = await createAmm(program, provider, admin.publicKey, fee, ammIndex);
        const {poolPda, mintLiquidityPda} = await createPool(program, provider, ammPda, mintA.publicKey, mintB.publicKey);

        // Add initial liquidity
        const liquidityAmount = new anchor.BN(1000).mul(DECIMALS);
        await addLiquidity(program, connection, provider, provider, poolPda, mintA.publicKey, mintB.publicKey, mintLiquidityPda, liquidityAmount, liquidityAmount);

        // Trader1 tries to swap 0
        try {
            await performSwap(program, connection, trader1, poolPda, mintA.publicKey, mintB.publicKey, ammPda, true, new anchor.BN(0), new anchor.BN(0));
            assert.fail("Expected transaction to fail");
        } catch (err) {
            const errorString = err.toString();
            assert.isTrue(errorString.includes("AmountIsZero") || errorString.includes("6001"), 
                `Expected AmountIsZero error, got: ${errorString}`);
        }

        // Trader2 tries to swap more than they have
        const trader2AccountA = getAssociatedTokenAddressSync(mintA.publicKey, trader2.publicKey, false);
        try {
            await createAssociatedTokenAccount(connection, trader2, mintA.publicKey, trader2.publicKey);
        } catch (err) {
        }
        const insufficientAmount = new anchor.BN(10000).mul(DECIMALS);
        try {
            await performSwap(program, connection, trader2, poolPda, mintA.publicKey, mintB.publicKey, ammPda, true, insufficientAmount, new anchor.BN(0));
            assert.fail("Expected transaction to fail");
        } catch (err) {
            const errorString = err.toString();
            assert.isTrue(errorString.includes("InsufficientBalance") || errorString.includes("6003"), 
                `Expected InsufficientBalance error, got: ${errorString}`);
        }

        // Trader3 tries to swap with min_out too high
        const trader3AccountA = getAssociatedTokenAddressSync(mintA.publicKey, trader3.publicKey, false);
        try {
            await createAssociatedTokenAccount(connection, trader3, mintA.publicKey, trader3.publicKey);
        } catch (err) {
        }
        const swapAmount = new anchor.BN(100).mul(DECIMALS);
        await mintTo(connection, provider, mintA.publicKey, trader3AccountA, provider, swapAmount.toNumber());
        const tooHighMinOut = new anchor.BN(1000000).mul(DECIMALS);
        try {
            await performSwap(program, connection, trader3, poolPda, mintA.publicKey, mintB.publicKey, ammPda, true, swapAmount, tooHighMinOut);
            assert.fail("Expected transaction to fail");
        } catch (err) {
            const errorString = err.toString();
            assert.isTrue(errorString.includes("OutputAmountTooLow") || errorString.includes("6007"), 
                `Expected OutputAmountTooLow error, got: ${errorString}`);
        }
    });

    it("Empty pool: user tries to swap - should error", async () => {
        const trader = Keypair.generate();
        const admin = Keypair.generate();
        const mintA = Keypair.generate();
        const mintB = Keypair.generate();
        const ammIndex = 403;
        const fee = 100;

        await airdrop(connection, trader.publicKey);
        await airdrop(connection, admin.publicKey);
        await createMintSafe(connection, trader, trader.publicKey, 9, mintA);
        await createMintSafe(connection, trader, trader.publicKey, 9, mintB);

        const {ammPda} = await createAmm(program, trader, admin.publicKey, fee, ammIndex);
        const {poolPda} = await createPool(program, trader, ammPda, mintA.publicKey, mintB.publicKey);

        // Try to swap A to B
        const traderAccountA = getAssociatedTokenAddressSync(mintA.publicKey, trader.publicKey, false);
        try {
            await createAssociatedTokenAccount(connection, trader, mintA.publicKey, trader.publicKey);
        } catch (err) {
        }
        const swapAmount = new anchor.BN(100).mul(DECIMALS);
        await mintTo(connection, trader, mintA.publicKey, traderAccountA, trader, swapAmount.toNumber());

        try {
            await performSwap(program, connection, trader, poolPda, mintA.publicKey, mintB.publicKey, ammPda, true, swapAmount, new anchor.BN(0));
            assert.fail("Expected transaction to fail");
        } catch (err) {
            const errorString = err.toString();
            assert.isTrue(errorString.includes("EmptyPool") || errorString.includes("6008"), 
                `Expected EmptyPool error, got: ${errorString}`);
        }

        // Try to swap B to A
        const traderAccountB = getAssociatedTokenAddressSync(mintB.publicKey, trader.publicKey, false);
        try {
            await createAssociatedTokenAccount(connection, trader, mintB.publicKey, trader.publicKey);
        } catch (err) {
        }
        await mintTo(connection, trader, mintB.publicKey, traderAccountB, trader, swapAmount.toNumber());

        try {
            await performSwap(program, connection, trader, poolPda, mintA.publicKey, mintB.publicKey, ammPda, false, swapAmount, new anchor.BN(0));
            assert.fail("Expected transaction to fail");
        } catch (err) {
            const errorString = err.toString();
            assert.isTrue(errorString.includes("EmptyPool") || errorString.includes("6008"), 
                `Expected EmptyPool error, got: ${errorString}`);
        }
    });
});

