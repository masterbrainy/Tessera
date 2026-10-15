import { Box, Grid, Text } from "@chakra-ui/react";

// One mechanism, many markets: wherever private data is valuable but can't be shared.
const MARKETS: [string, string, string, boolean][] = [
  ["Crypto fraud & scams", "Exchanges, wallets, crypto payment apps", "Scam waves cash out through many venues; each one sees a slice. Together they see the pattern.", true],
  ["Card & payments fraud", "Banks, fintechs, merchants", "Fraud rings hit many issuers at once; no single one sees the whole ring.", false],
  ["Anti-money-laundering", "Exchanges, OTC desks, banks", "Laundering routes hop between institutions to stay under each one's radar.", false],
  ["Credit risk", "Lenders, BNPL, neobanks", "Thin-file borrowers look different at every lender.", false],
];

export default function Markets() {
  return (
    <Grid templateColumns={{ base: "1fr", md: "repeat(4, 1fr)" }} gap={3} mb={6}>
      {MARKETS.map(([name, who, why, live]) => (
        <Box key={name} p={4} borderRadius="14px" bg={live ? "var(--accent-soft)" : "var(--panel)"} border="1px solid"
          borderColor={live ? "var(--accent)" : "var(--line)"} opacity={live ? 1 : 0.8}>
          <Text fontSize="10px" letterSpacing=".12em" fontWeight={750} color={live ? "var(--accent)" : "var(--muted)"}>
            {live ? "LIVE MARKET · TRY IT BELOW" : "SAME MECHANISM · NEXT"}
          </Text>
          <Text fontSize="15px" fontWeight={700} mt={1}>{name}</Text>
          <Text fontSize="12px" color="var(--ink-2)" mt={0.5}>{who}</Text>
          <Text fontSize="12px" color="var(--muted)" mt={1} lineHeight={1.5}>{why}</Text>
        </Box>
      ))}
    </Grid>
  );
}
