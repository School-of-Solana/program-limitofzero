import { Connection, PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import {assert} from "chai";
import { Amm } from "../target/types/amm";
import { Program } from "@coral-xyz/anchor";
import { createMint, createAssociatedTokenAccount, getAccount, getAssociatedTokenAddressSync, getMint, mintTo } from "@solana/spl-token";
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";

export async function airdrop(connection: Connection, address: PublicKey, amount = 1_000_000_000) {
  await connection.confirmTransaction(await connection.requestAirdrop(address, amount), "confirmed");
}

export function indexToSeed(index: number) {
  const indexSeed = Buffer.alloc(2)
  indexSeed.writeInt16LE(index)
  return indexSeed;
}

export async function checkAmm(
    program: anchor.Program<Amm>,
    amm: PublicKey,
    admin: PublicKey,
    index: number,
    fee: number,
) {
  let ammData = await program.account.amm.fetch(amm);

  assert.strictEqual(ammData.admin.toBase58(), admin.toBase58(), `AMM admin should be "${admin.toBase58()}" but was "${ammData.admin.toBase58()}"`);
  assert.strictEqual(ammData.index, index, `AMM index should be ${index} but was ${ammData.index}`);
  assert.strictEqual(ammData.fee, fee, `AMM fee should be ${fee} but was ${ammData.fee}`);
}

export async function createMintSafe(
  connection: Connection,
  payer: Keypair,
  mintAuthority: PublicKey,
  decimals: number,
  keypair: Keypair
) {
  try {
    await createMint(connection, payer, mintAuthority, null, decimals, keypair);
  } catch (err) {
  }
}

export interface CreateAmmResult {
  ammPda: PublicKey;
}

export async function createAmm(
  program: anchor.Program<Amm>,
  signer: Keypair,
  adminAccount: PublicKey,
  fee: number,
  index: number
): Promise<CreateAmmResult> {
  const [ammPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("AMM"), indexToSeed(index)],
    program.programId
  );

  await program.methods.createAmm(fee, index).accounts({
    amm: ammPda,
    adminAccount: adminAccount,
    signer: signer.publicKey,
    systemProgram: SystemProgram.programId,
  }).signers([signer]).rpc({ commitment: "confirmed" });

  return { ammPda };
}

export interface CreatePoolResult {
  poolPda: PublicKey;
  mintLiquidityPda: PublicKey;
  authorityPda: PublicKey;
  poolAccountA: PublicKey;
  poolAccountB: PublicKey;
}

export async function createPool(
  program: anchor.Program<Amm>,
  signer: Keypair,
  ammPda: PublicKey,
  mintA: PublicKey,
  mintB: PublicKey
): Promise<CreatePoolResult> {
  const [poolPda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("AMM_POOL"),
      ammPda.toBuffer(),
      mintA.toBuffer(),
      mintB.toBuffer(),
    ],
    program.programId
  );

  const [mintLiquidityPda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("AMM_MINT_LIQUIDITY"),
      ammPda.toBuffer(),
      mintA.toBuffer(),
      mintB.toBuffer(),
    ],
    program.programId
  );

  const [authorityPda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("AMM_POOL_AUTHORITY"),
      ammPda.toBuffer(),
      mintA.toBuffer(),
      mintB.toBuffer(),
    ],
    program.programId
  );

  const poolAccountA = getAssociatedTokenAddressSync(
    mintA,
    authorityPda,
    true
  );

  const poolAccountB = getAssociatedTokenAddressSync(
    mintB,
    authorityPda,
    true
  );

  await program.methods.createPool().accounts({
    amm: ammPda,
    pool: poolPda,
    mintLiquidity: mintLiquidityPda,
    poolAccountA: poolAccountA,
    poolAccountB: poolAccountB,
    authority: authorityPda,
    mintA: mintA,
    mintB: mintB,
    signer: signer.publicKey,
    systemProgram: SystemProgram.programId,
    tokenProgram: TOKEN_PROGRAM_ID,
    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
  }).signers([signer]).rpc({ commitment: "confirmed" });

  return {
    poolPda,
    mintLiquidityPda,
    authorityPda,
    poolAccountA,
    poolAccountB,
  };
}

export interface AddLiquidityResult {
  lpAmount: anchor.BN;
}

export async function addLiquidity(
  program: Program<Amm>,
  connection: Connection,
  signer: Keypair,
  mintAuthority: Keypair,
  poolPda: PublicKey,
  mintA: PublicKey,
  mintB: PublicKey,
  mintLiquidityPda: PublicKey,
  amountA: anchor.BN,
  amountB: anchor.BN
): Promise<AddLiquidityResult> {
  const depositorAccountA = getAssociatedTokenAddressSync(mintA, signer.publicKey, false);
  const depositorAccountB = getAssociatedTokenAddressSync(mintB, signer.publicKey, false);
  const depositorAccountLiquidity = getAssociatedTokenAddressSync(mintLiquidityPda, signer.publicKey, false);

  try {
    await createAssociatedTokenAccount(connection, signer, mintA, signer.publicKey);
  } catch (err) {
    // Account might already exist
  }
  try {
    await createAssociatedTokenAccount(connection, signer, mintB, signer.publicKey);
  } catch (err) {
    // Account might already exist
  }

  await mintTo(connection, mintAuthority, mintA, depositorAccountA, mintAuthority, amountA.toNumber());
  await mintTo(connection, mintAuthority, mintB, depositorAccountB, mintAuthority, amountB.toNumber());

  await program.methods.addLiquidity(amountA, amountB).accounts({
    pool: poolPda,
    mintA: mintA,
    mintB: mintB,
    depositor: signer.publicKey,
    depositorAccountA: depositorAccountA,
    depositorAccountB: depositorAccountB,
    payer: signer.publicKey,
  }).signers([signer]).rpc({commitment: "confirmed"});

  const lpAccount = await getAccount(connection, depositorAccountLiquidity);
  return {lpAmount: new anchor.BN(lpAccount.amount.toString())};
}

export interface GetPoolReservesResult {
  reserveA: anchor.BN;
  reserveB: anchor.BN;
}

export async function getPoolReserves(
  connection: Connection,
  mintA: PublicKey,
  mintB: PublicKey,
  authorityPda: PublicKey
): Promise<GetPoolReservesResult> {
  const poolAccountA = await getAccount(connection, getAssociatedTokenAddressSync(mintA, authorityPda, true));
  const poolAccountB = await getAccount(connection, getAssociatedTokenAddressSync(mintB, authorityPda, true));

  return {
    reserveA: new anchor.BN(poolAccountA.amount.toString()),
    reserveB: new anchor.BN(poolAccountB.amount.toString())
  };
}

export interface WithdrawLiquidityResult {
  amountAOut: anchor.BN;
  amountBOut: anchor.BN;
}

export async function withdrawLiquidity(
  program: Program<Amm>,
  connection: Connection,
  signer: Keypair,
  poolPda: PublicKey,
  mintA: PublicKey,
  mintB: PublicKey,
  mintLiquidityPda: PublicKey,
  authorityPda: PublicKey,
  lpAmountToBurn: anchor.BN
): Promise<WithdrawLiquidityResult> {
  const depositorAccountLiquidity = getAssociatedTokenAddressSync(mintLiquidityPda, signer.publicKey, false);
  const depositorAccountA = getAssociatedTokenAddressSync(mintA, signer.publicKey, false);
  const depositorAccountB = getAssociatedTokenAddressSync(mintB, signer.publicKey, false);

  const poolAccountA = await getAccount(connection, getAssociatedTokenAddressSync(mintA, authorityPda, true));
  const poolAccountB = await getAccount(connection, getAssociatedTokenAddressSync(mintB, authorityPda, true));

  const reserveABefore = new anchor.BN(poolAccountA.amount.toString());
  const reserveBBefore = new anchor.BN(poolAccountB.amount.toString());
  const mintLiquidity = await getMint(connection, mintLiquidityPda);
  const totalLp = new anchor.BN(mintLiquidity.supply.toString());

  const expectedAmountAOut = lpAmountToBurn.mul(reserveABefore).div(totalLp);
  const expectedAmountBOut = lpAmountToBurn.mul(reserveBBefore).div(totalLp);

  await program.methods.withdrawLiquidity(lpAmountToBurn).accounts({
    pool: poolPda,
    mintA: mintA,
    mintB: mintB,
    mintLiquidity: mintLiquidityPda,
    depositor: signer.publicKey,
    depositorAccountLiquidity: depositorAccountLiquidity,
    depositorAccountA: depositorAccountA,
    depositorAccountB: depositorAccountB,
    payer: signer.publicKey,
  }).signers([signer]).rpc({commitment: "confirmed"});

  return {amountAOut: expectedAmountAOut, amountBOut: expectedAmountBOut};
}