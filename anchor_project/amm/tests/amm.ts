import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Amm } from "../target/types/amm";
import { Keypair, PublicKey, Connection } from "@solana/web3.js";
import { assert } from "chai";
import {airdrop, checkAmm, createAmm} from "./helper";

describe("amm", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  let connection: Connection = anchor.getProvider().connection;

  const program = anchor.workspace.amm as Program<Amm>;

  describe("create_amm", async () => {
    it("Is created!", async () => {
      const signer = Keypair.generate();
      const admin = Keypair.generate();
      const index = 1;
      const fee = 100;

      await airdrop(connection, signer.publicKey);
      await airdrop(connection, admin.publicKey);

      const { ammPda } = await createAmm(program, signer, admin.publicKey, fee, index);
      await checkAmm(program, ammPda, admin.publicKey, index, fee);
    });

    it("Can create 2 pools with different indices", async () => {
      const signer = Keypair.generate();
      const admin = Keypair.generate();
      const index1 = 10;
      const index2 = 11;
      const fee = 100;

      await airdrop(connection, signer.publicKey);
      await airdrop(connection, admin.publicKey);

      const { ammPda: ammPda1 } = await createAmm(program, signer, admin.publicKey, fee, index1);
      await checkAmm(program, ammPda1, admin.publicKey, index1, fee);

      const { ammPda: ammPda2 } = await createAmm(program, signer, admin.publicKey, fee, index2);
      await checkAmm(program, ammPda2, admin.publicKey, index2, fee);
    });

    it("Cannot create 2 pools with the same index", async () => {
      const signer = Keypair.generate();
      const admin = Keypair.generate();
      const index = 20;
      const fee = 100;

      await airdrop(connection, signer.publicKey);
      await airdrop(connection, admin.publicKey);

      const { ammPda } = await createAmm(program, signer, admin.publicKey, fee, index);
      await checkAmm(program, ammPda, admin.publicKey, index, fee);

      try {
        await createAmm(program, signer, admin.publicKey, fee, index);
        assert.fail("Expected transaction to fail");
      } catch (err) {
        assert.isTrue(err.toString().includes("already in use") || err.toString().includes("AccountDiscriminatorAlreadySet"), "Expected account already in use error");
      }
    });

    it("Can create AMM with maximum fee (9999)", async () => {
      const signer = Keypair.generate();
      const admin = Keypair.generate();
      const index = 30;
      const maxFee = 9999; // MAX_FEE_BPS = 10000, so max fee is 9999

      await airdrop(connection, signer.publicKey);
      await airdrop(connection, admin.publicKey);

      const { ammPda } = await createAmm(program, signer, admin.publicKey, maxFee, index);
      await checkAmm(program, ammPda, admin.publicKey, index, maxFee);
    });

    it("Cannot create AMM with fee equal to MAX_FEE_BPS (10000)", async () => {
      const signer = Keypair.generate();
      const admin = Keypair.generate();
      const index = 31;
      const invalidFee = 10000; // MAX_FEE_BPS = 10000, fee must be < 10000

      await airdrop(connection, signer.publicKey);
      await airdrop(connection, admin.publicKey);

      try {
        await createAmm(program, signer, admin.publicKey, invalidFee, index);
        assert.fail("Expected transaction to fail");
      } catch (err) {
        const errorString = err.toString();
        assert.isTrue(
          errorString.includes("InvalidFee") || errorString.includes("6000"),
          `Expected InvalidFee error, got: ${errorString}`
        );
      }
    });

    it("Cannot create AMM with fee greater than MAX_FEE_BPS", async () => {
      const signer = Keypair.generate();
      const admin = Keypair.generate();
      const index = 32;
      const invalidFee = 10001; // MAX_FEE_BPS = 10000, fee must be < 10000

      await airdrop(connection, signer.publicKey);
      await airdrop(connection, admin.publicKey);

      try {
        await createAmm(program, signer, admin.publicKey, invalidFee, index);
        assert.fail("Expected transaction to fail");
      } catch (err) {
        const errorString = err.toString();
        assert.isTrue(
          errorString.includes("InvalidFee") || errorString.includes("6000"),
          `Expected InvalidFee error, got: ${errorString}`
        );
      }
    });
  })
});
