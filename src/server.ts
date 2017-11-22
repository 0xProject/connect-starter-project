import * as express from 'express';
import * as bodyParser from 'body-parser';
import BigNumber from 'bignumber.js';
import {ZeroEx} from '0x.js';

interface Order {
    makerTokenAddress: string;
    takerTokenAddress: string;
}

const app = express();
app.use(bodyParser.json());
const orders: Order[] = [];

app.get('/v0/orderbook', (req, res) => {
    console.log('GET orderbook');
    const baseTokenAddress = req.param('baseTokenAddress');
    const quoteTokenAddress = req.param('quoteTokenAddress');
    const bids = orders.filter(order => {
        return (order.takerTokenAddress === baseTokenAddress) &&
               (order.makerTokenAddress === quoteTokenAddress);
    });
    const asks = orders.filter(order => {
        return (order.takerTokenAddress === quoteTokenAddress) &&
               (order.makerTokenAddress === baseTokenAddress);
    });
    res.status(201).send({
        bids,
        asks,
    });
});

app.post('/v0/order', (req, res) => {
    console.log('POST order');
    orders.push(req.body);
    res.status(201).send({});
});

app.post('/v0/fees', (req, res) => {
    console.log('POST fees');
    const makerFee = new BigNumber(0).toString();
    const takerFee = ZeroEx.toBaseUnitAmount(new BigNumber(10), 18).toString();
    res.status(201).send({
        feeRecipient: ZeroEx.NULL_ADDRESS,
        makerFee,
        takerFee,
    });
});

app.listen(3000, () => console.log('Standard relayer API listening on port 3000!'));
