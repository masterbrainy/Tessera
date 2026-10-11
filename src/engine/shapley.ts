/**
 * Exact Shapley values for a cooperative game over n players, given the utility
 * of every coalition (indexed by bitmask). phi_i = sum over S not containing i of
 * |S|!(n-|S|-1)!/n! * (U(S + i) - U(S)). Satisfies efficiency: sum(phi) = U(all) - U(empty).
 */
export function shapley(n: number, utility: (mask: number) => number): number[] {
  const full = 1 << n;
  const u = new Float64Array(full);
  for (let m = 0; m < full; m++) u[m] = utility(m);
  const fact = [1];
  for (let i = 1; i <= n; i++) fact[i] = fact[i - 1] * i;
  const phi = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    const bit = 1 << i;
    for (let m = 0; m < full; m++) {
      if (m & bit) continue;
      const s = popcount(m);
      phi[i] += ((fact[s] * fact[n - s - 1]) / fact[n]) * (u[m | bit] - u[m]);
    }
  }
  return phi;
}

export function popcount(m: number): number {
  let c = 0;
  while (m) {
    m &= m - 1;
    c++;
  }
  return c;
}
