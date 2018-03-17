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
  assertOrderInserted, assertOrderRemoved, assertOrderNotInserted,
  assertOrderNotRemoved
} = require('../../assert/orderbook')

const stepCancelAllOrders = require('../../steps/cancel_all_orders')
const stepRefreshSnapshots = require('../../steps/refresh_data_snapshots')

/**
 * Submit a LIMIT order as hidden and verify it isn't inserted into the OB.
 * Then fill it with a matching MARKET order.
 *
 * @param {Object} args
 * @param {string} args.symbol
 * @param {number} args.amount
 * @param {number} args.initialMid - used as the LIMIT price if the OB is empty
 * @param {number} args.dataDelay - ms to wait after submit before continuing
 * @return {Object} step
 */
module.exports = ({ symbol, amount, initialMid, dataDelay }) => {
  const {
    genBuy, genMarketBuy, genLimitBuy, genSell, genLimitSell, genMarketSell,
    submitOrder
  } = genOrderUtils(symbol, amount, dataDelay)

  return {
    id: 'hidden',
    label: 'submit a hidden LIMIT order, check OB, and execute',
    actors: ['maker', 'taker'],
    before: [
      stepCancelAllOrders(),
      stepRefreshSnapshots()
    ],
    exec: ({ dataM, dataT, wsM, wsT, refreshSnapshots }) => {
      const _mp = dataM.midPrice()
      const midPrice = _mp === 0 ? initialMid : _mp

      // Taker MARKET orders
      const oBuyT = genMarketBuy({ price: midPrice * 1.1 })
      const oSellT = genMarketSell({ price: midPrice * 0.9 })

      // Maker LIMIT orders
      const oSellM = genLimitSell({
        price: midPrice * 1.00001,
        hidden: true
      })

      const oBuyM = genLimitBuy({
        price: midPrice * 0.99999,
        hidden: true
      })
 
      // Submit LIMIT sell order
      return submitOrder(oSellM, wsM, dataM).then(() => {
        assertNotFilled(oSellM)
        assertOrderNotInserted(oSellM, dataM)
        refreshSnapshots()

        // Submit matching MARKET buy order
        return submitOrder(oBuyT, wsT, dataT)
      }).then(() => {
        dataM.updateOrder(oSellM)

        assertFullyFilled(oSellM)
        assertFullyFilled(oBuyT)
        assertWalletsUpdated(oSellM, dataM, T_FEE)
        assertWalletsUpdated(oBuyT, dataT, T_FEE)
        assertOrderNotRemoved(oSellM, dataM)
        refreshSnapshots()

        // Submit LIMIT buy order
        return submitOrder(oBuyM, wsM, dataM)
      }).then(() => {
        assertNotFilled(oBuyM)
        assertOrderNotInserted(oBuyM, dataM)
        refreshSnapshots()

        // Submit matching MARKET sell order
        return submitOrder(oSellT, wsT, dataT)
      }).then(() => {
        dataM.updateOrder(oBuyM)

        assertFullyFilled(oSellT)
        assertFullyFilled(oBuyM)
        assertWalletsUpdated(oBuyM, dataM, T_FEE)
        assertWalletsUpdated(oSellT, dataT, T_FEE)
        assertOrderNotRemoved(oBuyM, dataM)
        refreshSnapshots()
      })
    }
  }
}
