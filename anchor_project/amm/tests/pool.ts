import * as anchor from "@coral-xyz/anchor";
import {Program} from "@coral-xyz/anchor";
import {Amm} from "../target/types/amm";
import {Keypair, PublicKey, SystemProgram} from "@solana/web3.js";
import {assert} from "chai";
import {
    ASSOCIATED_TOKEN_PROGRAM_ID,
    createAssociatedTokenAccount,
    getAccount,
    getAssociatedTokenAddressSync,
    getMint,
    mintTo,
    TOKEN_PROGRAM_ID
} from "@solana/spl-token";
import {airdrop, createAmm, createMintSafe, createPool, indexToSeed} from "./helper";

describe("pool", () => {
    anchor.setProvider(anchor.AnchorProvider.env());
    let connection = anchor.getProvider().connection;

    const program = anchor.workspace.amm as Program<Amm>;

    let signer = Keypair.generate();
    let signer2 = Keypair.generate();
    let admin1 = Keypair.generate();

    const mintA = Keypair.generate();
    const mintB = Keypair.generate();
    const mintC = Keypair.generate();
    const mintD = Keypair.generate();

    before(async () => {
        await airdrop(connection, signer.publicKey);
        await airdrop(connection, signer2.publicKey);
        await airdrop(connection, admin1.publicKey);

        await createMintSafe(connection, signer, signer.publicKey, 9, mintA);
        await createMintSafe(connection, signer, signer.publicKey, 9, mintB);
        await createMintSafe(connection, signer, signer.publicKey, 9, mintC);
        await createMintSafe(connection, signer, signer.publicKey, 9, mintD);
    });

    beforeEach(async () => {
        await airdrop(connection, signer.publicKey);
    });

    describe("create_pool", async () => {
        const ammIndex1 = 100;
        const ammIndex2 = 101;
        const fee = 100;

        it("Can create pool with different tokens", async () => {
            const {ammPda} = await createAmm(program, signer, admin1.publicKey, fee, ammIndex1);
            const {poolPda} = await createPool(program, signer, ammPda, mintA.publicKey, mintB.publicKey);

            const poolData = await program.account.ammPool.fetch(poolPda);
            assert.strictEqual(poolData.amm.toBase58(), ammPda.toBase58(), `Pool AMM should be "${ammPda.toBase58()}" but was "${poolData.amm.toBase58()}"`);
            assert.strictEqual(poolData.mintA.toBase58(), mintA.publicKey.toBase58(), `Pool mintA should be "${mintA.publicKey.toBase58()}" but was "${poolData.mintA.toBase58()}"`);
            assert.strictEqual(poolData.mintB.toBase58(), mintB.publicKey.toBase58(), `Pool mintB should be "${mintB.publicKey.toBase58()}" but was "${poolData.mintB.toBase58()}"`);
        });

        it("Cannot create pool with same tokens", async () => {
            const {ammPda} = await createAmm(program, signer, admin1.publicKey, fee, ammIndex2);

            const [poolPda] = PublicKey.findProgramAddressSync(
                [
                    Buffer.from("AMM_POOL"),
                    ammPda.toBuffer(),
                    mintC.publicKey.toBuffer(),
                    mintC.publicKey.toBuffer(),
                ],
                program.programId
            );

            const [mintLiquidityPda] = PublicKey.findProgramAddressSync(
                [
                    Buffer.from("AMM_MINT_LIQUIDITY"),
                    ammPda.toBuffer(),
                    mintC.publicKey.toBuffer(),
                    mintC.publicKey.toBuffer(),
                ],
                program.programId
            );

            const [authorityPda] = PublicKey.findProgramAddressSync(
                [
                    Buffer.from("AMM_POOL_AUTHORITY"),
                    ammPda.toBuffer(),
                    mintC.publicKey.toBuffer(),
                    mintC.publicKey.toBuffer(),
                ],
                program.programId
            );

            const poolAccountA = getAssociatedTokenAddressSync(
                mintC.publicKey,
                authorityPda,
                true
            );

            const poolAccountB = getAssociatedTokenAddressSync(
                mintC.publicKey,
                authorityPda,
                true
            );

            try {
                await program.methods.createPool().accounts({
                    amm: ammPda,
                    pool: poolPda,
                    mintLiquidity: mintLiquidityPda,
                    poolAccountA: poolAccountA,
                    poolAccountB: poolAccountB,
                    authority: authorityPda,
                    mintA: mintC.publicKey,
                    mintB: mintC.publicKey,
                    signer: signer.publicKey,
                    systemProgram: SystemProgram.programId,
                    tokenProgram: TOKEN_PROGRAM_ID,
                    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
                }).signers([signer]).rpc({commitment: "confirmed"});

                assert.fail("Expected transaction to fail");
            } catch (err) {
                const errorString = err.toString();
                assert.isTrue(
                    errorString.includes("Provided owner is not allowed"),
                    `Expected "Provided owner is not allowed" error, got: ${errorString}`
                );
            }
        });

        it("Cannot create pool without AMM", async () => {
            const fakeAmmPda = Keypair.generate().publicKey;

            const [poolPda] = PublicKey.findProgramAddressSync(
                [
                    Buffer.from("AMM_POOL"),
                    fakeAmmPda.toBuffer(),
                    mintD.publicKey.toBuffer(),
                    mintA.publicKey.toBuffer(),
                ],
                program.programId
            );

            const [mintLiquidityPda] = PublicKey.findProgramAddressSync(
                [
                    Buffer.from("AMM_MINT_LIQUIDITY"),
                    fakeAmmPda.toBuffer(),
                    mintD.publicKey.toBuffer(),
                    mintA.publicKey.toBuffer(),
                ],
                program.programId
            );

            const [authorityPda] = PublicKey.findProgramAddressSync(
                [
                    Buffer.from("AMM_POOL_AUTHORITY"),
                    fakeAmmPda.toBuffer(),
                    mintD.publicKey.toBuffer(),
                    mintA.publicKey.toBuffer(),
                ],
                program.programId
            );

            const poolAccountA = getAssociatedTokenAddressSync(
                mintD.publicKey,
                authorityPda,
                true
            );

            const poolAccountB = getAssociatedTokenAddressSync(
                mintA.publicKey,
                authorityPda,
                true
            );

            try {
                await program.methods.createPool().accounts({
                    amm: fakeAmmPda,
                    pool: poolPda,
                    mintLiquidity: mintLiquidityPda,
                    poolAccountA: poolAccountA,
                    poolAccountB: poolAccountB,
                    authority: authorityPda,
                    mintA: mintD.publicKey,
                    mintB: mintA.publicKey,
                    signer: signer.publicKey,
                    systemProgram: SystemProgram.programId,
                    tokenProgram: TOKEN_PROGRAM_ID,
                    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
                }).signers([signer]).rpc({commitment: "confirmed"});

                assert.fail("Expected transaction to fail");
            } catch (err) {
                const errorString = err.toString();
                assert.isTrue(
                    errorString.includes("AccountNotInitialized") || errorString.includes("3012"),
                    `Expected AccountNotInitialized error, got: ${errorString}`
                );
            }
        });
    });

    describe("add_liquidity", async () => {
        const ammIndex = 200;
        const fee = 100;

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

            const amountA = 100 * 10 ** 9;
            const amountB = 100 * 10 ** 9;

            await mintTo(connection, signer, mintA.publicKey, depositorAccountA, signer, amountA);
            await mintTo(connection, signer, mintB.publicKey, depositorAccountB, signer, amountB);

            const accountA = await getAccount(connection, depositorAccountA);
            const accountB = await getAccount(connection, depositorAccountB);
            assert.isTrue(accountA.amount >= amountA, "Depositor account A should have enough tokens");
            assert.isTrue(accountB.amount >= amountB, "Depositor account B should have enough tokens");

            await program.methods.addLiquidity(new anchor.BN(amountA), new anchor.BN(amountB)).accounts({
                pool: poolPda1,
                mintA: mintA.publicKey,
                mintB: mintB.publicKey,
                depositor: signer.publicKey,
                depositorAccountA: depositorAccountA,
                depositorAccountB: depositorAccountB,
                payer: signer.publicKey,
            }).signers([signer]).rpc({commitment: "confirmed"});

            const lpAccount = await getAccount(connection, depositorAccountLiquidity);
            const expectedLp = Math.floor(Math.sqrt(amountA * amountB));
            assert.strictEqual(Number(lpAccount.amount), expectedLp, `LP amount should be ${expectedLp} but was ${lpAccount.amount}`);
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

            const amountC = 50 * 10 ** 9;
            const amountA2 = 100 * 10 ** 9;

            await mintTo(connection, signer, mintC.publicKey, depositorAccountC, signer, amountC);
            await mintTo(connection, signer, mintA.publicKey, depositorAccountA2, signer, amountA2);

            const accountC = await getAccount(connection, depositorAccountC);
            const accountA2 = await getAccount(connection, depositorAccountA2);
            assert.isTrue(accountC.amount >= amountC, "Depositor account C should have enough tokens");
            assert.isTrue(accountA2.amount >= amountA2, "Depositor account A2 should have enough tokens");

            await program.methods.addLiquidity(new anchor.BN(amountC), new anchor.BN(amountA2)).accounts({
                pool: poolPda2,
                mintA: mintC.publicKey,
                mintB: mintA.publicKey,
                depositor: signer.publicKey,
                depositorAccountA: depositorAccountC,
                depositorAccountB: depositorAccountA2,
                payer: signer.publicKey,
            }).signers([signer]).rpc({commitment: "confirmed"});

            const lpAccount2 = await getAccount(connection, depositorAccountLiquidity2);
            const expectedLp2 = Math.floor(Math.sqrt(amountC * amountA2));
            assert.strictEqual(Number(lpAccount2.amount), expectedLp2, `LP amount should be ${expectedLp2} but was ${lpAccount2.amount}`);
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

            const amountA1 = 100 * 10 ** 9;
            const amountB1 = 100 * 10 ** 9;

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

            await createAssociatedTokenAccount(connection, signer, mintA.publicKey, signer.publicKey);
            await createAssociatedTokenAccount(connection, signer, mintB.publicKey, signer.publicKey);

            await mintTo(connection, signer, mintA.publicKey, depositor1AccountA, signer, amountA1);
            await mintTo(connection, signer, mintB.publicKey, depositor1AccountB, signer, amountB1);

            await program.methods.addLiquidity(new anchor.BN(amountA1), new anchor.BN(amountB1)).accounts({
                pool: poolPda,
                mintA: mintA.publicKey,
                mintB: mintB.publicKey,
                depositor: signer.publicKey,
                depositorAccountA: depositor1AccountA,
                depositorAccountB: depositor1AccountB,
                payer: signer.publicKey,
            }).signers([signer]).rpc({commitment: "confirmed"});

            const lpAccount1 = await getAccount(connection, depositor1AccountLiquidity);
            const expectedLp1 = Math.floor(Math.sqrt(amountA1 * amountB1));
            assert.strictEqual(Number(lpAccount1.amount), expectedLp1, `First user LP should be ${expectedLp1} but was ${lpAccount1.amount}`);

            const poolAccountABefore = await getAccount(connection, poolAccountA);
            const poolAccountBBefore = await getAccount(connection, poolAccountB);
            const mintLiquidityBefore = await getMint(connection, mintLiquidityPda);

            const amountA2 = 50 * 10 ** 9;
            const amountB2 = 50 * 10 ** 9;

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

            await mintTo(connection, signer, mintA.publicKey, depositor2AccountA, signer, amountA2);
            await mintTo(connection, signer, mintB.publicKey, depositor2AccountB, signer, amountB2);

            await program.methods.addLiquidity(new anchor.BN(amountA2), new anchor.BN(amountB2)).accounts({
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

            const reserveA = Number(poolAccountABefore.amount);
            const reserveB = Number(poolAccountBBefore.amount);
            const totalLpBefore = Number(mintLiquidityBefore.supply);

            const expectedLp2 = Math.min(
                Math.floor((amountA2 * totalLpBefore) / reserveA),
                Math.floor((amountB2 * totalLpBefore) / reserveB)
            );

            assert.strictEqual(Number(lpAccount2.amount), expectedLp2, `Second user LP should be ${expectedLp2} but was ${lpAccount2.amount}`);
            assert.strictEqual(Number(mintLiquidityAfter.supply), totalLpBefore + expectedLp2, `Total LP should be ${totalLpBefore + expectedLp2} but was ${mintLiquidityAfter.supply}`);
            assert.strictEqual(Number(poolAccountAAfter.amount), reserveA + amountA2, `Pool A should be ${reserveA + amountA2} but was ${poolAccountAAfter.amount}`);
            assert.strictEqual(Number(poolAccountBAfter.amount), reserveB + amountB2, `Pool B should be ${reserveB + amountB2} but was ${poolAccountBAfter.amount}`);
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

            const initialAmountA = 100 * 10 ** 9;
            const initialAmountB = 100 * 10 ** 9;

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

            await mintTo(connection, signer, mintA.publicKey, depositor1AccountA, signer, initialAmountA);
            await mintTo(connection, signer, mintB.publicKey, depositor1AccountB, signer, initialAmountB);

            await program.methods.addLiquidity(new anchor.BN(initialAmountA), new anchor.BN(initialAmountB)).accounts({
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

            const reserveA = Number(poolAccountABefore.amount);
            const reserveB = Number(poolAccountBBefore.amount);
            const totalLpBefore = Number(mintLiquidityBefore.supply);

            const amountA2 = 200 * 10 ** 9;
            const amountB2 = 50 * 10 ** 9;

            const requiredB = Math.floor((amountA2 * reserveB) / reserveA);
            const requiredA = Math.floor((amountB2 * reserveA) / reserveB);

            assert.isTrue(amountB2 < requiredB, `amountB2 (${amountB2}) should be less than requiredB (${requiredB})`);
            assert.isTrue(amountA2 >= requiredA, `amountA2 (${amountA2}) should be >= requiredA (${requiredA})`);

            await mintTo(connection, signer, mintA.publicKey, depositor1AccountA, signer, amountA2);
            await mintTo(connection, signer, mintB.publicKey, depositor1AccountB, signer, amountB2);

            await program.methods.addLiquidity(new anchor.BN(amountA2), new anchor.BN(amountB2)).accounts({
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
            const lpAccount2 = await getAccount(connection, depositor1AccountLiquidity);

            const expectedUsedA = requiredA;
            const expectedUsedB = amountB2;

            const expectedLp2 = Math.min(
                Math.floor((expectedUsedA * totalLpBefore) / reserveA),
                Math.floor((expectedUsedB * totalLpBefore) / reserveB)
            );

            assert.strictEqual(Number(lpAccount2.amount), expectedLp2, `LP should be ${expectedLp2} but was ${lpAccount2.amount}`);
            assert.strictEqual(Number(mintLiquidityAfter.supply), totalLpBefore + expectedLp2, `Total LP should be ${totalLpBefore + expectedLp2} but was ${mintLiquidityAfter.supply}`);
            assert.strictEqual(Number(poolAccountAAfter.amount), reserveA + expectedUsedA, `Pool A should be ${reserveA + expectedUsedA} but was ${poolAccountAAfter.amount}`);
            assert.strictEqual(Number(poolAccountBAfter.amount), reserveB + expectedUsedB, `Pool B should be ${reserveB + expectedUsedB} but was ${poolAccountBAfter.amount}`);
        });
    });
});

