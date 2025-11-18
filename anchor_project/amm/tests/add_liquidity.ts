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
import {airdrop, createAmm, createMintSafe, createPool, addLiquidity, getPoolReserves} from "./helper";

describe("add_liquidity", () => {
    anchor.setProvider(anchor.AnchorProvider.env());
    let connection: Connection = anchor.getProvider().connection;

    const program = anchor.workspace.amm as Program<Amm>;
    const DECIMALS = new anchor.BN(10).pow(new anchor.BN(9));

    it("Add liquidity to pool A-B: 100 = 100", async () => {
        const user = Keypair.generate();
        const admin = Keypair.generate();
        const mintA = Keypair.generate();
        const mintB = Keypair.generate();
        const ammIndex = 200;
        const fee = 100;

        await airdrop(connection, user.publicKey);
        await airdrop(connection, admin.publicKey);
        await createMintSafe(connection, user, user.publicKey, 9, mintA);
        await createMintSafe(connection, user, user.publicKey, 9, mintB);

        const {ammPda} = await createAmm(program, user, admin.publicKey, fee, ammIndex);
        const {poolPda, mintLiquidityPda} = await createPool(program, user, ammPda, mintA.publicKey, mintB.publicKey);

        const amountA = new anchor.BN(100).mul(DECIMALS);
        const amountB = new anchor.BN(100).mul(DECIMALS);

        const {lpAmount} = await addLiquidity(
            program, connection, user, user, poolPda, mintA.publicKey, mintB.publicKey, mintLiquidityPda, amountA, amountB
        );

        const product = amountA.mul(amountB);
        const expectedLp = new anchor.BN(Math.floor(Math.sqrt(Number(product))));
        assert.strictEqual(lpAmount.toString(), expectedLp.toString(), `LP amount should be ${expectedLp.toString()} but was ${lpAmount.toString()}`);
    });

    it("Add liquidity to pool C-A: 50 = 100", async () => {
        const user = Keypair.generate();
        const admin = Keypair.generate();
        const mintC = Keypair.generate();
        const mintA = Keypair.generate();
        const ammIndex = 201;
        const fee = 100;

        await airdrop(connection, user.publicKey);
        await airdrop(connection, admin.publicKey);
        await createMintSafe(connection, user, user.publicKey, 9, mintC);
        await createMintSafe(connection, user, user.publicKey, 9, mintA);

        const {ammPda} = await createAmm(program, user, admin.publicKey, fee, ammIndex);
        const {poolPda, mintLiquidityPda} = await createPool(program, user, ammPda, mintC.publicKey, mintA.publicKey);

        const amountC = new anchor.BN(50).mul(DECIMALS);
        const amountA = new anchor.BN(100).mul(DECIMALS);

        const {lpAmount} = await addLiquidity(
            program, connection, user, user, poolPda, mintC.publicKey, mintA.publicKey, mintLiquidityPda, amountC, amountA
        );

        const product = amountC.mul(amountA);
        const expectedLp = new anchor.BN(Math.floor(Math.sqrt(Number(product))));
        assert.strictEqual(lpAmount.toString(), expectedLp.toString(), `LP amount should be ${expectedLp.toString()} but was ${lpAmount.toString()}`);
    });

    it("Second user adds liquidity to pool A-B: checks total_lp, pool balances, and LP transfer", async () => {
        const user1 = Keypair.generate();
        const user2 = Keypair.generate();
        const admin = Keypair.generate();
        const mintA = Keypair.generate();
        const mintB = Keypair.generate();
        const ammIndex = 202;
        const fee = 100;

        await airdrop(connection, user1.publicKey);
        await airdrop(connection, user2.publicKey);
        await airdrop(connection, admin.publicKey);
        await createMintSafe(connection, user1, user1.publicKey, 9, mintA);
        await createMintSafe(connection, user1, user1.publicKey, 9, mintB);

        const {ammPda} = await createAmm(program, user1, admin.publicKey, fee, ammIndex);
        const {poolPda, mintLiquidityPda, authorityPda, poolAccountA, poolAccountB} = await createPool(
            program, user1, ammPda, mintA.publicKey, mintB.publicKey
        );

        const amountA1 = new anchor.BN(100).mul(DECIMALS);
        const amountB1 = new anchor.BN(100).mul(DECIMALS);

        const {lpAmount: lp1} = await addLiquidity(
            program, connection, user1, user1, poolPda, mintA.publicKey, mintB.publicKey, mintLiquidityPda, amountA1, amountB1
        );

        const product1 = amountA1.mul(amountB1);
        const expectedLp1 = new anchor.BN(Math.floor(Math.sqrt(Number(product1))));
        assert.strictEqual(lp1.toString(), expectedLp1.toString(), `First user LP should be ${expectedLp1.toString()} but was ${lp1.toString()}`);

        const {reserveA, reserveB} = await getPoolReserves(connection, mintA.publicKey, mintB.publicKey, authorityPda);
        const mintLiquidityBefore = await getMint(connection, mintLiquidityPda);
        const totalLpBefore = new anchor.BN(mintLiquidityBefore.supply.toString());

        const amountA2 = new anchor.BN(50).mul(DECIMALS);
        const amountB2 = new anchor.BN(50).mul(DECIMALS);

        const {lpAmount: lp2} = await addLiquidity(
            program, connection, user2, user1, poolPda, mintA.publicKey, mintB.publicKey, mintLiquidityPda, amountA2, amountB2
        );

        const {reserveA: reserveAAfter, reserveB: reserveBAfter} = await getPoolReserves(connection, mintA.publicKey, mintB.publicKey, authorityPda);
        const mintLiquidityAfter = await getMint(connection, mintLiquidityPda);

        const lpFromA = amountA2.mul(totalLpBefore).div(reserveA);
        const lpFromB = amountB2.mul(totalLpBefore).div(reserveB);
        const expectedLp2 = lpFromA.lt(lpFromB) ? lpFromA : lpFromB;

        assert.strictEqual(lp2.toString(), expectedLp2.toString(), `Second user LP should be ${expectedLp2.toString()} but was ${lp2.toString()}`);
        assert.strictEqual(mintLiquidityAfter.supply.toString(), totalLpBefore.add(expectedLp2).toString(), `Total LP should be ${totalLpBefore.add(expectedLp2).toString()} but was ${mintLiquidityAfter.supply.toString()}`);
        assert.strictEqual(reserveAAfter.toString(), reserveA.add(amountA2).toString(), `Pool A should be ${reserveA.add(amountA2).toString()} but was ${reserveAAfter.toString()}`);
        assert.strictEqual(reserveBAfter.toString(), reserveB.add(amountB2).toString(), `Pool B should be ${reserveB.add(amountB2).toString()} but was ${reserveBAfter.toString()}`);
    });

    it("Add liquidity using required_a branch (amount_b < required_b, but amount_a >= required_a)", async () => {
        const user = Keypair.generate();
        const admin = Keypair.generate();
        const mintA = Keypair.generate();
        const mintB = Keypair.generate();
        const ammIndex = 203;
        const fee = 100;

        await airdrop(connection, user.publicKey);
        await airdrop(connection, admin.publicKey);
        await createMintSafe(connection, user, user.publicKey, 9, mintA);
        await createMintSafe(connection, user, user.publicKey, 9, mintB);

        const {ammPda} = await createAmm(program, user, admin.publicKey, fee, ammIndex);
        const {poolPda, mintLiquidityPda, authorityPda} = await createPool(program, user, ammPda, mintA.publicKey, mintB.publicKey);

        const initialAmountA = new anchor.BN(100).mul(DECIMALS);
        const initialAmountB = new anchor.BN(100).mul(DECIMALS);

        const {lpAmount: lp1Before} = await addLiquidity(
            program, connection, user, user, poolPda, mintA.publicKey, mintB.publicKey, mintLiquidityPda, initialAmountA, initialAmountB
        );

        const {reserveA, reserveB} = await getPoolReserves(connection, mintA.publicKey, mintB.publicKey, authorityPda);
        const mintLiquidityBefore = await getMint(connection, mintLiquidityPda);
        const totalLpBefore = new anchor.BN(mintLiquidityBefore.supply.toString());

        const amountA2 = new anchor.BN(200).mul(DECIMALS);
        const amountB2 = new anchor.BN(50).mul(DECIMALS);

        const requiredB = amountA2.mul(reserveB).div(reserveA);
        const requiredA = amountB2.mul(reserveA).div(reserveB);

        assert.isTrue(amountB2.lt(requiredB), `amountB2 (${amountB2.toString()}) should be less than requiredB (${requiredB.toString()})`);
        assert.isTrue(amountA2.gte(requiredA), `amountA2 (${amountA2.toString()}) should be >= requiredA (${requiredA.toString()})`);

        const depositorAccountA = getAssociatedTokenAddressSync(mintA.publicKey, user.publicKey, false);
        const depositorAccountB = getAssociatedTokenAddressSync(mintB.publicKey, user.publicKey, false);
        await mintTo(connection, user, mintA.publicKey, depositorAccountA, user, amountA2.toNumber());
        await mintTo(connection, user, mintB.publicKey, depositorAccountB, user, amountB2.toNumber());

        const depositorAccountLiquidityBefore = getAssociatedTokenAddressSync(mintLiquidityPda, user.publicKey, false);
        const lpAccount1Before = await getAccount(connection, depositorAccountLiquidityBefore);

        await program.methods.addLiquidity(amountA2, amountB2).accounts({
            pool: poolPda,
            mintA: mintA.publicKey,
            mintB: mintB.publicKey,
            depositor: user.publicKey,
            depositorAccountA: depositorAccountA,
            depositorAccountB: depositorAccountB,
            payer: user.publicKey,
        }).signers([user]).rpc({commitment: "confirmed"});

        const {reserveA: reserveAAfter, reserveB: reserveBAfter} = await getPoolReserves(connection, mintA.publicKey, mintB.publicKey, authorityPda);
        const mintLiquidityAfter = await getMint(connection, mintLiquidityPda);
        const lpAccount2Total = await getAccount(connection, depositorAccountLiquidityBefore);

        const expectedUsedA = requiredA;
        const expectedUsedB = amountB2;

        const lpFromA2 = expectedUsedA.mul(totalLpBefore).div(reserveA);
        const lpFromB2 = expectedUsedB.mul(totalLpBefore).div(reserveB);
        const expectedLp2 = lpFromA2.lt(lpFromB2) ? lpFromA2 : lpFromB2;

        const lpAccount1BeforeBN = new anchor.BN(lpAccount1Before.amount.toString());
        const lpAccount2TotalBN = new anchor.BN(lpAccount2Total.amount.toString());
        const lpAccount2Added = lpAccount2TotalBN.sub(lpAccount1BeforeBN);

        assert.strictEqual(lpAccount2Added.toString(), expectedLp2.toString(), `LP should be ${expectedLp2.toString()} but was ${lpAccount2Added.toString()}`);
        assert.strictEqual(mintLiquidityAfter.supply.toString(), totalLpBefore.add(expectedLp2).toString(), `Total LP should be ${totalLpBefore.add(expectedLp2).toString()} but was ${mintLiquidityAfter.supply.toString()}`);
        assert.strictEqual(reserveAAfter.toString(), reserveA.add(expectedUsedA).toString(), `Pool A should be ${reserveA.add(expectedUsedA).toString()} but was ${reserveAAfter.toString()}`);
        assert.strictEqual(reserveBAfter.toString(), reserveB.add(expectedUsedB).toString(), `Pool B should be ${reserveB.add(expectedUsedB).toString()} but was ${reserveBAfter.toString()}`);
    });

    it("Cannot add liquidity with amount_a = 0", async () => {
        const user = Keypair.generate();
        const admin = Keypair.generate();
        const mintA = Keypair.generate();
        const mintB = Keypair.generate();
        const ammIndex = 204;
        const fee = 100;

        await airdrop(connection, user.publicKey);
        await airdrop(connection, admin.publicKey);
        await createMintSafe(connection, user, user.publicKey, 9, mintA);
        await createMintSafe(connection, user, user.publicKey, 9, mintB);

        const {ammPda} = await createAmm(program, user, admin.publicKey, fee, ammIndex);
        const {poolPda} = await createPool(program, user, ammPda, mintA.publicKey, mintB.publicKey);

        const depositorAccountA = getAssociatedTokenAddressSync(mintA.publicKey, user.publicKey, false);
        const depositorAccountB = getAssociatedTokenAddressSync(mintB.publicKey, user.publicKey, false);

        try {
            await createAssociatedTokenAccount(connection, user, mintA.publicKey, user.publicKey);
        } catch (err) {
        }
        try {
            await createAssociatedTokenAccount(connection, user, mintB.publicKey, user.publicKey);
        } catch (err) {
        }

        const amountA = new anchor.BN(0);
        const amountB = new anchor.BN(100).mul(DECIMALS);

        await mintTo(connection, user, mintB.publicKey, depositorAccountB, user, amountB.toNumber());

        try {
            await program.methods.addLiquidity(amountA, amountB).accounts({
                pool: poolPda,
                mintA: mintA.publicKey,
                mintB: mintB.publicKey,
                depositor: user.publicKey,
                depositorAccountA: depositorAccountA,
                depositorAccountB: depositorAccountB,
                payer: user.publicKey,
            }).signers([user]).rpc({commitment: "confirmed"});
            assert.fail("Expected transaction to fail");
        } catch (err) {
            const errorString = err.toString();
            assert.isTrue(errorString.includes("AmountIsZero") || errorString.includes("6001"), `Expected AmountIsZero error, got: ${errorString}`);
        }
    });

    it("Cannot add liquidity with amount_b = 0", async () => {
        const user = Keypair.generate();
        const admin = Keypair.generate();
        const mintA = Keypair.generate();
        const mintB = Keypair.generate();
        const ammIndex = 205;
        const fee = 100;

        await airdrop(connection, user.publicKey);
        await airdrop(connection, admin.publicKey);
        await createMintSafe(connection, user, user.publicKey, 9, mintA);
        await createMintSafe(connection, user, user.publicKey, 9, mintB);

        const {ammPda} = await createAmm(program, user, admin.publicKey, fee, ammIndex);
        const {poolPda} = await createPool(program, user, ammPda, mintA.publicKey, mintB.publicKey);

        const depositorAccountA = getAssociatedTokenAddressSync(mintA.publicKey, user.publicKey, false);
        const depositorAccountB = getAssociatedTokenAddressSync(mintB.publicKey, user.publicKey, false);

        try {
            await createAssociatedTokenAccount(connection, user, mintA.publicKey, user.publicKey);
        } catch (err) {
        }
        try {
            await createAssociatedTokenAccount(connection, user, mintB.publicKey, user.publicKey);
        } catch (err) {
        }

        const amountA = new anchor.BN(100).mul(DECIMALS);
        const amountB = new anchor.BN(0);

        await mintTo(connection, user, mintA.publicKey, depositorAccountA, user, amountA.toNumber());

        try {
            await program.methods.addLiquidity(amountA, amountB).accounts({
                pool: poolPda,
                mintA: mintA.publicKey,
                mintB: mintB.publicKey,
                depositor: user.publicKey,
                depositorAccountA: depositorAccountA,
                depositorAccountB: depositorAccountB,
                payer: user.publicKey,
            }).signers([user]).rpc({commitment: "confirmed"});
            assert.fail("Expected transaction to fail");
        } catch (err) {
            const errorString = err.toString();
            assert.isTrue(errorString.includes("AmountIsZero") || errorString.includes("6001"), `Expected AmountIsZero error, got: ${errorString}`);
        }
    });

    it("Cannot add liquidity with insufficient balance in account A", async () => {
        const user = Keypair.generate();
        const admin = Keypair.generate();
        const mintA = Keypair.generate();
        const mintB = Keypair.generate();
        const ammIndex = 206;
        const fee = 100;

        await airdrop(connection, user.publicKey);
        await airdrop(connection, admin.publicKey);
        await createMintSafe(connection, user, user.publicKey, 9, mintA);
        await createMintSafe(connection, user, user.publicKey, 9, mintB);

        const {ammPda} = await createAmm(program, user, admin.publicKey, fee, ammIndex);
        const {poolPda} = await createPool(program, user, ammPda, mintA.publicKey, mintB.publicKey);

        const depositorAccountA = getAssociatedTokenAddressSync(mintA.publicKey, user.publicKey, false);
        const depositorAccountB = getAssociatedTokenAddressSync(mintB.publicKey, user.publicKey, false);

        try {
            await createAssociatedTokenAccount(connection, user, mintA.publicKey, user.publicKey);
        } catch (err) {
        }
        try {
            await createAssociatedTokenAccount(connection, user, mintB.publicKey, user.publicKey);
        } catch (err) {
        }

        let accountABalance = new anchor.BN(0);
        try {
            const accountA = await getAccount(connection, depositorAccountA);
            accountABalance = new anchor.BN(accountA.amount.toString());
        } catch (err) {
        }

        const amountA = accountABalance.add(new anchor.BN(1)).mul(new anchor.BN(100));
        const amountB = new anchor.BN(100).mul(DECIMALS);

        let accountBBalance = new anchor.BN(0);
        try {
            const accountB = await getAccount(connection, depositorAccountB);
            accountBBalance = new anchor.BN(accountB.amount.toString());
        } catch (err) {
        }

        if (accountBBalance.lt(amountB)) {
            await mintTo(connection, user, mintB.publicKey, depositorAccountB, user, amountB.sub(accountBBalance).toNumber());
        }

        const finalAccountA = await getAccount(connection, depositorAccountA);
        const finalBalanceA = new anchor.BN(finalAccountA.amount.toString());
        assert.isTrue(finalBalanceA.lt(amountA), `Account A should have insufficient balance: ${finalBalanceA.toString()} < ${amountA.toString()}`);

        try {
            await program.methods.addLiquidity(amountA, amountB).accounts({
                pool: poolPda,
                mintA: mintA.publicKey,
                mintB: mintB.publicKey,
                depositor: user.publicKey,
                depositorAccountA: depositorAccountA,
                depositorAccountB: depositorAccountB,
                payer: user.publicKey,
            }).signers([user]).rpc({commitment: "confirmed"});
            assert.fail("Expected transaction to fail");
        } catch (err) {
            const errorString = err.toString();
            assert.isTrue(errorString.includes("InsufficientBalance") || errorString.includes("6003"), `Expected InsufficientBalance error, got: ${errorString}`);
        }
    });

    it("Cannot add liquidity with insufficient balance in account B", async () => {
        const user = Keypair.generate();
        const admin = Keypair.generate();
        const mintA = Keypair.generate();
        const mintB = Keypair.generate();
        const ammIndex = 207;
        const fee = 100;

        await airdrop(connection, user.publicKey);
        await airdrop(connection, admin.publicKey);
        await createMintSafe(connection, user, user.publicKey, 9, mintA);
        await createMintSafe(connection, user, user.publicKey, 9, mintB);

        const {ammPda} = await createAmm(program, user, admin.publicKey, fee, ammIndex);
        const {poolPda} = await createPool(program, user, ammPda, mintA.publicKey, mintB.publicKey);

        const depositorAccountA = getAssociatedTokenAddressSync(mintA.publicKey, user.publicKey, false);
        const depositorAccountB = getAssociatedTokenAddressSync(mintB.publicKey, user.publicKey, false);

        try {
            await createAssociatedTokenAccount(connection, user, mintA.publicKey, user.publicKey);
        } catch (err) {
        }
        try {
            await createAssociatedTokenAccount(connection, user, mintB.publicKey, user.publicKey);
        } catch (err) {
        }

        let accountABalance = new anchor.BN(0);
        try {
            const accountA = await getAccount(connection, depositorAccountA);
            accountABalance = new anchor.BN(accountA.amount.toString());
        } catch (err) {
        }

        let accountBBalance = new anchor.BN(0);
        try {
            const accountB = await getAccount(connection, depositorAccountB);
            accountBBalance = new anchor.BN(accountB.amount.toString());
        } catch (err) {
        }

        const amountA = new anchor.BN(100).mul(DECIMALS);
        const amountB = accountBBalance.add(new anchor.BN(1)).mul(new anchor.BN(100));

        if (accountABalance.lt(amountA)) {
            await mintTo(connection, user, mintA.publicKey, depositorAccountA, user, amountA.sub(accountABalance).toNumber());
        }

        const finalAccountB = await getAccount(connection, depositorAccountB);
        const finalBalanceB = new anchor.BN(finalAccountB.amount.toString());
        assert.isTrue(finalBalanceB.lt(amountB), `Account B should have insufficient balance: ${finalBalanceB.toString()} < ${amountB.toString()}`);

        try {
            await program.methods.addLiquidity(amountA, amountB).accounts({
                pool: poolPda,
                mintA: mintA.publicKey,
                mintB: mintB.publicKey,
                depositor: user.publicKey,
                depositorAccountA: depositorAccountA,
                depositorAccountB: depositorAccountB,
                payer: user.publicKey,
            }).signers([user]).rpc({commitment: "confirmed"});
            assert.fail("Expected transaction to fail");
        } catch (err) {
            const errorString = err.toString();
            assert.isTrue(errorString.includes("InsufficientBalance") || errorString.includes("6003"), `Expected InsufficientBalance error, got: ${errorString}`);
        }
    });

    it("Add liquidity using required_b branch (amount_a < required_a, but amount_b >= required_b)", async () => {
        const user = Keypair.generate();
        const admin = Keypair.generate();
        const mintA = Keypair.generate();
        const mintB = Keypair.generate();
        const ammIndex = 208;
        const fee = 100;

        await airdrop(connection, user.publicKey);
        await airdrop(connection, admin.publicKey);
        await createMintSafe(connection, user, user.publicKey, 9, mintA);
        await createMintSafe(connection, user, user.publicKey, 9, mintB);

        const {ammPda} = await createAmm(program, user, admin.publicKey, fee, ammIndex);
        const {poolPda, mintLiquidityPda, authorityPda} = await createPool(program, user, ammPda, mintA.publicKey, mintB.publicKey);

        const initialAmountA = new anchor.BN(100).mul(DECIMALS);
        const initialAmountB = new anchor.BN(100).mul(DECIMALS);

        await addLiquidity(
            program, connection, user, user, poolPda, mintA.publicKey, mintB.publicKey, mintLiquidityPda, initialAmountA, initialAmountB
        );

        const {reserveA, reserveB} = await getPoolReserves(connection, mintA.publicKey, mintB.publicKey, authorityPda);
        const mintLiquidityBefore = await getMint(connection, mintLiquidityPda);
        const totalLpBefore = new anchor.BN(mintLiquidityBefore.supply.toString());

        const amountA2 = new anchor.BN(50).mul(DECIMALS);
        const amountB2 = new anchor.BN(200).mul(DECIMALS);

        const requiredB = amountA2.mul(reserveB).div(reserveA);
        const requiredA = amountB2.mul(reserveA).div(reserveB);

        assert.isTrue(amountA2.lt(requiredA), `amountA2 (${amountA2.toString()}) should be less than requiredA (${requiredA.toString()})`);
        assert.isTrue(amountB2.gte(requiredB), `amountB2 (${amountB2.toString()}) should be >= requiredB (${requiredB.toString()})`);

        const depositorAccountA = getAssociatedTokenAddressSync(mintA.publicKey, user.publicKey, false);
        const depositorAccountB = getAssociatedTokenAddressSync(mintB.publicKey, user.publicKey, false);
        await mintTo(connection, user, mintA.publicKey, depositorAccountA, user, amountA2.toNumber());
        await mintTo(connection, user, mintB.publicKey, depositorAccountB, user, amountB2.toNumber());

        await program.methods.addLiquidity(amountA2, amountB2).accounts({
            pool: poolPda,
            mintA: mintA.publicKey,
            mintB: mintB.publicKey,
            depositor: user.publicKey,
            depositorAccountA: depositorAccountA,
            depositorAccountB: depositorAccountB,
            payer: user.publicKey,
        }).signers([user]).rpc({commitment: "confirmed"});

        const {reserveA: reserveAAfter, reserveB: reserveBAfter} = await getPoolReserves(connection, mintA.publicKey, mintB.publicKey, authorityPda);
        const mintLiquidityAfter = await getMint(connection, mintLiquidityPda);

        const expectedUsedA = amountA2;
        const expectedUsedB = requiredB;

        const lpFromA2 = expectedUsedA.mul(totalLpBefore).div(reserveA);
        const lpFromB2 = expectedUsedB.mul(totalLpBefore).div(reserveB);
        const expectedLp2 = lpFromA2.lt(lpFromB2) ? lpFromA2 : lpFromB2;

        assert.strictEqual(mintLiquidityAfter.supply.toString(), totalLpBefore.add(expectedLp2).toString(), `Total LP should be ${totalLpBefore.add(expectedLp2).toString()} but was ${mintLiquidityAfter.supply.toString()}`);
        assert.strictEqual(reserveAAfter.toString(), reserveA.add(expectedUsedA).toString(), `Pool A should be ${reserveA.add(expectedUsedA).toString()} but was ${reserveAAfter.toString()}`);
        assert.strictEqual(reserveBAfter.toString(), reserveB.add(expectedUsedB).toString(), `Pool B should be ${reserveB.add(expectedUsedB).toString()} but was ${reserveBAfter.toString()}`);
    });

    it("Add liquidity when amount_b exactly equals required_b", async () => {
        const user = Keypair.generate();
        const admin = Keypair.generate();
        const mintA = Keypair.generate();
        const mintB = Keypair.generate();
        const ammIndex = 209;
        const fee = 100;

        await airdrop(connection, user.publicKey);
        await airdrop(connection, admin.publicKey);
        await createMintSafe(connection, user, user.publicKey, 9, mintA);
        await createMintSafe(connection, user, user.publicKey, 9, mintB);

        const {ammPda} = await createAmm(program, user, admin.publicKey, fee, ammIndex);
        const {poolPda, mintLiquidityPda, authorityPda} = await createPool(program, user, ammPda, mintA.publicKey, mintB.publicKey);

        const initialAmountA = new anchor.BN(100).mul(DECIMALS);
        const initialAmountB = new anchor.BN(100).mul(DECIMALS);

        await addLiquidity(
            program, connection, user, user, poolPda, mintA.publicKey, mintB.publicKey, mintLiquidityPda, initialAmountA, initialAmountB
        );

        const {reserveA, reserveB} = await getPoolReserves(connection, mintA.publicKey, mintB.publicKey, authorityPda);
        const mintLiquidityBefore = await getMint(connection, mintLiquidityPda);
        const totalLpBefore = new anchor.BN(mintLiquidityBefore.supply.toString());

        const amountA2 = new anchor.BN(200).mul(DECIMALS);
        const requiredB = amountA2.mul(reserveB).div(reserveA);
        const amountB2 = requiredB;

        const depositorAccountA = getAssociatedTokenAddressSync(mintA.publicKey, user.publicKey, false);
        const depositorAccountB = getAssociatedTokenAddressSync(mintB.publicKey, user.publicKey, false);
        await mintTo(connection, user, mintA.publicKey, depositorAccountA, user, amountA2.toNumber());
        await mintTo(connection, user, mintB.publicKey, depositorAccountB, user, amountB2.toNumber());

        await program.methods.addLiquidity(amountA2, amountB2).accounts({
            pool: poolPda,
            mintA: mintA.publicKey,
            mintB: mintB.publicKey,
            depositor: user.publicKey,
            depositorAccountA: depositorAccountA,
            depositorAccountB: depositorAccountB,
            payer: user.publicKey,
        }).signers([user]).rpc({commitment: "confirmed"});

        const {reserveA: reserveAAfter, reserveB: reserveBAfter} = await getPoolReserves(connection, mintA.publicKey, mintB.publicKey, authorityPda);
        const mintLiquidityAfter = await getMint(connection, mintLiquidityPda);

        const expectedUsedA = amountA2;
        const expectedUsedB = requiredB;

        const lpFromA2 = expectedUsedA.mul(totalLpBefore).div(reserveA);
        const lpFromB2 = expectedUsedB.mul(totalLpBefore).div(reserveB);
        const expectedLp2 = lpFromA2.lt(lpFromB2) ? lpFromA2 : lpFromB2;

        assert.strictEqual(mintLiquidityAfter.supply.toString(), totalLpBefore.add(expectedLp2).toString(), `Total LP should be ${totalLpBefore.add(expectedLp2).toString()} but was ${mintLiquidityAfter.supply.toString()}`);
        assert.strictEqual(reserveAAfter.toString(), reserveA.add(expectedUsedA).toString(), `Pool A should be ${reserveA.add(expectedUsedA).toString()} but was ${reserveAAfter.toString()}`);
        assert.strictEqual(reserveBAfter.toString(), reserveB.add(expectedUsedB).toString(), `Pool B should be ${reserveB.add(expectedUsedB).toString()} but was ${reserveBAfter.toString()}`);
    });

    it("Add liquidity when amount_a exactly equals required_a", async () => {
        const user = Keypair.generate();
        const admin = Keypair.generate();
        const mintA = Keypair.generate();
        const mintB = Keypair.generate();
        const ammIndex = 210;
        const fee = 100;

        await airdrop(connection, user.publicKey);
        await airdrop(connection, admin.publicKey);
        await createMintSafe(connection, user, user.publicKey, 9, mintA);
        await createMintSafe(connection, user, user.publicKey, 9, mintB);

        const {ammPda} = await createAmm(program, user, admin.publicKey, fee, ammIndex);
        const {poolPda, mintLiquidityPda, authorityPda} = await createPool(program, user, ammPda, mintA.publicKey, mintB.publicKey);

        const initialAmountA = new anchor.BN(100).mul(DECIMALS);
        const initialAmountB = new anchor.BN(100).mul(DECIMALS);

        await addLiquidity(
            program, connection, user, user, poolPda, mintA.publicKey, mintB.publicKey, mintLiquidityPda, initialAmountA, initialAmountB
        );

        const {reserveA, reserveB} = await getPoolReserves(connection, mintA.publicKey, mintB.publicKey, authorityPda);
        const mintLiquidityBefore = await getMint(connection, mintLiquidityPda);
        const totalLpBefore = new anchor.BN(mintLiquidityBefore.supply.toString());

        const amountB2 = new anchor.BN(200).mul(DECIMALS);
        const requiredA = amountB2.mul(reserveA).div(reserveB);
        const amountA2 = requiredA;

        const depositorAccountA = getAssociatedTokenAddressSync(mintA.publicKey, user.publicKey, false);
        const depositorAccountB = getAssociatedTokenAddressSync(mintB.publicKey, user.publicKey, false);
        await mintTo(connection, user, mintA.publicKey, depositorAccountA, user, amountA2.toNumber());
        await mintTo(connection, user, mintB.publicKey, depositorAccountB, user, amountB2.toNumber());

        await program.methods.addLiquidity(amountA2, amountB2).accounts({
            pool: poolPda,
            mintA: mintA.publicKey,
            mintB: mintB.publicKey,
            depositor: user.publicKey,
            depositorAccountA: depositorAccountA,
            depositorAccountB: depositorAccountB,
            payer: user.publicKey,
        }).signers([user]).rpc({commitment: "confirmed"});

        const {reserveA: reserveAAfter, reserveB: reserveBAfter} = await getPoolReserves(connection, mintA.publicKey, mintB.publicKey, authorityPda);
        const mintLiquidityAfter = await getMint(connection, mintLiquidityPda);

        const expectedUsedA = requiredA;
        const expectedUsedB = amountB2;

        const lpFromA2 = expectedUsedA.mul(totalLpBefore).div(reserveA);
        const lpFromB2 = expectedUsedB.mul(totalLpBefore).div(reserveB);
        const expectedLp2 = lpFromA2.lt(lpFromB2) ? lpFromA2 : lpFromB2;

        assert.strictEqual(mintLiquidityAfter.supply.toString(), totalLpBefore.add(expectedLp2).toString(), `Total LP should be ${totalLpBefore.add(expectedLp2).toString()} but was ${mintLiquidityAfter.supply.toString()}`);
        assert.strictEqual(reserveAAfter.toString(), reserveA.add(expectedUsedA).toString(), `Pool A should be ${reserveA.add(expectedUsedA).toString()} but was ${reserveAAfter.toString()}`);
        assert.strictEqual(reserveBAfter.toString(), reserveB.add(expectedUsedB).toString(), `Pool B should be ${reserveB.add(expectedUsedB).toString()} but was ${reserveBAfter.toString()}`);
    });

    it("Add liquidity with minimal amounts (1 token each)", async () => {
        const user = Keypair.generate();
        const admin = Keypair.generate();
        const mintA = Keypair.generate();
        const mintB = Keypair.generate();
        const ammIndex = 211;
        const fee = 100;

        await airdrop(connection, user.publicKey);
        await airdrop(connection, admin.publicKey);
        await createMintSafe(connection, user, user.publicKey, 9, mintA);
        await createMintSafe(connection, user, user.publicKey, 9, mintB);

        const {ammPda} = await createAmm(program, user, admin.publicKey, fee, ammIndex);
        const {poolPda, mintLiquidityPda} = await createPool(program, user, ammPda, mintA.publicKey, mintB.publicKey);

        const amountA = new anchor.BN(1);
        const amountB = new anchor.BN(1);

        const {lpAmount} = await addLiquidity(
            program, connection, user, user, poolPda, mintA.publicKey, mintB.publicKey, mintLiquidityPda, amountA, amountB
        );

        const product = amountA.mul(amountB);
        const expectedLp = new anchor.BN(Math.floor(Math.sqrt(Number(product))));
        assert.strictEqual(lpAmount.toString(), expectedLp.toString(), `LP amount should be ${expectedLp.toString()} but was ${lpAmount.toString()}`);
        assert.isTrue(lpAmount.gt(new anchor.BN(0)), "LP amount should be greater than zero");
    });
});

