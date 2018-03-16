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
    id: 'test_market_sell',
    label: 'try to sell to a LIMIT (buy) order with a MARKET (sell) order',
    exec: ({ dataM, dataT, wsM, wsT }) => {
      const _mp = dataM.midPrice()
      const midPrice = _mp === 0 ? initialMid : _mp
      const oSellT = genSell({ type: Order.type.EXCHANGE_MARKET })
      const oBuyM = genBuy({
        type: Order.type.EXCHANGE_LIMIT,
        price: midPrice
      })

      dataM.updateOrderBookSnapshot()
      dataT.updateOrderBookSnapshot()

      // Submit LIMIT buy order
      return delayPromise(wsM.submitOrder(oBuyM), dataDelay).then(() => {
        dataM.updateOrder(oBuyM)

        assertNotFilled(oBuyM)
        assertOrderInserted(oBuyM, dataM)

        dataM.updateOrderBookSnapshot()

        // Submit matching MARKET sell order
        return delayPromise(wsT.submitOrder(oSellT), dataDelay)
      }).then(() => {
        dataT.updateOrder(oSellT)
        dataM.updateOrder(oBuyM)

        assertFullyFilled(oSellT)
        assertFullyFilled(oBuyM)
        assertWalletsUpdated(oSellT, dataT)
        assertWalletsUpdated(oBuyM, dataM)
        assertOrderRemoved(oBuyM, dataM)

        dataM.updateOrderBookSnapshot()
        dataT.refreshWalletSnapshot()
        dataM.refreshWalletSnapshot()
      })
    }
  }
}
