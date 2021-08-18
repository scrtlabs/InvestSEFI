import {
  SigningCosmWasmClient,
  EnigmaUtils,
  Secp256k1Pen,
  pubkeyToAddress,
  encodeSecp256k1Pubkey,
} from "secretjs";
import { StdFee } from "secretjs/types/types";
import BigNumber from "bignumber.js";

(async () => {
  const seed = EnigmaUtils.GenerateNewSeed();
  const pen = await Secp256k1Pen.fromMnemonic(
    "cost member exercise evoke isolate gift cattle move bundle assume spell face balance lesson resemble orange bench surge now unhappy potato dress number acid"
  );
  const address = pubkeyToAddress(encodeSecp256k1Pubkey(pen.pubkey), "secret");
  const secretjs = new SigningCosmWasmClient(
    "https://bridge-api-manager.azure-api.net",
    address,
    (signBytes) => pen.sign(signBytes),
    seed
  );

  // let's say we want to invest SEFI in the SEFI-SSCRT pool

  const TOTAL_TOKEN0_TO_INVEST = 10_000_000; // TODO fetch
  const TOKEN0_TO_INVEST = new BigNumber(TOTAL_TOKEN0_TO_INVEST / 2); // TODO handle rounding

  // define our contracts
  const TOKEN0_CONTRACT = "secret15l9cqgz5uezgydrglaak5ahfac69kmx2qpd6xt"; // SEFI
  const TOKEN0_CONTRACT_HASH =
    "c7fe67b243dfedc625a28ada303434d6f5a46a3086e7d2b5063a814e9f9a379d";

  const TOKEN1_CONTRACT = "secret1k0jntykt7e4g3y88ltc60czgjuqdy4c9e8fzek"; // SSCRT
  const TOKEN1_CONTRACT_HASH =
    "af74387e276be8874f07bec3a87023ee49b0e7ebe08178c49d0a49c3c98ed60e";

  const PAIR_CONTRACT = "secret1rgky3ns9ua09rt059049yl0zqf3xjqxne7ezhp"; // SEFI-SSCRT
  const PAIR_CONTRACT_HASH =
    "0dfd06c7c3c482c14d36ba9826b83d164003f2b0bb302f222db72361e0927490";

  const LP_TOKEN = "secret1709qy2smh0r7jjac0qxfgjsqn7zpvgthsdz025"; // of SEFI-SSCRT
  const LP_TOKEN_HASH =
    "ea3df9d5e17246e4ef2f2e8071c91299852a07a84c4eb85007476338b7547ce8";

  const EARN_CONTRACT = "secret1097s3zmexc4mk9s2rdv3gs6r76x9dn9rmv86c7"; // of SEFI_SSCRT

  // it's faster to query both pool sizes via {pool:{}} and than do the swap and LP math here
  const poolAnswer: PoolAnswer = await secretjs.queryContractSmart(
    PAIR_CONTRACT,
    { pool: {} },
    null,
    PAIR_CONTRACT_HASH // optional, faster
  );

  const CURRENT_TOKEN0_POOL_SIZE = new BigNumber(
    poolAnswer.assets.find(
      (a) => a.info.token.contract_addr === TOKEN0_CONTRACT
    ).amount
  );
  const CURRENT_TOKEN1_POOL_SIZE = new BigNumber(
    poolAnswer.assets.find(
      (a) => a.info.token.contract_addr === TOKEN1_CONTRACT
    ).amount
  );

  // simulate the swap operation
  const {
    return_amount,
  }: {
    return_amount: BigNumber;
    spread_amount: BigNumber;
    commission_amount: BigNumber;
  } = compute_swap(
    CURRENT_TOKEN0_POOL_SIZE,
    CURRENT_TOKEN1_POOL_SIZE,
    TOKEN0_TO_INVEST
  );

  const TOKEN1_TO_INVEST = return_amount;

  // simulate the provide_liqudity operation
  const AFTER_SWAP_TOKEN0_POOL_SIZE =
    CURRENT_TOKEN0_POOL_SIZE.plus(TOKEN0_TO_INVEST);
  const AFTER_SWAP_TOKEN1_POOL_SIZE =
    CURRENT_TOKEN1_POOL_SIZE.minus(TOKEN1_TO_INVEST);
  const CURRENT_LP_TOKENS_TOTAL_SUPPLY = new BigNumber(poolAnswer.total_share);

  const EXPECTED_LP_TOKENS_AFTER_PROVIDE = BigNumber.min(
    TOKEN1_TO_INVEST.times(CURRENT_LP_TOKENS_TOTAL_SUPPLY).dividedToIntegerBy(
      AFTER_SWAP_TOKEN1_POOL_SIZE
    ),
    TOKEN0_TO_INVEST.times(CURRENT_LP_TOKENS_TOTAL_SUPPLY).dividedToIntegerBy(
      AFTER_SWAP_TOKEN0_POOL_SIZE
    )
  );

  // when setting expected_return=TOKEN1_TO_INVEST we force no more slippage during the tx
  // that's how we now know to LP TOKEN0_TO_INVEST SEFI + TOKEN1_TO_INVEST SSCRT
  // the transaction will fail if there's any slippage
  secretjs.multiExecute(
    [
      // 1st msg - swap half our SEFI for SSCRT
      // this will fail the entire tx if there's any slippage
      // ~ 500k gas
      {
        contractAddress: TOKEN0_CONTRACT,
        contractCodeHash: TOKEN0_CONTRACT_HASH, // optional, faster
        handleMsg: {
          send: {
            amount: TOKEN0_TO_INVEST.toFixed(),
            recipient: PAIR_CONTRACT,
            msg: btoa(
              JSON.stringify({
                swap: {
                  expected_return: TOKEN1_TO_INVEST.toFixed(),
                },
              })
            ),
          },
        },
      },
      // 2nd msg - allow the pair to spend the other half of our SEFI
      // this can be optimized away if we ask the user for a one-time allowance of UINT128_MAX = '340282366920938463463374607431768211454'
      // but than it's more clicks in the UI
      // ~ 100k gas
      {
        contractAddress: TOKEN0_CONTRACT,
        contractCodeHash: TOKEN0_CONTRACT_HASH, // optional, faster
        handleMsg: {
          increase_allowance: {
            spender: PAIR_CONTRACT,
            amount: TOKEN0_TO_INVEST.toFixed(),
          },
        },
      },
      // 3rd msg - allow the pair to spend our SSCRT
      // this can be optimized away if we ask the user for a one-time allowance of UINT128_MAX = '340282366920938463463374607431768211454'
      // but than it's more clicks in the UI
      // ~ 100k gas
      {
        contractAddress: TOKEN1_CONTRACT,
        contractCodeHash: TOKEN1_CONTRACT_HASH, // optional, faster
        handleMsg: {
          increase_allowance: {
            spender: PAIR_CONTRACT,
            amount: TOKEN1_TO_INVEST.toFixed(),
          },
        },
      },
      // 4th msg - LP the other half of our SEFI with the SSCRT we got from the swap
      // ~ 400k gas
      {
        contractAddress: PAIR_CONTRACT,
        contractCodeHash: PAIR_CONTRACT_HASH, // optional, faster
        handleMsg: {
          provide_liquidity: {
            assets: [
              {
                info: {
                  token: {
                    contract_addr: TOKEN0_CONTRACT,
                    token_code_hash: TOKEN0_CONTRACT_HASH,
                    viewing_key: "", // required but always ignored
                  },
                },
                amount: TOKEN0_TO_INVEST.toFixed(),
              },
              {
                info: {
                  token: {
                    contract_addr: TOKEN1_CONTRACT,
                    token_code_hash: TOKEN1_CONTRACT_HASH,
                    viewing_key: "", // required but always ignored
                  },
                },
                amount: TOKEN1_TO_INVEST.toFixed(),
              },
            ],
          },
        },
      },
      // 5th msg - invest the SEFI-SSCRT LP tokens in the rewards pool
      // this will fail the entire tx if we didn't get enough LP tokens as simulated in the previous msg
      {
        contractAddress: LP_TOKEN,
        contractCodeHash: LP_TOKEN_HASH,
        handleMsg: {
          send: {
            amount: EXPECTED_LP_TOKENS_AFTER_PROVIDE.toFixed(),
            recipient: EARN_CONTRACT,
            msg: btoa(JSON.stringify({ deposit: {} })),
          },
        },
      },
    ],
    "",
    getFeeForExecute(
      500_000 /* swap */ +
        100_000 /* allowance */ +
        100_000 /* allowance */ +
        400_000 /* provide */
    )
  );
})();

const gasPriceUscrt = 0.25;
export function getFeeForExecute(gas: number): StdFee {
  return {
    amount: [
      { amount: String(Math.floor(gas * gasPriceUscrt) + 1), denom: "uscrt" },
    ],
    gas: String(gas),
  };
}

type PoolAnswer = {
  assets: [
    {
      info: {
        token: {
          contract_addr: string;
          token_code_hash: string;
          viewing_key: "SecretSwap";
        };
      };
      amount: string;
    },
    {
      info: {
        token: {
          contract_addr: string;
          token_code_hash: string;
          viewing_key: "SecretSwap";
        };
      };
      amount: string;
    }
  ];
  total_share: string;
};

// Commission rate == 0.3%
const COMMISSION_RATE = new BigNumber(0.3 / 100);

// To reduce unnecessary queries, compute_swap is ported from here https://github.com/enigmampc/SecretSwap/blob/6135f0ad74a17cefacf4ac0e48497983b88dae91/contracts/secretswap_pair/src/contract.rs#L616-L636
export const compute_swap = (
  offer_pool: BigNumber,
  ask_pool: BigNumber,
  offer_amount: BigNumber
): {
  return_amount: BigNumber;
  spread_amount: BigNumber;
  commission_amount: BigNumber;
} => {
  // offer => ask
  // ask_amount = (ask_pool - cp / (offer_pool + offer_amount)) * (1 - commission_rate)
  const cp = offer_pool.multipliedBy(ask_pool);
  let return_amount = ask_pool.minus(
    cp.multipliedBy(new BigNumber(1).dividedBy(offer_pool.plus(offer_amount)))
  );

  // calculate spread & commission
  const spread_amount = offer_amount
    .multipliedBy(ask_pool.dividedBy(offer_pool))
    .minus(return_amount);
  const commission_amount = return_amount.multipliedBy(COMMISSION_RATE);

  // commission will be absorbed to pool
  return_amount = return_amount.minus(commission_amount);

  return { return_amount, spread_amount, commission_amount };
};

function btoa(binary: string): string {
  return Buffer.from(binary).toString("base64");
}
