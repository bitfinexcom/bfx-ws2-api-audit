'use strict'

const assert = require('assert')
const { Order } = require('bitfinex-api-node/lib/models')
const { M_FEE, T_FEE } = require('../../config')
const Promise = require('bluebird')

const genOrderUtils = require('../../util/gen_order')
const delayPromise = require('../../util/delay_promise')
const {
  assertNotFilled, assertFullyFilled, assertWalletsUpdated, assertCanceled,
  assertNotCanceled
} = require('../../assert/order')

const {
  assertOrderInserted, assertOrderRemoved, assertOrderNotInserted,
  assertOrderNotRemoved
} = require('../../assert/orderbook')

const stepCancelAllOrders = require('../../steps/cancel_all_orders')
const stepRefreshSnapshots = require('../../steps/refresh_data_snapshots')

/**
 * Submits a pair of FOK orders for prices outside of the order book, and
 * confirms they cancel.
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
    submitOrder, genFOKBuy, genFOKSell
  } = genOrderUtils(symbol, amount, dataDelay)

  return {
    id: 'fok_cancel',
    label: 'Submit FOK orders that don\'t match the OB, and verify cancellation',
    actors: ['maker', 'taker'],
    before: [
      stepCancelAllOrders(),
      stepRefreshSnapshots()
    ],
    exec: ({ dataM, dataT, wsM, wsT, refreshSnapshots }) => {
      const _mp = dataM.midPrice(symbol)
      const midPrice = _mp === 0 ? initialMid : _mp

      // Maker orders
      const oSellM = genLimitSell({ price: midPrice * 1.02 })
      const oBuyM = genLimitBuy({ price: midPrice * 1.01 })

      // Taker orders
      const oFOKSellT = genFOKSell({ price: midPrice * 1.1 })
      const oFOKBuyT = genFOKBuy({ price: midPrice * 0.9 })

      // Submit maker orders
      return submitOrder(oSellM, wsM, dataM).then(() => {
        return submitOrder(oBuyM, wsM, dataM)
      }).then(() => {
        dataM.updateOrder(oSellM)

        assertNotFilled(oSellM)
        assertNotFilled(oBuyM)
        assertOrderInserted(oSellM, dataM)
        assertOrderInserted(oBuyM, dataM)

        refreshSnapshots()

        // Submit buy FOK
        return submitOrder(oFOKBuyT, wsT, dataT)
      }).then(() => {
        dataM.updateOrder(oSellM)

        assertNotFilled(oSellM)
        assertNotFilled(oFOKBuyT)
        assertCanceled(oFOKBuyT)

        refreshSnapshots()

        // Submit sell FOK
        return submitOrder(oFOKSellT, wsT, dataT)
      }).then(() => {
        dataM.updateOrder(oBuyM)

        assertNotFilled(oBuyM)
        assertNotFilled(oFOKSellT)
        assertCanceled(oFOKSellT)

        refreshSnapshots()
      })
    }
  }
}
