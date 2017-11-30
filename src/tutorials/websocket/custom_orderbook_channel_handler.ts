import BigNumber from 'bignumber.js';
import {
    OrderbookChannel,
    OrderbookChannelHandler,
    OrderbookChannelSubscriptionOpts,
    OrderbookResponse,
    SignedOrder,
    WebSocketOrderbookChannel,
} from '@0xproject/connect';
import {ZeroEx} from '0x.js';

export class CustomOrderbookChannelHandler implements OrderbookChannelHandler  {
    private zeroEx: ZeroEx;
    constructor(zeroEx: ZeroEx) {
        this.zeroEx = zeroEx;
    }
    public onSnapshot(channel: OrderbookChannel, subscriptionOpts: OrderbookChannelSubscriptionOpts,
                      snapshot: OrderbookResponse) {
        // Log number of bids and asks currently in the orderbook
        const numberOfBids = snapshot.bids.length;
        const numberOfAsks = snapshot.asks.length;
        console.log(`SNAPSHOT: ${numberOfBids} bids & ${numberOfAsks} asks`);
    }
    public async onUpdate(channel: OrderbookChannel, subscriptionOpts: OrderbookChannelSubscriptionOpts,
                          order: SignedOrder) {
        // Log order hash
        const orderHash = ZeroEx.getOrderHashHex(order);
        console.log(`NEW ORDER: ${orderHash}`);

        // Look for asks
        if (order.makerTokenAddress === subscriptionOpts.baseTokenAddress) {
            // Calculate the rate of the new order
            const zrxWethRate = order.makerTokenAmount.div(order.takerTokenAmount);
            // If the rate is equal to our better than the rate we are looking for, try and fill it
            const TARGET_RATE = 6; // ZRX/WETH
            if (zrxWethRate.greaterThanOrEqualTo(TARGET_RATE)) {
                const addresses = await this.zeroEx.getAvailableAddressesAsync();
                // This can be any available address of you're choosing, in this example addresses[0] is actually
                // creating and signing the new orders we're receiving so we need to fill the order with
                // a different address
                const takerAddress = addresses[1];
                const txHash = await this.zeroEx.exchange.fillOrderAsync(
                    order, order.takerTokenAmount, true, takerAddress);
                await this.zeroEx.awaitTransactionMinedAsync(txHash);
                console.log(`ORDER FILLED: ${orderHash}`);
            }
        }
    }
    public onError(channel: OrderbookChannel, subscriptionOpts: OrderbookChannelSubscriptionOpts,
                   err: Error) {
        // Log error
        console.log(`ERROR: ${err}`);
    }
    public onClose(channel: OrderbookChannel, subscriptionOpts: OrderbookChannelSubscriptionOpts) {
        // Log close
        console.log('CLOSE');
    }
}
