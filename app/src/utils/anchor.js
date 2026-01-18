import { Connection, PublicKey } from "@solana/web3.js";
import { AnchorProvider, Program } from "@coral-xyz/anchor";
import idl from "../idl.json";

// The programId from the IDL (ensure this matches your deployed program!)
const programId = new PublicKey(idl.address);

export const getProgram = (connection, wallet) => {
    const provider = new AnchorProvider(connection, wallet, {
        preflightCommitment: "processed",
    });
    return new Program(idl, provider);
};
