// Simple ETH utility helpers (no external deps)
// Converts hex wei values from RPC into human-friendly ETH/GWEI strings.

export function hexToBigInt(hex) {
  try { return BigInt(hex); } catch { return 0n; }
}

export function weiToEth(weiBig) {
  try { return (Number(weiBig) / 1e18).toFixed(6); } catch { return '0.000000'; }
}

export function weiToGwei(weiBig) {
  try { return (Number(weiBig) / 1e9).toFixed(1); } catch { return '0.0'; }
}

export function hexWeiToEth(hex) {
  return weiToEth(hexToBigInt(hex));
}

export function hexWeiToGwei(hex) {
  return weiToGwei(hexToBigInt(hex));
}

export function formatFee(gasUsed, effectiveGasPrice) {
  if (!gasUsed || !effectiveGasPrice) return '';
  try {
    const feeEth = (gasUsed * effectiveGasPrice) / 1e18;
    return feeEth.toFixed(6);
  } catch { return ''; }
}
