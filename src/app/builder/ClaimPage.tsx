import { useEffect, useState } from "react";
import { Box, Flex, Text } from "@chakra-ui/react";
import { Button, TextField } from "@mui/material";
import { formatEther, isAddress, type Address, type Hex } from "viem";
import { claimBalances, connectSponsor, EXPLORER, fmtAusd, withdrawAll, type ClaimWallet } from "../../chain/router";

/** What an exchange sees when it opens its claim link: its payout, and a way to move it anywhere. */
export default function ClaimPage({ wallet, name }: { wallet: ClaimWallet; name: string }) {
  const [bal, setBal] = useState<{ ausd: bigint; eth: bigint } | null>(null);
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [tx, setTx] = useState<Hex | null>(null);
  const [showKey, setShowKey] = useState(false);

  const refresh = () => claimBalances(wallet.address).then(setBal).catch((e) => setErr(String(e)));
  useEffect(() => void refresh(), [wallet.address]); // eslint-disable-line react-hooks/exhaustive-deps

  const withdraw = async () => {
    setErr(null);
    setBusy(true);
    try {
      setTx(await withdrawAll(wallet, to as Address));
      await refresh();
    } catch (e) {
      setErr((e instanceof Error ? e.message : String(e)).split("\n")[0]);
    } finally {
      setBusy(false);
    }
  };
  const fillFromWallet = async () => {
    try {
      setTo((await connectSponsor()).account);
    } catch (e) {
      setErr((e instanceof Error ? e.message : String(e)).split("\n")[0]);
    }
  };

  return (
    <Box maxW="720px">
      <div className="page-intro">
        <h1>{name}, your data earned this.</h1>
        <p>
          A Tessera data market paid you in AUSD for your contribution to a shared anti-money-laundering model. It was sent to a claim
          wallet that only this link can open. Move it to any address you control; you don't need to have had a wallet or any crypto before.
        </p>
      </div>
      <Box p={6} borderRadius="16px" bg="var(--panel)" border="1px solid var(--green)">
        <Text fontSize="11px" letterSpacing=".12em" fontWeight={700} color="var(--green)">YOUR PAYOUT</Text>
        <Text fontSize="40px" fontWeight={850} lineHeight={1.1} mt={1}>{bal ? fmtAusd(bal.ausd) : "…"}</Text>
        <Text fontSize="12px" color="var(--muted)" mt={1}>
          Claim wallet <a href={`${EXPLORER}/address/${wallet.address}`} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>{wallet.address.slice(0, 8)}…{wallet.address.slice(-6)} ↗</a>
          {bal ? ` · ${Number(formatEther(bal.eth)).toFixed(5)} ETH for gas (already included)` : ""} · Ethereum Sepolia
        </Text>

        {tx ? (
          <Text fontSize="15px" fontWeight={700} color="var(--green)" mt={4}>
            Withdrawn. <a href={`${EXPLORER}/tx/${tx}`} target="_blank" rel="noreferrer" style={{ color: "var(--green)" }}>View on Etherscan ↗</a>
          </Text>
        ) : (
          <>
            <Text fontSize="13px" fontWeight={650} mt={4}>Send it to</Text>
            <Flex gap={2} mt={1} wrap="wrap">
              <TextField size="small" sx={{ flex: 1, minWidth: 260 }} placeholder="0x… any wallet or exchange deposit address" value={to}
                error={!!to && !isAddress(to)} onChange={(e) => setTo(e.target.value.trim())} />
              <Button variant="outlined" onClick={() => void fillFromWallet()} sx={{ textTransform: "none", borderRadius: "10px" }}>Use my browser wallet</Button>
            </Flex>
            <Button variant="contained" disableElevation fullWidth sx={{ mt: 2, textTransform: "none", borderRadius: "10px", bgcolor: "var(--green)", "&:hover": { bgcolor: "#4f7a3d" } }}
              disabled={busy || !isAddress(to) || !bal || bal.ausd === 0n} onClick={() => void withdraw()}>
              {busy ? "Withdrawing…" : bal && bal.ausd === 0n ? "Nothing left to withdraw" : `Withdraw ${bal ? fmtAusd(bal.ausd) : ""}`}
            </Button>
          </>
        )}
        {err && <Text fontSize="13px" color="#c2410c" mt={2}>{err}</Text>}

        <Box mt={5} pt={4} borderTop="1px solid var(--line)">
          <Text fontSize="12px" color="var(--muted)" lineHeight={1.6}>
            Prefer to keep it as a wallet? Import this claim wallet's key into MetaMask or Rabby. Anyone with this link or key can move the funds, so keep both private.
          </Text>
          <Button size="small" sx={{ mt: 1, textTransform: "none" }} onClick={() => setShowKey((v) => !v)}>{showKey ? "Hide key" : "Show key"}</Button>
          {showKey && <Text fontSize="12px" mt={1} style={{ wordBreak: "break-all" }}><code>{wallet.key}</code></Text>}
        </Box>
      </Box>
    </Box>
  );
}
