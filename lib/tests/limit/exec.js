'use strict'

const { Order } = require('bitfinex-api-node/lib/models')
const { M_FEE, T_FEE } = require('../../config')
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
 * Submit a LIMIT order and verify it is added to the order book & executed by
 * a matching MARKET order, in both directions.
 *
 * @param {Object} args
 * @param {string} args.symbol
 * @param {number} args.amount
 * @param {number} args.initialMid - used as the LIMIT price if the OB is empty
 * @param {number?} args.dataDelay - ms to wait after submit before continuing
 * @return {Object} step
 */
module.exports = ({ symbol, amount, initialMid, dataDelay }) => {
  const {
    genBuy, genMarketBuy, genLimitBuy, genSell, genLimitSell, genMarketSell,
    submitOrder
  } = genOrderUtils(symbol, amount, dataDelay)

  return {
    id: 'limit_exec',
    label: 'submit & verify execution with a MARKET order',
    actors: ['maker', 'taker'],
    before: [
      stepCancelAllOrders(),
      stepRefreshSnapshots()
    ],
    exec: ({ dataM, dataT, wsM, wsT, refreshSnapshots }) => {
      const _mp = dataM.midPrice(symbol)
      const midPrice = _mp === 0 ? initialMid : _mp

      // Taker MARKET orders
      const oBuyT = genMarketBuy()
      const oSellT = genMarketSell()

      // Maker LIMIT orders
      const oSellM = genLimitSell({ price: midPrice * 1.002 })
      const oBuyM = genLimitBuy({ price: midPrice * 1.001 })

      // Submit LIMIT sell order
      return submitOrder(oSellM, wsM, dataM).then(() => {
        assertNotFilled(oSellM)
        assertOrderInserted(oSellM, dataM)
        refreshSnapshots()

        // Submit matching MARKET buy order
        return submitOrder(oBuyT, wsT, dataT)
      }).then(() => {
        dataM.updateOrder(oSellM)

        assertFullyFilled(oSellM)
        assertFullyFilled(oBuyT)
        assertWalletsUpdated(oSellM, dataM, M_FEE)
        assertWalletsUpdated(oBuyT, dataT, T_FEE)
        assertOrderRemoved(oSellM, dataM)
        refreshSnapshots()

        // Submit LIMIT buy order
        return submitOrder(oBuyM, wsM, dataM)
      }).then(() => {
        assertNotFilled(oBuyM)
        assertOrderInserted(oBuyM, dataM)
        refreshSnapshots()

        // Submit matching MARKET sell order
        return submitOrder(oSellT, wsT, dataT)
      }).then(() => {
        dataM.updateOrder(oBuyM)

        assertFullyFilled(oSellT)
        assertFullyFilled(oBuyM)
        assertWalletsUpdated(oBuyM, dataM, M_FEE)
        assertWalletsUpdated(oSellT, dataT, T_FEE)
        assertOrderRemoved(oBuyM, dataM)
        refreshSnapshots()
      })
    }
  }
}
