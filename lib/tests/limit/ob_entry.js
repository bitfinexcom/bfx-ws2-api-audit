'use strict'

const { Order } = require('bitfinex-api-node/lib/models')
const Promise = require('bluebird')

const genOrderUtils = require('../../util/gen_order')
const delayPromise = require('../../util/delay_promise')
const { assertNotFilled } = require('../../assert/order')

const {
  assertOrderInserted, assertOrderRemoved
} = require('../../assert/orderbook')

const stepCancelAllOrders = require('../../steps/cancel_all_orders')
const stepRefreshSnapshots = require('../../steps/refresh_data_snapshots')

/**
 * Submit a LIMIT order and verify it is added to the order book
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
    id: 'limit_ob_entry',
    label: 'submit & verify entry into order book',
    actors: ['maker'],
    before: [
      stepCancelAllOrders(),
      stepRefreshSnapshots()
    ],
    exec: ({ dataM, wsM, refreshSnapshots }) => {
      const _mp = dataM.midPrice(symbol)
      const midPrice = _mp === 0 ? initialMid : _mp

      // Maker LIMIT orders
      const oSellM = genLimitSell({ price: midPrice * 1.002})
      const oBuyM = genLimitBuy({ price: midPrice * 1.001 })

      return Promise.all([
        submitOrder(oSellM, wsM, dataM),
        submitOrder(oBuyM, wsM, dataM)
      ]).then(() => {
        assertNotFilled(oSellM)
        assertNotFilled(oBuyM)
        assertOrderInserted(oSellM, dataM)
        assertOrderInserted(oBuyM, dataM)
        refreshSnapshots()

        return dataM.cancelAllOpenOrders(dataDelay)
      }).then(() => {
        assertOrderRemoved(oSellM, dataM)
        assertOrderRemoved(oBuyM, dataM)
      })
    }
  }
}
