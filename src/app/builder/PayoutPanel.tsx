import { useEffect, useState } from "react";
import { Box, Flex, Text } from "@chakra-ui/react";
import { Button, TextField } from "@mui/material";
import { isAddress, type Address, type Hex } from "viem";
import { hashParams } from "../../engine/hash";
import { ausdBalance, claimLink, connectSponsor, EXPLORER, fmtAusd, payRun, requestTestAusd, ROUTER, AUSD_DECIMALS } from "../../chain/router";
import { parseUnits } from "viem";
import type { Snapshot } from "./runConsortium";
import type { Exchange } from "./useBuilder";
import { POOL_AUSD } from "./BuilderResults";

type Sponsor = Awaited<ReturnType<typeof connectSponsor>>;
const ISSUED_KEY = "tessera-claim-links";

/** Keep issued claim links in this browser too, so a sponsor can't lose an exchange's payout by closing the tab. */
function remember(links: { name: string; link: string; tx: string }[]) {
  try {
    const prev = JSON.parse(localStorage.getItem(ISSUED_KEY) ?? "[]");
    localStorage.setItem(ISSUED_KEY, JSON.stringify([...links, ...prev].slice(0, 50)));
  } catch {
    /* storage unavailable: the links are still shown on screen */
  }
}

export default function PayoutPanel({ snap, exchanges, params }: { snap: Snapshot; exchanges: Exchange[]; params: Float64Array | null }) {
  const [amount, setAmount] = useState(String(POOL_AUSD));
  const [sponsor, setSponsor] = useState<Sponsor | null>(null);
  const [balance, setBalance] = useState<bigint | null>(null);
  const [step, setStep] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [paid, setPaid] = useState<{ tx: Hex; links: { name: string; link: string }[] } | null>(null);

  useEffect(() => setPaid(null), [params]);
  if (snap.phase !== "done" || !snap.payoutBps || !params) return null;

  const rows = snap.members.map((m, lab) => ({ m, bps: snap.payoutBps![lab], ex: exchanges.find((e) => e.id === m.id) }));
  const payees = rows.filter((r) => r.bps > 0);
  const missing = payees.filter((r) => !r.ex || (r.ex.payout.kind === "address" && !isAddress(r.ex.payout.address)));
  const destOf = (ex: Exchange): Address => (ex.payout.kind === "claim" ? ex.payout.wallet.address : (ex.payout.address as Address));
  let units = 0n;
  try {
    units = parseUnits(amount || "0", AUSD_DECIMALS);
  } catch {
    units = 0n;
  }

  const run = async (fn: () => Promise<void>) => {
    setErr(null);
    try {
      await fn();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setErr(msg.split("\n")[0].slice(0, 220));
    } finally {
      setStep(null);
    }
  };
  const connect = () => run(async () => {
    setStep("Connect your wallet…");
    const s = await connectSponsor();
    setSponsor(s);
    setBalance(await ausdBalance(s.account));
  });
  const faucet = () => run(async () => {
    if (!sponsor) return;
    setStep("Requesting 10,000 test AUSD from Agora's faucet…");
    await requestTestAusd(sponsor);
    setBalance(await ausdBalance(sponsor.account));
  });
  const pay = () => run(async () => {
    if (!sponsor) return;
    const tx = await payRun(sponsor, {
      runRef: hashParams(params),
      amount,
      recipients: rows.map((r) => (r.ex ? destOf(r.ex) : ("0x000000000000000000000000000000000000dEaD" as Address))),
      bps: rows.map((r) => r.bps),
      gasDrop: payees.flatMap((r) => (r.ex?.payout.kind === "claim" ? [r.ex.payout.wallet.address] : [])),
    }, setStep);
    const links = payees.flatMap((r) => (r.ex?.payout.kind === "claim" ? [{ name: r.m.name, link: claimLink(r.ex.payout.wallet, r.m.name) }] : []));
    remember(links.map((l) => ({ ...l, tx })));
    setPaid({ tx, links });
    setBalance(await ausdBalance(sponsor.account));
  });

  return (
    <Box mt={6} p={6} borderRadius="16px" bg="var(--panel)" border="1px solid var(--green)">
      <Text fontSize="11px" letterSpacing=".12em" fontWeight={700} color="var(--green)">PAY THEM FOR REAL</Text>
      <Text fontSize="20px" fontWeight={700} mt={1}>Send this run's payouts in AUSD, even to exchanges with no wallet</Text>
      <Text fontSize="13px" color="var(--ink-2)" mt={1} lineHeight={1.6}>
        One transaction from your wallet pays every exchange its share through TesseraPayoutRouter on Ethereum Sepolia.
        Exchanges without a wallet are paid into a claim wallet (plus a little ETH for gas) and get a claim link: whoever opens it withdraws to any address.
        Compromised exchanges get nothing.
      </Text>

      <Box mt={3}>
        {rows.map(({ m, bps, ex }) => (
          <Flex key={m.id} justify="space-between" py={2} borderBottom="1px solid var(--line)" fontSize="13px" gap={3} wrap="wrap">
            <Text fontWeight={650} minW="140px">{m.name}</Text>
            <Text color="var(--muted)" flex={1}>
              {bps === 0 ? "earns nothing (rejected)" : !ex ? "removed from the market" : ex.payout.kind === "claim" ? "claim link (no wallet needed)" : isAddress(ex.payout.address) ? `wallet ${ex.payout.address.slice(0, 6)}…${ex.payout.address.slice(-4)}` : "needs a valid address (edit the exchange)"}
            </Text>
            <Text fontWeight={700} color={bps === 0 ? "#c2410c" : undefined}>{fmtAusd((units * BigInt(bps)) / 10000n)}</Text>
          </Flex>
        ))}
      </Box>

      {!paid && (
        <Flex mt={4} gap={3} align="center" wrap="wrap">
          <TextField size="small" label="Pool (AUSD)" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} sx={{ width: 140 }} />
          {!sponsor ? (
            <Button variant="contained" disableElevation onClick={connect} disabled={!!step}
              sx={{ textTransform: "none", borderRadius: "10px", bgcolor: "var(--ink)" }}>Connect wallet (Sepolia)</Button>
          ) : (
            <>
              <Text fontSize="13px" color="var(--ink-2)">{sponsor.account.slice(0, 6)}…{sponsor.account.slice(-4)} · {balance === null ? "…" : fmtAusd(balance)}</Text>
              {balance !== null && balance < units && (
                <Button variant="outlined" onClick={faucet} disabled={!!step} sx={{ textTransform: "none", borderRadius: "10px" }}>Get 10,000 test AUSD</Button>
              )}
              <Button variant="contained" disableElevation onClick={pay} disabled={!!step || units === 0n || missing.length > 0 || (balance !== null && balance < units)}
                sx={{ textTransform: "none", borderRadius: "10px", bgcolor: "var(--green)", "&:hover": { bgcolor: "#4f7a3d" } }}>
                Pay {payees.length} exchange{payees.length === 1 ? "" : "s"} {fmtAusd(units)}
              </Button>
            </>
          )}
        </Flex>
      )}
      {step && <Text fontSize="13px" color="var(--muted)" mt={2}>{step}</Text>}
      {err && <Text fontSize="13px" color="#c2410c" mt={2}>{err}</Text>}
      {missing.length > 0 && <Text fontSize="12px" color="#c2410c" mt={2}>Add a valid wallet address for {missing.map((r) => r.m.name).join(", ")}, or switch it to a claim link.</Text>}

      {paid && (
        <Box mt={4}>
          <Text fontSize="15px" fontWeight={700} color="var(--green)">
            Paid. <a href={`${EXPLORER}/tx/${paid.tx}`} target="_blank" rel="noreferrer" style={{ color: "var(--green)" }}>View the payout on Etherscan ↗</a>
          </Text>
          {paid.links.length > 0 && (
            <>
              <Text fontSize="13px" color="var(--ink-2)" mt={2}>Send each exchange its claim link (anyone holding it can withdraw, so share it privately):</Text>
              {paid.links.map((l) => (
                <Flex key={l.link} align="center" gap={2} mt={2} wrap="wrap">
                  <Text fontSize="13px" fontWeight={650} minW="140px">{l.name}</Text>
                  <Button size="small" variant="outlined" sx={{ textTransform: "none" }} onClick={() => void navigator.clipboard.writeText(l.link)}>Copy claim link</Button>
                  <Button size="small" sx={{ textTransform: "none" }} href={l.link} target="_blank">Open</Button>
                </Flex>
              ))}
            </>
          )}
        </Box>
      )}
      <Text fontSize="11px" color="var(--muted)" mt={3}>
        Router: <a href={`${EXPLORER}/address/${ROUTER.router}`} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>{ROUTER.router.slice(0, 6)}…{ROUTER.router.slice(-4)}</a> · AUSD is Agora's dollar stablecoin (testnet).
      </Text>
    </Box>
  );
}
