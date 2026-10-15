import { Box, Flex, Text } from "@chakra-ui/react";
import { Dialog, DialogContent, IconButton } from "@mui/material";
import { motion } from "framer-motion";
import Lock from "@mui/icons-material/Lock";
import Hub from "@mui/icons-material/Hub";
import GppGood from "@mui/icons-material/GppGood";
import Functions from "@mui/icons-material/Functions";
import Link from "@mui/icons-material/Link";
import Replay from "@mui/icons-material/Replay";

const STEPS = [
  [Lock, "Data never leaves the contributor", "Each company keeps its customers' transactions on its own infrastructure. In this demo that's a separate Web Worker per exchange; in node mode it's a separate server process per exchange talking HTTP."],
  [Hub, "Train locally, share weights", "Every round, the coordinator sends out the current model. Each exchange trains it on its own transactions with Adam, then sends back only the weight change: 33k numbers, no transactions."],
  [GppGood, "Screen out attackers", "The coordinator compares each update with the coordinate-wise median of all of them. Updates that point away (low cosine) or are abnormally large are dropped, and the rest are combined with a trimmed mean, so a minority can't drag the model."],
  [Functions, "Price every dataset exactly", "The model is rebuilt from every subset of exchanges (2ⁿ coalitions) and scored on a shared validation window. Each exchange's exact Shapley value is what it adds on average, across all orders of joining."],
  [Link, "Settle onchain, pay in AUSD", "TesseraLedger on BSC testnet stores the config, a keccak fingerprint of the model after every round, and every contribution. TesseraPayouts then pays each committed run in real AUSD (Agora's dollar stablecoin, on Ethereum Sepolia) to each contributor pro rata, once per run, referencing the BSC run id and final model hash."],
  [Replay, "Anyone can audit", "All math on the training path is bit-exact across browsers and Node (custom exp/log, seeded RNG, fixed order). So anyone can replay a committed run from its config and get the same fingerprints. Payouts are verifiable, not trusted."],
] as const;

export default function HowItWorks({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth PaperProps={{ sx: { bgcolor: "var(--panel)", backgroundImage: "none", borderRadius: "22px" } }}>
      <DialogContent sx={{ p: { xs: 3, md: 5 } }}>
        <Flex justify="space-between" align="start">
          <Box>
            <Text fontSize="13px" letterSpacing=".12em" color="var(--muted)" fontWeight={700}>HOW TESSERA WORKS</Text>
            <Text fontSize="28px" fontWeight={800} mt={1} lineHeight={1.2}>A market that pays companies for what their private data is worth, without the data ever moving</Text>
          </Box>
          <IconButton onClick={onClose} sx={{ color: "var(--muted)" }}>✕</IconButton>
        </Flex>
        <Text mt={3} fontSize="15px" color="var(--ink-2)" lineHeight={1.7}>
          The most valuable data in finance is private: transaction histories, fraud cases, repayment records. Companies can't sell or share it (privacy law,
          competition, customer trust), so its value goes unused. Tessera turns it into an income stream: contributors train a shared model without sending a single
          record, each one is paid by exactly how much its data improved the model, and the finished model goes back to work, helping members stop scams
          and fraud. The first live market is crypto fraud: scam waves cash out through many exchanges, wallets and payment apps, and each one sees only a slice; the
          same mechanism works for card fraud, credit risk or insurance claims. Data here is real: the Elliptic dataset of 46,564 labeled Bitcoin transactions, where
          the fraud label covers Elliptic's illicit class (scams, Ponzi schemes, ransomware and other criminal flow).
        </Text>
        <Box mt={5} display="grid" gap={3}>
          {STEPS.map(([Icon, title, body], i) => (
            <motion.div key={title} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.08 }}>
              <Flex gap={4} p={4} borderRadius="14px" border="1px solid var(--line)">
                <Flex w="44px" h="44px" borderRadius="12px" align="center" justify="center" bg="var(--accent-soft)" flexShrink={0}>
                  <Icon sx={{ color: "var(--accent)", fontSize: 24 }} />
                </Flex>
                <Box>
                  <Text fontSize="16px" fontWeight={700}>{i + 1}. {title}</Text>
                  <Text fontSize="14px" color="var(--ink-2)" lineHeight={1.65} mt={1}>{body}</Text>
                </Box>
              </Flex>
            </motion.div>
          ))}
        </Box>
      </DialogContent>
    </Dialog>
  );
}
