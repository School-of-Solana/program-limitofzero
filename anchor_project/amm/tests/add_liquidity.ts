import * as anchor from "@coral-xyz/anchor";
import {Program} from "@coral-xyz/anchor";
import {Amm} from "../target/types/amm";
import {Keypair, PublicKey} from "@solana/web3.js";
import {assert} from "chai";
import {
    createAssociatedTokenAccount,
    getAccount,
    getAssociatedTokenAddressSync,
    getMint,
    mintTo
} from "@solana/spl-token";
import {airdrop, createAmm, createMintSafe, createPool, indexToSeed} from "./helper";

describe("add_liquidity", () => {
    anchor.setProvider(anchor.AnchorProvider.env());
    let connection = anchor.getProvider().connection;

    const program = anchor.workspace.amm as Program<Amm>;

    let signer = Keypair.generate();
    let signer2 = Keypair.generate();
    let admin1 = Keypair.generate();

    const mintA = Keypair.generate();
    const mintB = Keypair.generate();
    const mintC = Keypair.generate();

    before(async () => {
        await airdrop(connection, signer.publicKey);
        await airdrop(connection, signer2.publicKey);
        await airdrop(connection, admin1.publicKey);

        await createMintSafe(connection, signer, signer.publicKey, 9, mintA);
        await createMintSafe(connection, signer, signer.publicKey, 9, mintB);
        await createMintSafe(connection, signer, signer.publicKey, 9, mintC);
    });

    beforeEach(async () => {
        await airdrop(connection, signer.publicKey);
    });

    const ammIndex = 200;
    const fee = 100;
    const DECIMALS = new anchor.BN(10).pow(new anchor.BN(9));

    it("Add liquidity to pool A-B: 100 = 100", async () => {
        const {ammPda} = await createAmm(program, signer, admin1.publicKey, fee, ammIndex);
        const {poolPda: poolPda1, mintLiquidityPda: mintLiquidityPda1} = await createPool(
            program,
            signer,
            ammPda,
            mintA.publicKey,
            mintB.publicKey
        );

        const depositorAccountA = getAssociatedTokenAddressSync(
            mintA.publicKey,
            signer.publicKey,
            false
        );

        const depositorAccountB = getAssociatedTokenAddressSync(
            mintB.publicKey,
            signer.publicKey,
            false
        );

        const depositorAccountLiquidity = getAssociatedTokenAddressSync(
            mintLiquidityPda1,
            signer.publicKey,
            false
        );

        await createAssociatedTokenAccount(
            connection,
            signer,
            mintA.publicKey,
            signer.publicKey
        );

        await createAssociatedTokenAccount(
            connection,
            signer,
            mintB.publicKey,
            signer.publicKey
        );

        const amountA = new anchor.BN(100).mul(DECIMALS);
        const amountB = new anchor.BN(100).mul(DECIMALS);

        await mintTo(connection, signer, mintA.publicKey, depositorAccountA, signer, amountA.toNumber());
        await mintTo(connection, signer, mintB.publicKey, depositorAccountB, signer, amountB.toNumber());

        const accountA = await getAccount(connection, depositorAccountA);
        const accountB = await getAccount(connection, depositorAccountB);
        assert.isTrue(accountA.amount >= amountA.toNumber(), "Depositor account A should have enough tokens");
        assert.isTrue(accountB.amount >= amountB.toNumber(), "Depositor account B should have enough tokens");

        await program.methods.addLiquidity(amountA, amountB).accounts({
            pool: poolPda1,
            mintA: mintA.publicKey,
            mintB: mintB.publicKey,
            depositor: signer.publicKey,
            depositorAccountA: depositorAccountA,
            depositorAccountB: depositorAccountB,
            payer: signer.publicKey,
        }).signers([signer]).rpc({commitment: "confirmed"});

        const lpAccount = await getAccount(connection, depositorAccountLiquidity);
        const product = amountA.mul(amountB);
        const expectedLp = new anchor.BN(Math.floor(Math.sqrt(Number(product))));
        assert.strictEqual(lpAccount.amount.toString(), expectedLp.toString(), `LP amount should be ${expectedLp.toString()} but was ${lpAccount.amount.toString()}`);
    });

    it("Add liquidity to pool C-A: 50 = 100", async () => {
        const [ammPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("AMM"), indexToSeed(ammIndex)],
            program.programId
        );
        const ammData = await program.account.amm.fetch(ammPda);
        assert.strictEqual(ammData.index, ammIndex, "AMM should exist from previous test");

        const {poolPda: poolPda2, mintLiquidityPda: mintLiquidityPda2} = await createPool(
            program,
            signer,
            ammPda,
            mintC.publicKey,
            mintA.publicKey
        );

        const depositorAccountC = getAssociatedTokenAddressSync(
            mintC.publicKey,
            signer.publicKey,
            false
        );

        const depositorAccountA2 = getAssociatedTokenAddressSync(
            mintA.publicKey,
            signer.publicKey,
            false
        );

        const depositorAccountLiquidity2 = getAssociatedTokenAddressSync(
            mintLiquidityPda2,
            signer.publicKey,
            false
        );

        try {
            await createAssociatedTokenAccount(
                connection,
                signer,
                mintC.publicKey,
                signer.publicKey
            );
        } catch (err) {
        }

        const amountC = new anchor.BN(50).mul(DECIMALS);
        const amountA2 = new anchor.BN(100).mul(DECIMALS);

        await mintTo(connection, signer, mintC.publicKey, depositorAccountC, signer, amountC.toNumber());
        await mintTo(connection, signer, mintA.publicKey, depositorAccountA2, signer, amountA2.toNumber());

        const accountC = await getAccount(connection, depositorAccountC);
        const accountA2 = await getAccount(connection, depositorAccountA2);
        assert.isTrue(accountC.amount >= amountC.toNumber(), "Depositor account C should have enough tokens");
        assert.isTrue(accountA2.amount >= amountA2.toNumber(), "Depositor account A2 should have enough tokens");

        await program.methods.addLiquidity(amountC, amountA2).accounts({
            pool: poolPda2,
            mintA: mintC.publicKey,
            mintB: mintA.publicKey,
            depositor: signer.publicKey,
            depositorAccountA: depositorAccountC,
            depositorAccountB: depositorAccountA2,
            payer: signer.publicKey,
        }).signers([signer]).rpc({commitment: "confirmed"});

        const lpAccount2 = await getAccount(connection, depositorAccountLiquidity2);
        const product2 = amountC.mul(amountA2);
        const expectedLp2 = new anchor.BN(Math.floor(Math.sqrt(Number(product2))));
        assert.strictEqual(lpAccount2.amount.toString(), expectedLp2.toString(), `LP amount should be ${expectedLp2.toString()} but was ${lpAccount2.amount.toString()}`);
    });

    it("Second user adds liquidity to pool A-B: checks total_lp, pool balances, and LP transfer", async () => {
        const ammIndex2 = 201;
        const {ammPda} = await createAmm(program, signer, admin1.publicKey, fee, ammIndex2);
        const {poolPda, mintLiquidityPda, authorityPda, poolAccountA, poolAccountB} = await createPool(
            program,
            signer,
            ammPda,
            mintA.publicKey,
            mintB.publicKey
        );

        const amountA1 = new anchor.BN(100).mul(DECIMALS);
        const amountB1 = new anchor.BN(100).mul(DECIMALS);

        const depositor1AccountA = getAssociatedTokenAddressSync(
            mintA.publicKey,
            signer.publicKey,
            false
        );

        const depositor1AccountB = getAssociatedTokenAddressSync(
            mintB.publicKey,
            signer.publicKey,
            false
        );

        const depositor1AccountLiquidity = getAssociatedTokenAddressSync(
            mintLiquidityPda,
            signer.publicKey,
            false
        );

        try {
            await createAssociatedTokenAccount(connection, signer, mintA.publicKey, signer.publicKey);
        } catch (err) {
        }
        try {
            await createAssociatedTokenAccount(connection, signer, mintB.publicKey, signer.publicKey);
        } catch (err) {
        }

        await mintTo(connection, signer, mintA.publicKey, depositor1AccountA, signer, amountA1.toNumber());
        await mintTo(connection, signer, mintB.publicKey, depositor1AccountB, signer, amountB1.toNumber());

        await program.methods.addLiquidity(amountA1, amountB1).accounts({
            pool: poolPda,
            mintA: mintA.publicKey,
            mintB: mintB.publicKey,
            depositor: signer.publicKey,
            depositorAccountA: depositor1AccountA,
            depositorAccountB: depositor1AccountB,
            payer: signer.publicKey,
        }).signers([signer]).rpc({commitment: "confirmed"});

        const lpAccount1 = await getAccount(connection, depositor1AccountLiquidity);
        const product1 = amountA1.mul(amountB1);
        const expectedLp1 = new anchor.BN(Math.floor(Math.sqrt(Number(product1))));
        assert.strictEqual(lpAccount1.amount.toString(), expectedLp1.toString(), `First user LP should be ${expectedLp1.toString()} but was ${lpAccount1.amount.toString()}`);

        const poolAccountABefore = await getAccount(connection, poolAccountA);
        const poolAccountBBefore = await getAccount(connection, poolAccountB);
        const mintLiquidityBefore = await getMint(connection, mintLiquidityPda);

        const amountA2 = new anchor.BN(50).mul(DECIMALS);
        const amountB2 = new anchor.BN(50).mul(DECIMALS);

        await airdrop(connection, signer2.publicKey);

        const depositor2AccountA = getAssociatedTokenAddressSync(
            mintA.publicKey,
            signer2.publicKey,
            false
        );

        const depositor2AccountB = getAssociatedTokenAddressSync(
            mintB.publicKey,
            signer2.publicKey,
            false
        );

        const depositor2AccountLiquidity = getAssociatedTokenAddressSync(
            mintLiquidityPda,
            signer2.publicKey,
            false
        );

        try {
            await createAssociatedTokenAccount(connection, signer2, mintA.publicKey, signer2.publicKey);
        } catch (err) {
        }
        try {
            await createAssociatedTokenAccount(connection, signer2, mintB.publicKey, signer2.publicKey);
        } catch (err) {
        }

        await mintTo(connection, signer, mintA.publicKey, depositor2AccountA, signer, amountA2.toNumber());
        await mintTo(connection, signer, mintB.publicKey, depositor2AccountB, signer, amountB2.toNumber());

        await program.methods.addLiquidity(amountA2, amountB2).accounts({
            pool: poolPda,
            mintA: mintA.publicKey,
            mintB: mintB.publicKey,
            depositor: signer2.publicKey,
            depositorAccountA: depositor2AccountA,
            depositorAccountB: depositor2AccountB,
            payer: signer2.publicKey,
        }).signers([signer2]).rpc({commitment: "confirmed"});

        const poolAccountAAfter = await getAccount(connection, poolAccountA);
        const poolAccountBAfter = await getAccount(connection, poolAccountB);
        const mintLiquidityAfter = await getMint(connection, mintLiquidityPda);
        const lpAccount2 = await getAccount(connection, depositor2AccountLiquidity);

        const reserveA = new anchor.BN(poolAccountABefore.amount.toString());
        const reserveB = new anchor.BN(poolAccountBBefore.amount.toString());
        const totalLpBefore = new anchor.BN(mintLiquidityBefore.supply.toString());

        const lpFromA = amountA2.mul(totalLpBefore).div(reserveA);
        const lpFromB = amountB2.mul(totalLpBefore).div(reserveB);
        const expectedLp2 = lpFromA.lt(lpFromB) ? lpFromA : lpFromB;

        assert.strictEqual(lpAccount2.amount.toString(), expectedLp2.toString(), `Second user LP should be ${expectedLp2.toString()} but was ${lpAccount2.amount.toString()}`);
        assert.strictEqual(mintLiquidityAfter.supply.toString(), totalLpBefore.add(expectedLp2).toString(), `Total LP should be ${totalLpBefore.add(expectedLp2).toString()} but was ${mintLiquidityAfter.supply.toString()}`);
        assert.strictEqual(poolAccountAAfter.amount.toString(), reserveA.add(amountA2).toString(), `Pool A should be ${reserveA.add(amountA2).toString()} but was ${poolAccountAAfter.amount.toString()}`);
        assert.strictEqual(poolAccountBAfter.amount.toString(), reserveB.add(amountB2).toString(), `Pool B should be ${reserveB.add(amountB2).toString()} but was ${poolAccountBAfter.amount.toString()}`);
    });

    it("Add liquidity using required_a branch (amount_b < required_b, but amount_a >= required_a)", async () => {
        const ammIndex3 = 202;
        const {ammPda} = await createAmm(program, signer, admin1.publicKey, fee, ammIndex3);
        const {poolPda, mintLiquidityPda, poolAccountA, poolAccountB} = await createPool(
            program,
            signer,
            ammPda,
            mintA.publicKey,
            mintB.publicKey
        );

        const initialAmountA = new anchor.BN(100).mul(DECIMALS);
        const initialAmountB = new anchor.BN(100).mul(DECIMALS);

        const depositor1AccountA = getAssociatedTokenAddressSync(
            mintA.publicKey,
            signer.publicKey,
            false
        );

        const depositor1AccountB = getAssociatedTokenAddressSync(
            mintB.publicKey,
            signer.publicKey,
            false
        );

        try {
            await createAssociatedTokenAccount(connection, signer, mintA.publicKey, signer.publicKey);
        } catch (err) {
        }
        try {
            await createAssociatedTokenAccount(connection, signer, mintB.publicKey, signer.publicKey);
        } catch (err) {
        }

        await mintTo(connection, signer, mintA.publicKey, depositor1AccountA, signer, initialAmountA.toNumber());
        await mintTo(connection, signer, mintB.publicKey, depositor1AccountB, signer, initialAmountB.toNumber());

        await program.methods.addLiquidity(initialAmountA, initialAmountB).accounts({
            pool: poolPda,
            mintA: mintA.publicKey,
            mintB: mintB.publicKey,
            depositor: signer.publicKey,
            depositorAccountA: depositor1AccountA,
            depositorAccountB: depositor1AccountB,
            payer: signer.publicKey,
        }).signers([signer]).rpc({commitment: "confirmed"});

        const depositor1AccountLiquidityBefore = getAssociatedTokenAddressSync(
            mintLiquidityPda,
            signer.publicKey,
            false
        );
        const lpAccount1Before = await getAccount(connection, depositor1AccountLiquidityBefore);

        const poolAccountABefore = await getAccount(connection, poolAccountA);
        const poolAccountBBefore = await getAccount(connection, poolAccountB);
        const mintLiquidityBefore = await getMint(connection, mintLiquidityPda);

        const reserveA = new anchor.BN(poolAccountABefore.amount.toString());
        const reserveB = new anchor.BN(poolAccountBBefore.amount.toString());
        const totalLpBefore = new anchor.BN(mintLiquidityBefore.supply.toString());

        const amountA2 = new anchor.BN(200).mul(DECIMALS);
        const amountB2 = new anchor.BN(50).mul(DECIMALS);

        const requiredB = amountA2.mul(reserveB).div(reserveA);
        const requiredA = amountB2.mul(reserveA).div(reserveB);

        assert.isTrue(amountB2.lt(requiredB), `amountB2 (${amountB2.toString()}) should be less than requiredB (${requiredB.toString()})`);
        assert.isTrue(amountA2.gte(requiredA), `amountA2 (${amountA2.toString()}) should be >= requiredA (${requiredA.toString()})`);

        await mintTo(connection, signer, mintA.publicKey, depositor1AccountA, signer, amountA2.toNumber());
        await mintTo(connection, signer, mintB.publicKey, depositor1AccountB, signer, amountB2.toNumber());

        await program.methods.addLiquidity(amountA2, amountB2).accounts({
            pool: poolPda,
            mintA: mintA.publicKey,
            mintB: mintB.publicKey,
            depositor: signer.publicKey,
            depositorAccountA: depositor1AccountA,
            depositorAccountB: depositor1AccountB,
            payer: signer.publicKey,
        }).signers([signer]).rpc({commitment: "confirmed"});

        const poolAccountAAfter = await getAccount(connection, poolAccountA);
        const poolAccountBAfter = await getAccount(connection, poolAccountB);
        const mintLiquidityAfter = await getMint(connection, mintLiquidityPda);
        const depositor1AccountLiquidity = getAssociatedTokenAddressSync(
            mintLiquidityPda,
            signer.publicKey,
            false
        );
        const lpAccount2Total = await getAccount(connection, depositor1AccountLiquidity);

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
        assert.strictEqual(poolAccountAAfter.amount.toString(), reserveA.add(expectedUsedA).toString(), `Pool A should be ${reserveA.add(expectedUsedA).toString()} but was ${poolAccountAAfter.amount.toString()}`);
        assert.strictEqual(poolAccountBAfter.amount.toString(), reserveB.add(expectedUsedB).toString(), `Pool B should be ${reserveB.add(expectedUsedB).toString()} but was ${poolAccountBAfter.amount.toString()}`);
    });

    it("Cannot add liquidity with amount_a = 0", async () => {
        const ammIndex4 = 203;
        const {ammPda} = await createAmm(program, signer, admin1.publicKey, fee, ammIndex4);
        const {poolPda} = await createPool(program, signer, ammPda, mintA.publicKey, mintB.publicKey);

        const depositorAccountA = getAssociatedTokenAddressSync(mintA.publicKey, signer.publicKey, false);
        const depositorAccountB = getAssociatedTokenAddressSync(mintB.publicKey, signer.publicKey, false);

        try {
            await createAssociatedTokenAccount(connection, signer, mintA.publicKey, signer.publicKey);
        } catch (err) {
        }
        try {
            await createAssociatedTokenAccount(connection, signer, mintB.publicKey, signer.publicKey);
        } catch (err) {
        }

        const amountA = new anchor.BN(0);
        const amountB = new anchor.BN(100).mul(DECIMALS);

        await mintTo(connection, signer, mintB.publicKey, depositorAccountB, signer, amountB.toNumber());

        try {
            await program.methods.addLiquidity(amountA, amountB).accounts({
                pool: poolPda,
                mintA: mintA.publicKey,
                mintB: mintB.publicKey,
                depositor: signer.publicKey,
                depositorAccountA: depositorAccountA,
                depositorAccountB: depositorAccountB,
                payer: signer.publicKey,
            }).signers([signer]).rpc({commitment: "confirmed"});
            assert.fail("Expected transaction to fail");
        } catch (err) {
            const errorString = err.toString();
            assert.isTrue(errorString.includes("AmountIsZero") || errorString.includes("6001"), `Expected AmountIsZero error, got: ${errorString}`);
        }
    });

    it("Cannot add liquidity with amount_b = 0", async () => {
        const ammIndex5 = 204;
        const {ammPda} = await createAmm(program, signer, admin1.publicKey, fee, ammIndex5);
        const {poolPda} = await createPool(program, signer, ammPda, mintA.publicKey, mintB.publicKey);

        const depositorAccountA = getAssociatedTokenAddressSync(mintA.publicKey, signer.publicKey, false);
        const depositorAccountB = getAssociatedTokenAddressSync(mintB.publicKey, signer.publicKey, false);

        try {
            await createAssociatedTokenAccount(connection, signer, mintA.publicKey, signer.publicKey);
        } catch (err) {
        }
        try {
            await createAssociatedTokenAccount(connection, signer, mintB.publicKey, signer.publicKey);
        } catch (err) {
        }

        const amountA = new anchor.BN(100).mul(DECIMALS);
        const amountB = new anchor.BN(0);

        await mintTo(connection, signer, mintA.publicKey, depositorAccountA, signer, amountA.toNumber());

        try {
            await program.methods.addLiquidity(amountA, amountB).accounts({
                pool: poolPda,
                mintA: mintA.publicKey,
                mintB: mintB.publicKey,
                depositor: signer.publicKey,
                depositorAccountA: depositorAccountA,
                depositorAccountB: depositorAccountB,
                payer: signer.publicKey,
            }).signers([signer]).rpc({commitment: "confirmed"});
            assert.fail("Expected transaction to fail");
        } catch (err) {
            const errorString = err.toString();
            assert.isTrue(errorString.includes("AmountIsZero") || errorString.includes("6001"), `Expected AmountIsZero error, got: ${errorString}`);
        }
    });

    it("Cannot add liquidity with insufficient balance in account A", async () => {
        const ammIndex6 = 205;
        const {ammPda} = await createAmm(program, signer, admin1.publicKey, fee, ammIndex6);
        const {poolPda} = await createPool(program, signer, ammPda, mintA.publicKey, mintB.publicKey);

        const depositorAccountA = getAssociatedTokenAddressSync(mintA.publicKey, signer.publicKey, false);
        const depositorAccountB = getAssociatedTokenAddressSync(mintB.publicKey, signer.publicKey, false);

        try {
            await createAssociatedTokenAccount(connection, signer, mintA.publicKey, signer.publicKey);
        } catch (err) {
        }
        try {
            await createAssociatedTokenAccount(connection, signer, mintB.publicKey, signer.publicKey);
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

        const amountA = accountABalance.add(new anchor.BN(1)).mul(new anchor.BN(100));
        const amountB = new anchor.BN(100).mul(DECIMALS);

        if (accountBBalance.lt(amountB)) {
            await mintTo(connection, signer, mintB.publicKey, depositorAccountB, signer, amountB.sub(accountBBalance).toNumber());
        }

        const finalAccountA = await getAccount(connection, depositorAccountA);
        const finalBalanceA = new anchor.BN(finalAccountA.amount.toString());
        assert.isTrue(finalBalanceA.lt(amountA), `Account A should have insufficient balance: ${finalBalanceA.toString()} < ${amountA.toString()}`);

        try {
            await program.methods.addLiquidity(amountA, amountB).accounts({
                pool: poolPda,
                mintA: mintA.publicKey,
                mintB: mintB.publicKey,
                depositor: signer.publicKey,
                depositorAccountA: depositorAccountA,
                depositorAccountB: depositorAccountB,
                payer: signer.publicKey,
            }).signers([signer]).rpc({commitment: "confirmed"});
            assert.fail("Expected transaction to fail");
        } catch (err) {
            const errorString = err.toString();
            assert.isTrue(errorString.includes("InsufficientBalance") || errorString.includes("6003"), `Expected InsufficientBalance error, got: ${errorString}`);
        }
    });

    it("Cannot add liquidity with insufficient balance in account B", async () => {
        const ammIndex7 = 206;
        const {ammPda} = await createAmm(program, signer, admin1.publicKey, fee, ammIndex7);
        const {poolPda} = await createPool(program, signer, ammPda, mintA.publicKey, mintB.publicKey);

        const depositorAccountA = getAssociatedTokenAddressSync(mintA.publicKey, signer.publicKey, false);
        const depositorAccountB = getAssociatedTokenAddressSync(mintB.publicKey, signer.publicKey, false);

        try {
            await createAssociatedTokenAccount(connection, signer, mintA.publicKey, signer.publicKey);
        } catch (err) {
        }
        try {
            await createAssociatedTokenAccount(connection, signer, mintB.publicKey, signer.publicKey);
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
            await mintTo(connection, signer, mintA.publicKey, depositorAccountA, signer, amountA.sub(accountABalance).toNumber());
        }

        const finalAccountB = await getAccount(connection, depositorAccountB);
        const finalBalanceB = new anchor.BN(finalAccountB.amount.toString());
        assert.isTrue(finalBalanceB.lt(amountB), `Account B should have insufficient balance: ${finalBalanceB.toString()} < ${amountB.toString()}`);

        try {
            await program.methods.addLiquidity(amountA, amountB).accounts({
                pool: poolPda,
                mintA: mintA.publicKey,
                mintB: mintB.publicKey,
                depositor: signer.publicKey,
                depositorAccountA: depositorAccountA,
                depositorAccountB: depositorAccountB,
                payer: signer.publicKey,
            }).signers([signer]).rpc({commitment: "confirmed"});
            assert.fail("Expected transaction to fail");
        } catch (err) {
            const errorString = err.toString();
            assert.isTrue(errorString.includes("InsufficientBalance") || errorString.includes("6003"), `Expected InsufficientBalance error, got: ${errorString}`);
        }
    });

    it("Add liquidity using required_b branch (amount_a < required_a, but amount_b >= required_b)", async () => {
        const ammIndex9 = 208;
        const {ammPda} = await createAmm(program, signer, admin1.publicKey, fee, ammIndex9);
        const {
            poolPda,
            mintLiquidityPda,
            poolAccountA,
            poolAccountB
        } = await createPool(program, signer, ammPda, mintA.publicKey, mintB.publicKey);

        const initialAmountA = new anchor.BN(100).mul(DECIMALS);
        const initialAmountB = new anchor.BN(100).mul(DECIMALS);

        const depositor1AccountA = getAssociatedTokenAddressSync(mintA.publicKey, signer.publicKey, false);
        const depositor1AccountB = getAssociatedTokenAddressSync(mintB.publicKey, signer.publicKey, false);

        try {
            await createAssociatedTokenAccount(connection, signer, mintA.publicKey, signer.publicKey);
        } catch (err) {
        }
        try {
            await createAssociatedTokenAccount(connection, signer, mintB.publicKey, signer.publicKey);
        } catch (err) {
        }

        await mintTo(connection, signer, mintA.publicKey, depositor1AccountA, signer, initialAmountA.toNumber());
        await mintTo(connection, signer, mintB.publicKey, depositor1AccountB, signer, initialAmountB.toNumber());

        await program.methods.addLiquidity(initialAmountA, initialAmountB).accounts({
            pool: poolPda,
            mintA: mintA.publicKey,
            mintB: mintB.publicKey,
            depositor: signer.publicKey,
            depositorAccountA: depositor1AccountA,
            depositorAccountB: depositor1AccountB,
            payer: signer.publicKey,
        }).signers([signer]).rpc({commitment: "confirmed"});

        const poolAccountABefore = await getAccount(connection, poolAccountA);
        const poolAccountBBefore = await getAccount(connection, poolAccountB);
        const mintLiquidityBefore = await getMint(connection, mintLiquidityPda);

        const reserveA = new anchor.BN(poolAccountABefore.amount.toString());
        const reserveB = new anchor.BN(poolAccountBBefore.amount.toString());
        const totalLpBefore = new anchor.BN(mintLiquidityBefore.supply.toString());

        const amountA2 = new anchor.BN(50).mul(DECIMALS);
        const amountB2 = new anchor.BN(200).mul(DECIMALS);

        const requiredB = amountA2.mul(reserveB).div(reserveA);
        const requiredA = amountB2.mul(reserveA).div(reserveB);

        assert.isTrue(amountA2.lt(requiredA), `amountA2 (${amountA2.toString()}) should be less than requiredA (${requiredA.toString()})`);
        assert.isTrue(amountB2.gte(requiredB), `amountB2 (${amountB2.toString()}) should be >= requiredB (${requiredB.toString()})`);

        await mintTo(connection, signer, mintA.publicKey, depositor1AccountA, signer, amountA2.toNumber());
        await mintTo(connection, signer, mintB.publicKey, depositor1AccountB, signer, amountB2.toNumber());

        await program.methods.addLiquidity(amountA2, amountB2).accounts({
            pool: poolPda,
            mintA: mintA.publicKey,
            mintB: mintB.publicKey,
            depositor: signer.publicKey,
            depositorAccountA: depositor1AccountA,
            depositorAccountB: depositor1AccountB,
            payer: signer.publicKey,
        }).signers([signer]).rpc({commitment: "confirmed"});

        const poolAccountAAfter = await getAccount(connection, poolAccountA);
        const poolAccountBAfter = await getAccount(connection, poolAccountB);
        const mintLiquidityAfter = await getMint(connection, mintLiquidityPda);
        const depositor1AccountLiquidity = getAssociatedTokenAddressSync(mintLiquidityPda, signer.publicKey, false);
        const lpAccount2Total = await getAccount(connection, depositor1AccountLiquidity);

        const expectedUsedA = amountA2;
        const expectedUsedB = requiredB;

        const lpFromA2 = expectedUsedA.mul(totalLpBefore).div(reserveA);
        const lpFromB2 = expectedUsedB.mul(totalLpBefore).div(reserveB);
        const expectedLp2 = lpFromA2.lt(lpFromB2) ? lpFromA2 : lpFromB2;

        assert.strictEqual(mintLiquidityAfter.supply.toString(), totalLpBefore.add(expectedLp2).toString(), `Total LP should be ${totalLpBefore.add(expectedLp2).toString()} but was ${mintLiquidityAfter.supply.toString()}`);
        assert.strictEqual(poolAccountAAfter.amount.toString(), reserveA.add(expectedUsedA).toString(), `Pool A should be ${reserveA.add(expectedUsedA).toString()} but was ${poolAccountAAfter.amount.toString()}`);
        assert.strictEqual(poolAccountBAfter.amount.toString(), reserveB.add(expectedUsedB).toString(), `Pool B should be ${reserveB.add(expectedUsedB).toString()} but was ${poolAccountBAfter.amount.toString()}`);
    });

    it("Add liquidity when amount_b exactly equals required_b", async () => {
        const ammIndex10 = 209;
        const {ammPda} = await createAmm(program, signer, admin1.publicKey, fee, ammIndex10);
        const {
            poolPda,
            mintLiquidityPda,
            poolAccountA,
            poolAccountB
        } = await createPool(program, signer, ammPda, mintA.publicKey, mintB.publicKey);

        const initialAmountA = new anchor.BN(100).mul(DECIMALS);
        const initialAmountB = new anchor.BN(100).mul(DECIMALS);

        const depositor1AccountA = getAssociatedTokenAddressSync(mintA.publicKey, signer.publicKey, false);
        const depositor1AccountB = getAssociatedTokenAddressSync(mintB.publicKey, signer.publicKey, false);

        try {
            await createAssociatedTokenAccount(connection, signer, mintA.publicKey, signer.publicKey);
        } catch (err) {
        }
        try {
            await createAssociatedTokenAccount(connection, signer, mintB.publicKey, signer.publicKey);
        } catch (err) {
        }

        await mintTo(connection, signer, mintA.publicKey, depositor1AccountA, signer, initialAmountA.toNumber());
        await mintTo(connection, signer, mintB.publicKey, depositor1AccountB, signer, initialAmountB.toNumber());

        await program.methods.addLiquidity(initialAmountA, initialAmountB).accounts({
            pool: poolPda,
            mintA: mintA.publicKey,
            mintB: mintB.publicKey,
            depositor: signer.publicKey,
            depositorAccountA: depositor1AccountA,
            depositorAccountB: depositor1AccountB,
            payer: signer.publicKey,
        }).signers([signer]).rpc({commitment: "confirmed"});

        const poolAccountABefore = await getAccount(connection, poolAccountA);
        const poolAccountBBefore = await getAccount(connection, poolAccountB);
        const mintLiquidityBefore = await getMint(connection, mintLiquidityPda);

        const reserveA = new anchor.BN(poolAccountABefore.amount.toString());
        const reserveB = new anchor.BN(poolAccountBBefore.amount.toString());
        const totalLpBefore = new anchor.BN(mintLiquidityBefore.supply.toString());

        const amountA2 = new anchor.BN(200).mul(DECIMALS);
        const requiredB = amountA2.mul(reserveB).div(reserveA);
        const amountB2 = requiredB;

        await mintTo(connection, signer, mintA.publicKey, depositor1AccountA, signer, amountA2.toNumber());
        await mintTo(connection, signer, mintB.publicKey, depositor1AccountB, signer, amountB2.toNumber());

        await program.methods.addLiquidity(amountA2, amountB2).accounts({
            pool: poolPda,
            mintA: mintA.publicKey,
            mintB: mintB.publicKey,
            depositor: signer.publicKey,
            depositorAccountA: depositor1AccountA,
            depositorAccountB: depositor1AccountB,
            payer: signer.publicKey,
        }).signers([signer]).rpc({commitment: "confirmed"});

        const poolAccountAAfter = await getAccount(connection, poolAccountA);
        const poolAccountBAfter = await getAccount(connection, poolAccountB);
        const mintLiquidityAfter = await getMint(connection, mintLiquidityPda);

        const expectedUsedA = amountA2;
        const expectedUsedB = requiredB;

        const lpFromA2 = expectedUsedA.mul(totalLpBefore).div(reserveA);
        const lpFromB2 = expectedUsedB.mul(totalLpBefore).div(reserveB);
        const expectedLp2 = lpFromA2.lt(lpFromB2) ? lpFromA2 : lpFromB2;

        assert.strictEqual(mintLiquidityAfter.supply.toString(), totalLpBefore.add(expectedLp2).toString(), `Total LP should be ${totalLpBefore.add(expectedLp2).toString()} but was ${mintLiquidityAfter.supply.toString()}`);
        assert.strictEqual(poolAccountAAfter.amount.toString(), reserveA.add(expectedUsedA).toString(), `Pool A should be ${reserveA.add(expectedUsedA).toString()} but was ${poolAccountAAfter.amount.toString()}`);
        assert.strictEqual(poolAccountBAfter.amount.toString(), reserveB.add(expectedUsedB).toString(), `Pool B should be ${reserveB.add(expectedUsedB).toString()} but was ${poolAccountBAfter.amount.toString()}`);
    });

    it("Add liquidity when amount_a exactly equals required_a", async () => {
        const ammIndex11 = 210;
        const {ammPda} = await createAmm(program, signer, admin1.publicKey, fee, ammIndex11);
        const {
            poolPda,
            mintLiquidityPda,
            poolAccountA,
            poolAccountB
        } = await createPool(program, signer, ammPda, mintA.publicKey, mintB.publicKey);

        const initialAmountA = new anchor.BN(100).mul(DECIMALS);
        const initialAmountB = new anchor.BN(100).mul(DECIMALS);

        const depositor1AccountA = getAssociatedTokenAddressSync(mintA.publicKey, signer.publicKey, false);
        const depositor1AccountB = getAssociatedTokenAddressSync(mintB.publicKey, signer.publicKey, false);

        try {
            await createAssociatedTokenAccount(connection, signer, mintA.publicKey, signer.publicKey);
        } catch (err) {
        }
        try {
            await createAssociatedTokenAccount(connection, signer, mintB.publicKey, signer.publicKey);
        } catch (err) {
        }

        await mintTo(connection, signer, mintA.publicKey, depositor1AccountA, signer, initialAmountA.toNumber());
        await mintTo(connection, signer, mintB.publicKey, depositor1AccountB, signer, initialAmountB.toNumber());

        await program.methods.addLiquidity(initialAmountA, initialAmountB).accounts({
            pool: poolPda,
            mintA: mintA.publicKey,
            mintB: mintB.publicKey,
            depositor: signer.publicKey,
            depositorAccountA: depositor1AccountA,
            depositorAccountB: depositor1AccountB,
            payer: signer.publicKey,
        }).signers([signer]).rpc({commitment: "confirmed"});

        const poolAccountABefore = await getAccount(connection, poolAccountA);
        const poolAccountBBefore = await getAccount(connection, poolAccountB);
        const mintLiquidityBefore = await getMint(connection, mintLiquidityPda);

        const reserveA = new anchor.BN(poolAccountABefore.amount.toString());
        const reserveB = new anchor.BN(poolAccountBBefore.amount.toString());
        const totalLpBefore = new anchor.BN(mintLiquidityBefore.supply.toString());

        const amountB2 = new anchor.BN(200).mul(DECIMALS);
        const requiredA = amountB2.mul(reserveA).div(reserveB);
        const amountA2 = requiredA;

        await mintTo(connection, signer, mintA.publicKey, depositor1AccountA, signer, amountA2.toNumber());
        await mintTo(connection, signer, mintB.publicKey, depositor1AccountB, signer, amountB2.toNumber());

        await program.methods.addLiquidity(amountA2, amountB2).accounts({
            pool: poolPda,
            mintA: mintA.publicKey,
            mintB: mintB.publicKey,
            depositor: signer.publicKey,
            depositorAccountA: depositor1AccountA,
            depositorAccountB: depositor1AccountB,
            payer: signer.publicKey,
        }).signers([signer]).rpc({commitment: "confirmed"});

        const poolAccountAAfter = await getAccount(connection, poolAccountA);
        const poolAccountBAfter = await getAccount(connection, poolAccountB);
        const mintLiquidityAfter = await getMint(connection, mintLiquidityPda);

        const expectedUsedA = requiredA;
        const expectedUsedB = amountB2;

        const lpFromA2 = expectedUsedA.mul(totalLpBefore).div(reserveA);
        const lpFromB2 = expectedUsedB.mul(totalLpBefore).div(reserveB);
        const expectedLp2 = lpFromA2.lt(lpFromB2) ? lpFromA2 : lpFromB2;

        assert.strictEqual(mintLiquidityAfter.supply.toString(), totalLpBefore.add(expectedLp2).toString(), `Total LP should be ${totalLpBefore.add(expectedLp2).toString()} but was ${mintLiquidityAfter.supply.toString()}`);
        assert.strictEqual(poolAccountAAfter.amount.toString(), reserveA.add(expectedUsedA).toString(), `Pool A should be ${reserveA.add(expectedUsedA).toString()} but was ${poolAccountAAfter.amount.toString()}`);
        assert.strictEqual(poolAccountBAfter.amount.toString(), reserveB.add(expectedUsedB).toString(), `Pool B should be ${reserveB.add(expectedUsedB).toString()} but was ${poolAccountBAfter.amount.toString()}`);
    });

    it("Add liquidity with minimal amounts (1 token each)", async () => {
        const ammIndex12 = 211;
        const {ammPda} = await createAmm(program, signer, admin1.publicKey, fee, ammIndex12);
        const {poolPda, mintLiquidityPda} = await createPool(program, signer, ammPda, mintA.publicKey, mintB.publicKey);

        const depositorAccountA = getAssociatedTokenAddressSync(mintA.publicKey, signer.publicKey, false);
        const depositorAccountB = getAssociatedTokenAddressSync(mintB.publicKey, signer.publicKey, false);
        const depositorAccountLiquidity = getAssociatedTokenAddressSync(mintLiquidityPda, signer.publicKey, false);

        try {
            await createAssociatedTokenAccount(connection, signer, mintA.publicKey, signer.publicKey);
        } catch (err) {
        }
        try {
            await createAssociatedTokenAccount(connection, signer, mintB.publicKey, signer.publicKey);
        } catch (err) {
        }

        const amountA = new anchor.BN(1);
        const amountB = new anchor.BN(1);

        await mintTo(connection, signer, mintA.publicKey, depositorAccountA, signer, amountA.toNumber());
        await mintTo(connection, signer, mintB.publicKey, depositorAccountB, signer, amountB.toNumber());

        await program.methods.addLiquidity(amountA, amountB).accounts({
            pool: poolPda,
            mintA: mintA.publicKey,
            mintB: mintB.publicKey,
            depositor: signer.publicKey,
            depositorAccountA: depositorAccountA,
            depositorAccountB: depositorAccountB,
            payer: signer.publicKey,
        }).signers([signer]).rpc({commitment: "confirmed"});

        const lpAccount = await getAccount(connection, depositorAccountLiquidity);
        const product = amountA.mul(amountB);
        const expectedLp = new anchor.BN(Math.floor(Math.sqrt(Number(product))));
        assert.strictEqual(lpAccount.amount.toString(), expectedLp.toString(), `LP amount should be ${expectedLp.toString()} but was ${lpAccount.amount.toString()}`);
        assert.isTrue(lpAccount.amount > 0, "LP amount should be greater than zero");
    });
});

