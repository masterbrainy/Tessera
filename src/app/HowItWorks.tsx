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
  [Lock, "Data stays home", "Each exchange keeps its customers' transactions on its own infrastructure. In this demo that's a separate Web Worker per exchange; in node mode it's a separate server process per exchange talking HTTP."],
  [Hub, "Train locally, share weights", "Every round, the coordinator sends out the current model. Each exchange trains it on its own transactions with Adam, then sends back only the weight change: 33k numbers, no transactions."],
  [GppGood, "Screen out attackers", "The coordinator compares each update with the coordinate-wise median of all of them. Updates that point away (low cosine) or are abnormally large are dropped, and the rest are combined with a trimmed mean, so a minority can't drag the model."],
  [Functions, "Price every contribution", "The model is rebuilt from every subset of exchanges (2ⁿ coalitions) and scored on a shared validation window. Each exchange's exact Shapley value is what it adds on average, across all orders of joining."],
  [Link, "Settle onchain", "TesseraLedger on BSC testnet stores the config, a keccak fingerprint of the model after every round, and every contribution, then mints a cUSD reward pool to each exchange pro rata."],
  [Replay, "Anyone can audit", "All math on the training path is bit-exact across browsers and Node (custom exp/log, seeded RNG, fixed order). So anyone can replay a committed run from its config and get the same fingerprints. Payouts are verifiable, not trusted."],
] as const;

export default function HowItWorks({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth PaperProps={{ sx: { bgcolor: "var(--panel)", backgroundImage: "none", borderRadius: "22px" } }}>
      <DialogContent sx={{ p: { xs: 3, md: 5 } }}>
        <Flex justify="space-between" align="start">
          <Box>
            <Text fontSize="13px" letterSpacing=".12em" color="var(--muted)" fontWeight={700}>HOW TESSERA WORKS</Text>
            <Text fontSize="28px" fontWeight={800} mt={1} lineHeight={1.2}>Exchanges train one AML model together, without sharing a single customer's data</Text>
          </Box>
          <IconButton onClick={onClose} sx={{ color: "var(--muted)" }}>✕</IconButton>
        </Flex>
        <Text mt={3} fontSize="15px" color="var(--ink-2)" lineHeight={1.7}>
          Illicit crypto flow is fragmented: a scam wave cashes out through one venue, a ransomware crew through another. Each exchange sees only part of the pattern,
          and privacy law, competition and customer trust stop them from pooling data. Tessera lets them pool the learning instead, and pays each one for what it
          actually adds. The data is real: the Elliptic dataset of 46,564 labeled Bitcoin transactions.
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
