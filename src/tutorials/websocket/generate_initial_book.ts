import * as Web3 from 'web3';
import BigNumber from 'bignumber.js';
import {
    FeesRequest,
    FeesResponse,
    HttpClient,
    Order,
    SignedOrder,
} from '@0xproject/connect';
import {
    ZeroEx,
    ZeroExConfig,
} from '0x.js';

const mainAsync = async () => {
    try {
        // Provider pointing to local TestRPC on default port 8545
        const provider = new Web3.providers.HttpProvider('http://localhost:8545');

        // Instantiate 0x.js instance
        const zeroExConfig: ZeroExConfig = {
            networkId: 50, // testrpc
        };
        const zeroEx = new ZeroEx(provider, zeroExConfig);
        // Instantiate relayer client pointing to a local server on port 3000
        const relayerHttpApiUrl = 'http://localhost:3000/v0';
        const relayerClient = new HttpClient(relayerHttpApiUrl);

        // Get exchange contract address
        const EXCHANGE_ADDRESS = await zeroEx.exchange.getContractAddress();

        // Get token information
        const wethTokenInfo = await zeroEx.tokenRegistry.getTokenBySymbolIfExistsAsync('WETH');
        const zrxTokenInfo = await zeroEx.tokenRegistry.getTokenBySymbolIfExistsAsync('ZRX');

        // Check if either getTokenBySymbolIfExistsAsync query resulted in undefined
        if (wethTokenInfo === undefined || zrxTokenInfo === undefined) {
            throw new Error('could not find token info');
        }

        // Get token contract addresses
        const WETH_ADDRESS = wethTokenInfo.address;
        const ZRX_ADDRESS = zrxTokenInfo.address;

        // Get all available addresses
        const addresses = await zeroEx.getAvailableAddressesAsync();

        // Get the first address, this address is preloaded with a ZRX balance from the snapshot
        const zrxOwnerAddress = addresses[0];

        // Assign other addresses as WETH owners
        const wethOwnerAddresses = addresses.slice(1);

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

        // Send 1000 ZRX from zrxOwner to all other addresses
        await Promise.all(wethOwnerAddresses.map(async (address, index) => {
            const zrxToTransfer =  ZeroEx.toBaseUnitAmount(new BigNumber(1000), zrxTokenInfo.decimals);
            const txHash = await zeroEx.token.transferAsync(ZRX_ADDRESS, zrxOwnerAddress, address, zrxToTransfer);
            return zeroEx.awaitTransactionMinedAsync(txHash);
        }));

        // Deposit ETH and generate WETH tokens for each address in wethOwnerAddresses
        const ethToConvert = ZeroEx.toBaseUnitAmount(new BigNumber(5), wethTokenInfo.decimals);
        const depositTxHashes = await Promise.all(wethOwnerAddresses.map(address => {
            return zeroEx.etherToken.depositAsync(WETH_ADDRESS, ethToConvert, address);
        }));
        await Promise.all(depositTxHashes.map(tx => {
            return zeroEx.awaitTransactionMinedAsync(tx);
        }));

        // Generate and submit orders with increasing ZRX/WETH exchange rate
        await Promise.all(wethOwnerAddresses.map(async (address, index) => {
            // Programmatically determine the exchange rate based on the index of address in wethOwnerAddresses
            const exchangeRate = (index + 1) * 10; // ZRX/WETH
            const makerTokenAmount = ZeroEx.toBaseUnitAmount(new BigNumber(5), wethTokenInfo.decimals);
            const takerTokenAmount = makerTokenAmount.mul(exchangeRate);

            // Generate fees request for the order
            const ONE_HOUR_IN_MS = 3600000;
            const feesRequest: FeesRequest = {
                exchangeContractAddress: EXCHANGE_ADDRESS,
                maker: address,
                taker: ZeroEx.NULL_ADDRESS,
                makerTokenAddress: WETH_ADDRESS,
                takerTokenAddress: ZRX_ADDRESS,
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
            const ecSignature = await zeroEx.signOrderHashAsync(orderHash, address, false);

            // Append signature to order
            const signedOrder: SignedOrder = {
                ...order,
                ecSignature,
            };

            // Submit order to relayer
            await relayerClient.submitOrderAsync(signedOrder);
        }));

        // Generate and submit orders with flat WETH/ZRX exchange rate
        await Promise.all(wethOwnerAddresses.map(async (address, index) => {
            const makerTokenAmount = ZeroEx.toBaseUnitAmount(new BigNumber(5), wethTokenInfo.decimals);
            const takerTokenAmount = ZeroEx.toBaseUnitAmount(new BigNumber(1), wethTokenInfo.decimals);

            // Generate fees request for the order
            const ONE_HOUR_IN_MS = 3600000;
            const feesRequest: FeesRequest = {
                exchangeContractAddress: EXCHANGE_ADDRESS,
                maker: address,
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
            const ecSignature = await zeroEx.signOrderHashAsync(orderHash, address, false);

            // Append signature to order
            const signedOrder: SignedOrder = {
                ...order,
                ecSignature,
            };

            // Submit order to relayer
            await relayerClient.submitOrderAsync(signedOrder);
        }));
    } catch (err) {
        console.log(err);
    }
};

mainAsync()
    .catch(err => console.log);
