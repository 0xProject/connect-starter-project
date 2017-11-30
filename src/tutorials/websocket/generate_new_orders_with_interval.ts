import * as Web3 from 'web3';
import BigNumber from 'bignumber.js';
import {setInterval} from 'timers';
import {
    FeesRequest,
    FeesResponse,
    HttpClient,
    Order,
    SignedOrder,
} from '@0xproject/connect';
import {ZeroEx} from '0x.js';

const mainAsync = async () => {
    try {
        const intervalInMs = 3000;
        console.log(`START: sending new orders to relayer every ${intervalInMs / 1000}s`);
        // Provider pointing to local TestRPC on default port 8545
        const provider = new Web3.providers.HttpProvider('http://localhost:8545');

        // Instantiate 0x.js instance
        const zeroEx = new ZeroEx(provider);
        // Instantiate relayer client pointing to a local server on port 3000
        const relayerHttpApiUrl = 'http://localhost:3000';
        const relayerClient = new HttpClient(relayerHttpApiUrl);

        // Get contract addresses
        const WETH_ADDRESS = await zeroEx.etherToken.getContractAddressAsync();
        const ZRX_ADDRESS = await zeroEx.exchange.getZRXTokenAddressAsync();
        const EXCHANGE_ADDRESS = await zeroEx.exchange.getContractAddressAsync();

        // Get token information
        const wethTokenInfo = await zeroEx.tokenRegistry.getTokenIfExistsAsync(WETH_ADDRESS);
        const zrxTokenInfo = await zeroEx.tokenRegistry.getTokenIfExistsAsync(ZRX_ADDRESS);

        // Check if either getTokenIfExistsAsync query resulted in undefined
        if (wethTokenInfo === undefined || zrxTokenInfo === undefined) {
            throw new Error('could not find token info');
        }

        // Get all available addresses
        const addresses = await zeroEx.getAvailableAddressesAsync();

        // Get the first address, this address is preloaded with a ZRX balance from the snapshot
        const zrxOwnerAddress = addresses[0];

        // Set WETH and ZRX unlimited allowances for all addresses
        const setZrxAllowanceTxHashes = await Promise.all(addresses.map(address => {
            return zeroEx.token.setUnlimitedProxyAllowanceAsync(ZRX_ADDRESS, address);
        }));
        const setWethAllowanceTxHashes = await Promise.all(addresses.map(address => {
            return zeroEx.token.setUnlimitedProxyAllowanceAsync(WETH_ADDRESS, address);
        }));
        await Promise.all(setZrxAllowanceTxHashes.concat(setWethAllowanceTxHashes).map(tx => {
            return zeroEx.awaitTransactionMinedAsync(tx);
        }));

        // Send signed order to relayer every 5 seconds, increase the exchange rate every 3 orders
        let exchangeRate = 5; // ZRX/WETH
        let numberOfOrdersSent = 0;
        setInterval(async () => {

            const makerTokenAmount = ZeroEx.toBaseUnitAmount(new BigNumber(5), zrxTokenInfo.decimals);
            const takerTokenAmount = makerTokenAmount.div(exchangeRate).floor();

            // Generate fees request for the order
            const ONE_HOUR_IN_MS = 3600000;
            const feesRequest: FeesRequest = {
                exchangeContractAddress: EXCHANGE_ADDRESS,
                maker: zrxOwnerAddress,
                taker: ZeroEx.NULL_ADDRESS,
                makerTokenAddress: ZRX_ADDRESS,
                takerTokenAddress: WETH_ADDRESS,
                makerTokenAmount,
                takerTokenAmount,
                expirationUnixTimestampSec: new BigNumber(Date.now() + ONE_HOUR_IN_MS),
                salt: ZeroEx.generatePseudoRandomSalt(),
            };

            // Send fees request to relayer and receive a FeesResponse instance
            const feesResponse: FeesResponse = await relayerClient.getFeesAsync(feesRequest);

            // Combine the fees request and response to from a complete order
            const order: Order = {
                ...feesRequest,
                ...feesResponse,
            };

            // Create orderHash
            const orderHash = ZeroEx.getOrderHashHex(order);

            // Sign orderHash and produce a ecSignature
            const ecSignature = await zeroEx.signOrderHashAsync(orderHash, zrxOwnerAddress);

            // Append signature to order
            const signedOrder: SignedOrder = {
                ...order,
                ecSignature,
            };

            // Submit order to relayer
            await relayerClient.submitOrderAsync(signedOrder);
            numberOfOrdersSent++;
            if (numberOfOrdersSent % 3 === 0) {
                exchangeRate++;
            }
            console.log(`SENT ORDER: ${orderHash}`);
        }, intervalInMs);
    } catch (err) {
        console.log(err);
    }
};

mainAsync()
    .catch(err => console.log);
