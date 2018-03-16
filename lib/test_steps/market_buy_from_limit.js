'use strict'

const { Order } = require('bitfinex-api-node/lib/models')
const genOrderUtils = require('../util/gen_order')
const delayPromise = require('../util/delay_promise')
const {
  assertNotFilled, assertFullyFilled, assertWalletsUpdated
} = require('../assert/order')

const {
  assertOrderInserted, assertOrderRemoved
} = require('../assert/orderbook')

module.exports = (symbol, amount, initialMid, dataDelay) => {
  const { genBuy, genSell } = genOrderUtils(symbol, amount)

  return {
    id: 'test_market_buy',
    label: 'try to buy from a LIMIT (sell) order with a MARKET (buy) order',
    exec: ({ dataM, dataT, wsM, wsT }) => {
      const _mp = dataM.midPrice()
      const midPrice = _mp === 0 ? initialMid : _mp
      const oBuyT = genBuy({ type: Order.type.EXCHANGE_MARKET })
      const oSellM = genSell({
        type: Order.type.EXCHANGE_LIMIT,
        price: midPrice
      })

      dataM.updateOrderBookSnapshot()
      dataT.updateOrderBookSnapshot()

      // Submit LIMIT sell order
      return delayPromise(wsM.submitOrder(oSellM), dataDelay).then(() => {
        dataM.updateOrder(oSellM)

        assertNotFilled(oSellM)
        assertOrderInserted(oSellM, dataM)

        dataM.updateOrderBookSnapshot()

        // Submit matching MARKET buy order
        return delayPromise(wsT.submitOrder(oBuyT), dataDelay)
      }).then(() => {
        dataT.updateOrder(oBuyT)
        dataM.updateOrder(oSellM)

        assertFullyFilled(oSellM)
        assertFullyFilled(oBuyT)
        assertWalletsUpdated(oSellM, dataM)
        assertWalletsUpdated(oBuyT, dataT)
        assertOrderRemoved(oSellM, dataM)

        dataM.updateOrderBookSnapshot()
        dataT.refreshWalletSnapshot()
        dataM.refreshWalletSnapshot()
      })
    }
  }
}
