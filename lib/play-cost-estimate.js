import { formatEther, parseEther } from 'viem';
import { apechain } from './constants.js';
import { prepareGameTransaction } from './games/index.js';
import { getConfiguredGameVrfFeeWei } from './loop-estimate.js';
import { estimateGasUnits } from './gas-estimates.js';

// Planning only: no signer, history entry, transaction, or accounting mutation.
export async function estimatePlayCosts({ publicClient, gameEntry, config = {},
  amountApe = null, account = null, gasUnits = null, additionalReserveApe = '0',
  cacheFile, now, prepare = prepareGameTransaction }) {
  for (const [label, value] of [['additionalReserveApe', additionalReserveApe], ['amountApe', amountApe]]) {
    if (value != null && /\.\d{19}/.test(String(value))) {
      throw new Error(`${label} supports at most 18 decimal places.`);
    }
  }
  const reserveWei = parseEther(String(additionalReserveApe));
  if (reserveWei < 0n) throw new Error('additionalReserveApe cannot be negative.');
  const chainId = publicClient.chain?.id ?? apechain.id;
  let effectiveConfig = config;
  let rpcGas = null;
  let feeWei;
  if (amountApe !== null && account) {
    // Configuration/wager validation errors must not be hidden by a fallback.
    const prepared = await prepare({ ...config, game: gameEntry.key, amountApe,
      account: typeof account === 'string' ? { address: account } : { address: account.address },
      publicClient });
    effectiveConfig = prepared.config;
    feeWei = prepared.transactionFeeWei;
    try { rpcGas = await publicClient.estimateContractGas(prepared.request); }
    catch { /* RPC can reject a hypothetical future stake; use receipts/fallback. */ }
  } else {
    feeWei = await getConfiguredGameVrfFeeWei({ publicClient, gameEntry, config });
  }
  const gasPriceWei = BigInt(await publicClient.getGasPrice());
  if (gasPriceWei < 0n) throw new Error('Gas price cannot be negative.');
  const gas = estimateGasUnits({ chainId, contract: gameEntry.contract,
    config: effectiveConfig, rpcGas, gasUnits, cacheFile, now });
  const gasWei = gas.gasUnits * gasPriceWei;
  const totalWei = BigInt(feeWei) + gasWei + reserveWei;
  return { estimated: true, transaction_fee_wei: feeWei.toString(), gas_wei: gasWei.toString(),
    reserve_wei: reserveWei.toString(), total_wei: totalWei.toString(), total_ape: formatEther(totalWei),
    gas_units: gas.gasUnits.toString(), gas_source: gas.source };
}
