import * as Web3 from 'web3';
import {
    OrderbookChannel,
    OrderbookChannelHandler,
    OrderbookChannelSubscriptionOpts,
    OrderbookResponse,
    SignedOrder,
    WebSocketOrderbookChannel,
} from '@0xproject/connect';
import {ZeroEx} from '0x.js';
import {CustomOrderbookChannelHandler} from './custom_orderbook_channel_handler';

const mainAsync = async () => {
    try {
        // Provider pointing to local TestRPC on default port 8545
        const provider = new Web3.providers.HttpProvider('http://localhost:8545');

        // Instantiate 0x.js instance
        const zeroEx = new ZeroEx(provider);

        // Instantiate an orderbook channel pointing to a local server on port 3001
        const relayerWsApiUrl = 'http://localhost:3001';
        const orderbookChannel = new WebSocketOrderbookChannel(relayerWsApiUrl);

        // Get contract addresses
        const WETH_ADDRESS = await zeroEx.etherToken.getContractAddressAsync();
        const ZRX_ADDRESS = await zeroEx.exchange.getZRXTokenAddressAsync();
        const EXCHANGE_ADDRESS = await zeroEx.exchange.getContractAddressAsync();

        // Generate OrderbookChannelSubscriptionOpts for watching the ZRX/WETH orderbook
        const zrxWethSubscriptionOpts: OrderbookChannelSubscriptionOpts = {
            baseTokenAddress: ZRX_ADDRESS,
            quoteTokenAddress: WETH_ADDRESS,
            snapshot: true,
            limit: 20,
        };

        // Create a OrderbookChannelHandler to handle messages from the relayer
        const orderbookChannelHandler: OrderbookChannelHandler = new CustomOrderbookChannelHandler(zeroEx);

        // Subscribe to the relayer
        orderbookChannel.subscribe(zrxWethSubscriptionOpts, orderbookChannelHandler);
        console.log('Listening for ZRX/WETH orderbook...');
    } catch (err) {
        console.log(err);
    }
};

mainAsync()
    .catch(err => console.log);
