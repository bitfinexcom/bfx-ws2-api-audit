'use strict'

const assert = require('assert')
const { Order } = require('bitfinex-api-node/lib/models')
const { M_FEE, T_FEE } = require('../../config')
const Promise = require('bluebird')

const genOrderUtils = require('../../util/gen_order')
const delayPromise = require('../../util/delay_promise')
const {
  assertNotFilled, assertFullyFilled, assertWalletsUpdated
} = require('../../assert/order')

const {
  assertOrderInserted, assertOrderRemoved
} = require('../../assert/orderbook')

const stepCancelAllOrders = require('../../steps/cancel_all_orders')
const stepRefreshSnapshots = require('../../steps/refresh_data_snapshots')

/**
 * Submit a LIMIT order with the price above & below the ticker, and verify it
 * is executed immediately at the market price.
 *
 * @param {Object} args
 * @param {string} args.symbol
 * @param {number} args.amount
 * @param {number} args.initialLast - used as the LIMIT price if the OB is empty
 * @param {number} args.dataDelay - ms to wait after submit before continuing
 * @return {Object} step
 */
module.exports = ({ symbol, amount, initialLast, dataDelay }) => {
  const {
    genBuy, genMarketBuy, genLimitBuy, genSell, genLimitSell, genMarketSell,
    submitOrder
  } = genOrderUtils(symbol, amount, dataDelay)

  return {
    id: 'as_market_beyond_ticker',
    label: 'submit above/below ticker & verify immediate execution',
    actors: ['maker', 'taker'],
    before: [
      stepCancelAllOrders(),
      stepRefreshSnapshots()
    ],
    exec: ({ dataM, dataT, wsM, wsT, refreshSnapshots }) => {
      const _last = dataM.lastPrice()
      const lastPrice = _last === 0 ? initialLast : _last

      // Maker LIMIT orders slightly worse than last price
      const oSellM = genLimitSell({ price: lastPrice * 1.01 })
      const oBuyM = genLimitBuy({ price: lastPrice * 0.99 })

      // Taker LIMIT orders, that should exec as MARKET
      const oSellT = genLimitSell({ price: lastPrice * 0.9 })
      const oBuyT = genLimitBuy({ price: lastPrice * 1.1 })

      return Promise.all([
        submitOrder(oSellM, wsM, dataM),
        submitOrder(oBuyM, wsM, dataM)
      ]).then(() => {
        assertNotFilled(oSellM)
        assertNotFilled(oBuyM)
        assertOrderInserted(oSellM, dataM)
        assertOrderInserted(oBuyM, dataM)
        refreshSnapshots()

        return submitOrder(oSellT, wsT, dataT)
      }).then(() => {
        dataM.updateOrder(oBuyM)

        assertFullyFilled(oSellT)
        assertFullyFilled(oBuyM)
        assertWalletsUpdated(oSellT, dataT, T_FEE)
        assertWalletsUpdated(oBuyM, dataM, M_FEE)
        assertOrderRemoved(oBuyM, dataM)
        assert(oSellT.priceAvg === oBuyM.price)

        refreshSnapshots()
      }).then(() => {
        return submitOrder(oBuyT, wsT, dataT)
      }).then(() => {
        dataM.updateOrder(oSellM)

        assertFullyFilled(oBuyT)
        assertFullyFilled(oSellM)
        assertWalletsUpdated(oBuyT, dataT, T_FEE)
        assertWalletsUpdated(oSellM, dataM, M_FEE)
        assertOrderRemoved(oSellM, dataM)
        assert(oBuyT.priceAvg === oSellM.price)

        refreshSnapshots()
      })
    }
  }
}
