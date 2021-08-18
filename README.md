Reinvest SEFI by swapping half for sSCRT, LPing it to the SEFI-SSCRT pair and depositing the LP tokens in the SEFI-SSCRT rewards pool

To make this work, put this in a local `.env` file:

```
MNEMONICS="mnemonics of your secret account"

TX_ENCRYPTION_SEED="string; optional seed to be able to decrypt txs until we fix secretjs"

TX_TO_DECRYPT="txhash to decrypt when running decrypt.ts"
```
